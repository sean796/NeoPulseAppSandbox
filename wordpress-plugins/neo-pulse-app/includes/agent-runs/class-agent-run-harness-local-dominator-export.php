<?php
/**
 * Server-side Local Dominator grid export harness (tick-based orchestrator).
 *
 * @package Neo_Pulse_App
 */

defined( 'ABSPATH' ) || exit;

class Neo_Pulse_App_Agent_Run_Harness_Local_Dominator_Export {

	/**
	 * @param array<string,mixed> $run
	 */
	public static function tick( int $team_id, array $run ): void {
		$run_id = (int) ( $run['id'] ?? 0 );
		if ( $run_id <= 0 ) {
			return;
		}

		$plan              = is_array( $run['plan'] ?? null ) ? $run['plan'] : array();
		$execution_payload = is_array( $plan['executionPayload'] ?? null ) ? $plan['executionPayload'] : array();
		$contract          = is_array( $plan['clientRunContract'] ?? null ) ? $plan['clientRunContract'] : array();
		$contract          = array_merge( $execution_payload, $contract );
		$result            = is_array( $run['result'] ?? null ) ? $run['result'] : array();
		$checkpoint        = is_array( $result['checkpoint'] ?? null ) ? $result['checkpoint'] : array();
		$server            = is_array( $checkpoint['server'] ?? null ) ? $checkpoint['server'] : array();
		$phase             = sanitize_key( (string) ( $server['orchestratorPhase'] ?? 'preflight' ) );

		$context = is_array( $run['context'] ?? null ) ? $run['context'] : array();
		$site_id = trim( (string) ( $contract['siteId'] ?? $context['siteId'] ?? '' ) );
		$site    = $site_id !== '' ? Neo_Pulse_App_Task_Execution_Site_Resolver::resolve_by_id( $site_id ) : null;

		$business_name = trim( (string) ( $contract['businessName'] ?? '' ) );
		if ( $business_name === '' && is_array( $site ) ) {
			$business_name = trim( (string) ( $site['name'] ?? '' ) );
		}
		$business_name = Neo_Pulse_App_Local_Dominator_Export::normalize_business_name( $business_name );
		if ( $business_name === '' ) {
			throw new Exception( 'businessName is required for Local Dominator export.' );
		}

		$keyword = trim( (string) ( $contract['keyword'] ?? '' ) );
		if ( strtolower( $keyword ) === 'auto' ) {
			$keyword = '';
		}

		switch ( $phase ) {
			case 'preflight':
				self::step( $team_id, $run_id, 'preflight', 'Preflight', 'done' );
				self::step( $team_id, $run_id, 'grid_export', 'Export grid CSV', 'running' );
				$server['orchestratorPhase'] = 'worker_dispatch';
				self::save_checkpoint( $team_id, $run_id, $result, $checkpoint, $server );
				return;

			case 'worker_dispatch':
				self::step( $team_id, $run_id, 'worker', 'Starting Local Dominator export worker…', 'running' );
				$started = Neo_Pulse_App_Local_Dominator_Export::start_export_job_from_body(
					array(
						'businessName' => $business_name,
						'keyword'      => $keyword,
					)
				);
				if ( empty( $started['ok'] ) || empty( $started['jobId'] ) ) {
					$error = ! empty( $started['error'] )
						? (string) $started['error']
						: 'Could not start Local Dominator export worker job.';
					if ( self::is_worker_transport_error( $error ) ) {
						return;
					}
					throw new Exception( $error );
				}
				$server['workerJobId']       = (string) $started['jobId'];
				$server['orchestratorPhase'] = 'worker_poll';
				self::step( $team_id, $run_id, 'worker', 'Exporting grid CSV…', 'running' );
				self::save_checkpoint( $team_id, $run_id, $result, $checkpoint, $server );
				return;

			case 'worker_poll':
				$job_id = trim( (string) ( $server['workerJobId'] ?? '' ) );
				if ( $job_id === '' ) {
					throw new Exception( 'Local Dominator export worker job id is missing.' );
				}
				$progress = Neo_Pulse_App_Local_Dominator_Export::read_job_progress( $job_id );
				if ( empty( $progress['ok'] ) ) {
					$error = ! empty( $progress['error'] )
						? (string) $progress['error']
						: 'Local Dominator export progress check failed.';
					// "Job not found" is the ephemeral worker job file after cleanup — not the
					// Local Dominator business. Never fail the agent run for that race.
					if ( self::is_job_missing_race( $error ) ) {
						if ( self::recover_if_grid_already_saved( $team_id, $run_id, $run, $business_name, $keyword, $job_id ) ) {
							return;
						}
						return;
					}
					if ( self::is_worker_transport_error( $error ) ) {
						return;
					}
					throw new Exception( $error );
				}
				$status = sanitize_key( (string) ( $progress['status'] ?? 'running' ) );
				$label  = trim( (string) ( $progress['label'] ?? 'Exporting grid CSV…' ) );
				if ( $label !== '' ) {
					self::step( $team_id, $run_id, 'worker', $label, 'running' );
				}
				if ( $status === 'running' ) {
					self::save_checkpoint( $team_id, $run_id, $result, $checkpoint, $server );
					return;
				}
				if ( $status === 'error' ) {
					throw new Exception(
						! empty( $progress['error'] )
							? (string) $progress['error']
							: 'Local Dominator export failed.'
					);
				}
				$export_result = is_array( $progress['result'] ?? null ) ? $progress['result'] : array();
				self::finalize_export( $team_id, $run_id, $run, $export_result, $business_name, $keyword, $job_id );
				return;

			case 'done':
				return;

			default:
				throw new Exception( 'Unknown Local Dominator orchestrator phase: ' . $phase );
		}
	}

