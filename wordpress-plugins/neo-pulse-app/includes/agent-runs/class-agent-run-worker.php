<?php
/**
 * Server-side agent run worker (one bounded tick per run).
 *
 * @package Neo_Pulse_App
 */

defined( 'ABSPATH' ) || exit;

class Neo_Pulse_App_Agent_Run_Worker {

	const LOCK_TTL = 300;

	public static function process_pending_runs(): void {
		Neo_Pulse_App_Agent_Runs_Store::install_tables();
		$runs = Neo_Pulse_App_Agent_Runs_Store::list_server_worker_runs( 5 );
		foreach ( $runs as $run ) {
			if ( ! is_array( $run ) ) {
				continue;
			}
			self::process_run_tick( $run );
		}
	}

	/**
	 * @param array<string,mixed> $run
	 */
	public static function process_run_tick( array $run, bool $force = false ): void {
		@set_time_limit( 900 );
		Neo_Pulse_App_Agent_Runs_Store::install_tables();
		$run_id  = (int) ( $run['id'] ?? 0 );
		$team_id = (int) ( $run['teamId'] ?? 0 );
		if ( $run_id <= 0 || $team_id <= 0 ) {
			return;
		}

		if ( in_array( (string) ( $run['status'] ?? '' ), array( 'done', 'failed', 'cancelled' ), true ) ) {
			return;
		}

		$lock_key = 'neo_pulse_agent_run_lock_' . $run_id;
		if ( $force ) {
			delete_transient( $lock_key );
		} elseif ( get_transient( $lock_key ) ) {
			return;
		}
		set_transient( $lock_key, '1', self::LOCK_TTL );

		try {
			if ( (string) ( $run['status'] ?? '' ) === 'queued' ) {
				Neo_Pulse_App_Agent_Runs_Store::patch_run(
					$team_id,
					$run_id,
					array( 'status' => 'running' )
				);
				$run = Neo_Pulse_App_Agent_Runs_Store::get_run( $team_id, $run_id, true );
				if ( ! $run ) {
					return;
				}
			}

			$recipe = sanitize_key( (string) ( $run['recipeKey'] ?? '' ) );
			if ( $recipe === 'post_creator' && class_exists( 'Neo_Pulse_App_Agent_Run_Harness_Post_Creator' ) ) {
				Neo_Pulse_App_Agent_Run_Harness_Post_Creator::tick( $team_id, $run );
			}
			if ( $recipe === 'local_dominator_export' && class_exists( 'Neo_Pulse_App_Agent_Run_Harness_Local_Dominator_Export' ) ) {
				Neo_Pulse_App_Agent_Run_Harness_Local_Dominator_Export::tick( $team_id, $run );
			}
			if ( $recipe === 'semrush_safe_fix' && class_exists( 'Neo_Pulse_App_Semrush_Safe_Fix_Runner' ) ) {
				Neo_Pulse_App_Semrush_Safe_Fix_Runner::resume( $run );
			}
		} catch ( Exception $e ) {
			Neo_Pulse_App_Agent_Runs_Store::patch_run(
				$team_id,
				$run_id,
				array(
					'status'       => 'failed',
					'errorMessage' => $e->getMessage(),
					'step'         => array(
						'label'    => $e->getMessage(),
						'status'   => 'error',
						'stepKey'  => 'error',
					),
				)
			);
		} finally {
			delete_transient( $lock_key );
		}
	}
}
