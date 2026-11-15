<?php
/**
 * Server-side post creator harness (tick-based orchestrator; generation runs on Node worker).
 *
 * @package Neo_Pulse_App
 */

defined( 'ABSPATH' ) || exit;

class Neo_Pulse_App_Agent_Run_Harness_Post_Creator {

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
		$phase             = self::orchestrator_phase( $server );

		$site_id = trim( (string) ( $contract['siteId'] ?? $run['context']['siteId'] ?? '' ) );
		$site    = $site_id !== '' ? Neo_Pulse_App_Task_Execution_Site_Resolver::resolve_by_id( $site_id ) : null;
		$plan_site = isset( $plan['site'] ) && is_array( $plan['site'] ) ? $plan['site'] : null;
		if ( is_array( $plan_site ) ) {
			$site = is_array( $site ) ? array_merge( $site, $plan_site ) : $plan_site;
		}
		if ( ! is_array( $site ) || trim( (string) ( $site['siteUrl'] ?? '' ) ) === '' ) {
			throw new Exception( 'WordPress site not found for server post creator run.' );
		}
		if ( trim( (string) ( $site['username'] ?? '' ) ) === '' || trim( (string) ( $site['appPassword'] ?? '' ) ) === '' ) {
			throw new Exception( 'WordPress site credentials missing on post creator task.' );
		}