	/**
	 * @param array<string,mixed> $run
	 * @param array<string,mixed> $export_result
	 */
	private static function finalize_export(
		int $team_id,
		int $run_id,
		array $run,
		array $export_result,
		string $business_name,
		string $keyword,
		string $job_id = ''
	): void {
		$csv_base64 = (string) ( $export_result['csvBase64'] ?? '' );
		$file_name  = sanitize_file_name( (string) ( $export_result['fileName'] ?? 'grid-export.csv' ) );
		if ( $csv_base64 === '' ) {
			throw new Exception(
				! empty( $export_result['error'] )
					? (string) $export_result['error']
					: 'Local Dominator export returned no CSV.'
			);
		}
		$csv_content = base64_decode( $csv_base64, true );
		if ( ! is_string( $csv_content ) || $csv_content === '' ) {
			throw new Exception( 'Local Dominator export CSV decode failed.' );
		}

		$saved = Neo_Pulse_App_Agent_Runs_Artifacts::save_artifact(
			$team_id,
			$run_id,
			array(
				'stepKey' => 'grid_export',
				'name'    => $file_name,
				'mime'    => 'text/csv',
				'content' => $csv_content,
			)
		);
		if ( empty( $saved['ok'] ) || empty( $saved['artifact']['url'] ) ) {
			throw new Exception( 'Could not save grid export CSV to run archive.' );
		}

		$artifact_url = (string) $saved['artifact']['url'];
		$fresh        = Neo_Pulse_App_Agent_Runs_Store::get_run( $team_id, $run_id, true );

		Neo_Pulse_App_Agent_Runs_Store::patch_run(
			$team_id,
			$run_id,
			array(
				'status'       => 'done',
				'errorMessage' => '',
				'step'         => array(
					'stepKey' => 'complete',
					'label'   => 'Exported Local Dominator grid for ' . $business_name,
					'status'  => 'done',
				),
				'result'       => array(
					'updated'       => 1,
					'message'       => 'Exported Local Dominator grid for ' . $business_name,
					'executionMode' => 'server',
					'businessName'  => $business_name,
					'keyword'       => $keyword,
					'fileName'      => $file_name,
					'checkpoint'    => array(
						'server' => array(
							'orchestratorPhase' => 'done',
							'phase'             => 'done',
						),
					),
				),
			)
		);

		if ( $job_id !== '' ) {
			Neo_Pulse_App_Local_Dominator_Export::cleanup_job_after_finalize( $job_id );
		}

		$execution_id = (int) ( $run['plan']['taskExecutionId'] ?? 0 );
		if ( $execution_id > 0 ) {
			Neo_Pulse_App_Task_Execution_Coordinator::complete(
				$team_id,
				$execution_id,
				array(
					'ok'         => true,
					'agentRunId' => $run_id,
					'result'     => array(
						'businessName' => $business_name,
						'keyword'      => $keyword,
						'fileName'     => $file_name,
					),
				)
			);
		}

		if ( $fresh && class_exists( 'Neo_Pulse_App_Agent_Run_Worker_Cron' ) ) {
			Neo_Pulse_App_Agent_Run_Worker_Cron::kick();
		}
	}

	private static function is_worker_transport_error( string $message ): bool {
		$lower = strtolower( $message );
		return str_contains( $lower, 'timed out' )
			|| str_contains( $lower, 'connection refused' )
			|| str_contains( $lower, 'could not resolve' )
			|| str_contains( $lower, 'failed to connect' )
			|| str_contains( $lower, 'not configured' );
	}

	private static function is_job_missing_race( string $message ): bool {
		$lower = strtolower( $message );
		return str_contains( $lower, 'job not found' )
			|| str_contains( $lower, 'already cleaned up' );
	}

	/**
	 * Concurrent poll after finalize deleted worker files. If the CSV is already archived, mark done.
	 *
	 * @param array<string,mixed> $run
	 */
	private static function recover_if_grid_already_saved(
		int $team_id,
		int $run_id,
		array $run,
		string $business_name,
		string $keyword,
		string $job_id
	): bool {
		$fresh = Neo_Pulse_App_Agent_Runs_Store::get_run( $team_id, $run_id, false );
		if ( ! is_array( $fresh ) ) {
			return false;
		}
		if ( (string) ( $fresh['status'] ?? '' ) === 'done' ) {
			return true;
		}

		$fresh_result = is_array( $fresh['result'] ?? null ) ? $fresh['result'] : array();
		if ( ! empty( $fresh_result['fileName'] ) || ! empty( $fresh_result['message'] ) ) {
			Neo_Pulse_App_Agent_Runs_Store::patch_run(
				$team_id,
				$run_id,
				array(
					'status'       => 'done',
					'errorMessage' => '',
				)
			);
			return true;
		}

		$artifact = null;
		foreach ( Neo_Pulse_App_Agent_Runs_Artifacts::list_artifacts( $run_id ) as $item ) {
			if ( ! is_array( $item ) ) {
				continue;
			}
			if ( sanitize_key( (string) ( $item['stepKey'] ?? '' ) ) !== 'grid_export' ) {
				continue;
			}
			if ( trim( (string) ( $item['url'] ?? '' ) ) === '' ) {
				continue;
			}
			$artifact = $item;
			break;
		}
		if ( ! $artifact ) {
			return false;
		}

		$file_name = sanitize_file_name( (string) ( $artifact['name'] ?? 'grid-export.csv' ) );
		Neo_Pulse_App_Agent_Runs_Store::patch_run(
			$team_id,
			$run_id,
			array(
				'status'       => 'done',
				'errorMessage' => '',
				'step'         => array(
					'stepKey' => 'complete',
					'label'   => 'Exported Local Dominator grid for ' . $business_name,
					'status'  => 'done',
				),
				'result'       => array(
					'updated'       => 1,
					'message'       => 'Exported Local Dominator grid for ' . $business_name,
					'executionMode' => 'server',
					'businessName'  => $business_name,
					'keyword'       => $keyword,
					'fileName'      => $file_name,
					'checkpoint'    => array(
						'server' => array(
							'orchestratorPhase' => 'done',
							'phase'             => 'done',
						),
					),
				),
			)
		);

		if ( $job_id !== '' ) {
			Neo_Pulse_App_Local_Dominator_Export::cleanup_job_after_finalize( $job_id );
		}

		if ( class_exists( 'Neo_Pulse_App_Agent_Run_Worker_Cron' ) ) {
			Neo_Pulse_App_Agent_Run_Worker_Cron::kick();
		}

		return true;
	}

	/**
	 * @param array<string,mixed> $result
	 * @param array<string,mixed> $checkpoint
	 * @param array<string,mixed> $server
	 */
	private static function save_checkpoint( int $team_id, int $run_id, array $result, array $checkpoint, array $server ): void {
		$checkpoint['server']    = $server;
		$result['checkpoint']    = $checkpoint;
		$result['executionMode'] = 'server';
		Neo_Pulse_App_Agent_Runs_Store::patch_run(
			$team_id,
			$run_id,
			array( 'result' => $result )
		);
	}

	private static function step(
		int $team_id,
		int $run_id,
		string $step_key,
		string $label,
		string $status
	): void {
		Neo_Pulse_App_Agent_Runs_Store::patch_run(
			$team_id,
			$run_id,
			array(
				'step' => array(
					'stepKey' => $step_key,
					'label'   => $label,
					'status'  => $status,
				),
				'result' => array(
					'checkpoint' => array(
						'lastStepAt'    => gmdate( 'Y-m-d H:i:s' ),
						'lastStepLabel' => $label,
					),
				),
			)
		);
	}
}