		switch ( $phase ) {
			case 'preflight':
				self::step( $team_id, $run_id, 'preflight', 'Preflight', 'done' );
				$server['orchestratorPhase'] = 'content_bucket';
				self::save_checkpoint( $team_id, $run_id, $result, $checkpoint, $server );
				return;

			case 'content_bucket':
				self::step( $team_id, $run_id, 'content-bucket', 'Loading content bucket…', 'running' );
				$inventory   = Neo_Pulse_App_Agent_Run_Post_Creator_Inventory::load_posts_bucket(
					$site,
					Neo_Pulse_App_Agent_Run_Post_Creator_Inventory::BUCKET_LIMIT
				);
				$bucket_name = Neo_Pulse_App_Agent_Run_Post_Creator_Inventory::bucket_artifact_name( $site );
				$saved       = Neo_Pulse_App_Agent_Runs_Artifacts::save_artifact(
					$team_id,
					$run_id,
					array(
						'stepKey' => 'content-bucket',
						'name'    => $bucket_name,
						'mime'    => 'application/json',
						'content' => $inventory['json'],
					)
				);
				if ( empty( $saved['ok'] ) ) {
					throw new Exception( 'Could not save content bucket artifact.' );
				}
				$bucket_payload = array();
				if ( ! empty( $saved['artifact'] ) && is_array( $saved['artifact'] ) ) {
					$bucket_payload['artifacts'] = array( $saved['artifact'] );
				}

				$kw_bundle = Neo_Pulse_App_Agent_Run_Gsc_Kw_Inventory::build_site_kw_json( $site );
				$kw_saved  = Neo_Pulse_App_Agent_Runs_Artifacts::save_artifact(
					$team_id,
					$run_id,
					array(
						'stepKey' => 'content-bucket',
						'name'    => $kw_bundle['name'],
						'mime'    => 'application/json',
						'content' => $kw_bundle['json'],
					)
				);
				if ( ! empty( $kw_saved['artifact'] ) && is_array( $kw_saved['artifact'] ) ) {
					$bucket_payload['artifacts'][] = $kw_saved['artifact'];
				}

				self::step(
					$team_id,
					$run_id,
					'content-bucket',
					count( $inventory['urls'] ) . ' post URLs loaded, KW JSON (' . $kw_bundle['rowCount'] . ' keywords)',
					'done',
					$bucket_payload
				);
				$server['orchestratorPhase']       = 'worker_dispatch';
				$server['preflightBucketJson']   = $inventory['json'];
				$server['preflightSiteKwJson']   = $kw_bundle['json'];
				self::save_checkpoint( $team_id, $run_id, $result, $checkpoint, $server );
				return;

			case 'worker_dispatch':
				self::step( $team_id, $run_id, 'worker', 'Starting generator worker…', 'running' );
				$user_id = (int) ( $run['createdBy'] ?? 0 );
				if ( $user_id <= 0 ) {
					throw new Exception( 'Post creator run has no createdBy user for worker auth.' );
				}
				$started = Neo_Pulse_App_Agent_Run_Post_Creator_Worker::start_job(
					$team_id,
					$user_id,
					$run,
					$site,
					$contract,
					$checkpoint
				);
				if ( empty( $started['ok'] ) || empty( $started['jobId'] ) ) {
					$error = ! empty( $started['error'] )
						? (string) $started['error']
						: 'Could not start post creator worker job.';
					if ( self::is_worker_transport_error( $error ) ) {
						self::step( $team_id, $run_id, 'worker', 'Starting generator worker…', 'running' );
						return;
					}
					throw new Exception( $error );
				}
				$server['workerJobId']         = (string) $started['jobId'];
				$server['orchestratorPhase']   = 'worker_poll';
				self::step( $team_id, $run_id, 'worker', 'Generator worker running…', 'running' );
				self::save_checkpoint( $team_id, $run_id, $result, $checkpoint, $server );
				return;

			case 'worker_poll':
				$job_id = trim( (string) ( $server['workerJobId'] ?? '' ) );
				if ( $job_id === '' ) {
					throw new Exception( 'Post creator worker job id is missing.' );
				}
				$progress = Neo_Pulse_App_Agent_Run_Post_Creator_Worker::read_job_progress( $job_id );
				if ( empty( $progress['ok'] ) ) {
					$error = ! empty( $progress['error'] )
						? (string) $progress['error']
						: 'Post creator worker progress check failed.';
					if ( self::is_worker_transport_error( $error ) ) {
						self::step( $team_id, $run_id, 'worker', 'Generator worker running…', 'running' );
						return;
					}
					throw new Exception( $error );
				}
				$status = sanitize_key( (string) ( $progress['status'] ?? 'running' ) );
				$label  = trim( (string) ( $progress['label'] ?? 'Generator worker running…' ) );
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
							: 'Post creator worker job failed.'
					);
				}
				self::finish_run( $team_id, $run_id, $run );
				return;

			case 'done':
				return;

			default:
				throw new Exception( 'Unknown post creator orchestrator phase: ' . $phase );
		}
	}

	/**
	 * Orchestrator phase is owned by PHP only. Node worker progress uses workerPhase.
	 *
	 * @param array<string,mixed> $server
	 */
	private static function orchestrator_phase( array $server ): string {
		if ( ! empty( $server['orchestratorPhase'] ) ) {
			return sanitize_key( (string) $server['orchestratorPhase'] );
		}
		$legacy = sanitize_key( (string) ( $server['phase'] ?? 'preflight' ) );
		if ( in_array( $legacy, array( 'bulk', 'ideation', 'worker' ), true ) ) {
			return 'worker_poll';
		}
		return $legacy;
	}

	private static function is_worker_transport_error( string $message ): bool {
		$lower = strtolower( $message );
		return str_contains( $lower, 'timed out' )
			|| str_contains( $lower, 'connection refused' )
			|| str_contains( $lower, 'could not resolve' )
			|| str_contains( $lower, 'failed to connect' );
	}

	/**
	 * @param array<string,mixed> $result
	 * @param array<string,mixed> $checkpoint
	 * @param array<string,mixed> $server
	 */
	private static function save_checkpoint( int $team_id, int $run_id, array $result, array $checkpoint, array $server ): void {
		$checkpoint['server']    = $server;
		$result['checkpoint']  = $checkpoint;
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
		string $status,
		array $payload = array()
	): void {
		$step = array(
			'stepKey' => $step_key,
			'label'   => $label,
			'status'  => $status,
		);
		if ( ! empty( $payload ) ) {
			$step['payload'] = $payload;
		}
		Neo_Pulse_App_Agent_Runs_Store::patch_run(
			$team_id,
			$run_id,
			array(
				'step'   => $step,
				'result' => array(
					'checkpoint' => array(
						'lastStepAt' => gmdate( 'Y-m-d H:i:s' ),
					),
				),
			)
		);
	}

	/**
	 * @param array<string,mixed> $run
	 */
	private static function finish_run( int $team_id, int $run_id, array $run ): void {
		$fresh = Neo_Pulse_App_Agent_Runs_Store::get_run( $team_id, $run_id, true );
		if ( ! $fresh ) {
			return;
		}
		$result = is_array( $fresh['result'] ?? null ) ? $fresh['result'] : array();
		if ( sanitize_key( (string) ( $fresh['status'] ?? '' ) ) === 'done' ) {
			$server = is_array( $result['checkpoint']['server'] ?? null ) ? $result['checkpoint']['server'] : array();
			$server['phase'] = 'done';
			$server['orchestratorPhase'] = 'done';
			$result['checkpoint']['server'] = $server;
			Neo_Pulse_App_Agent_Runs_Store::patch_run(
				$team_id,
				$run_id,
				array( 'result' => $result )
			);
		} elseif ( sanitize_key( (string) ( $fresh['status'] ?? '' ) ) !== 'failed' ) {
			Neo_Pulse_App_Agent_Runs_Store::patch_run(
				$team_id,
				$run_id,
				array(
					'status' => 'done',
					'step'   => array(
						'stepKey' => 'complete',
						'label'   => 'Complete',
						'status'  => 'done',
					),
				)
			);
		}

		$fresh = Neo_Pulse_App_Agent_Runs_Store::get_run( $team_id, $run_id, false );
		if ( $fresh && ! empty( $fresh['plan']['taskExecutionId'] ) ) {
			$execution_id = (int) $fresh['plan']['taskExecutionId'];
			$result       = is_array( $fresh['result'] ?? null ) ? $fresh['result'] : array();
			Neo_Pulse_App_Task_Execution_Coordinator::complete(
				$team_id,
				$execution_id,
				array(
					'ok'         => true,
					'agentRunId' => $run_id,
					'result'     => array(
						'created'       => (int) ( $result['created'] ?? 0 ),
						'uploadedPosts' => $result['uploadedPosts'] ?? array(),
					),
				)
			);
		}
	}
}
