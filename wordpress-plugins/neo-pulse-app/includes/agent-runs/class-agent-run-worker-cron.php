<?php
/**
 * WP Cron worker for server-side agent runs.
 *
 * @package Neo_Pulse_App
 */

defined( 'ABSPATH' ) || exit;

class Neo_Pulse_App_Agent_Run_Worker_Cron {

	const HOOK             = 'neo_pulse_app_agent_run_worker';
	const SCHEDULE         = 'neo_pulse_five_minutes';
	const INTERVAL_SECONDS = 300;

	public static function init(): void {
		add_action( self::HOOK, array( __CLASS__, 'run' ) );
	}

	public static function activate(): void {
		self::ensure_five_minute_schedule();
	}

	public static function deactivate(): void {
		wp_clear_scheduled_hook( self::HOOK );
	}

	public static function register_schedule( array $schedules ): array {
		$schedules[ self::SCHEDULE ] = array(
			'interval' => self::INTERVAL_SECONDS,
			'display'  => 'Every 5 minutes (NEO Pulse agent worker)',
		);
		return $schedules;
	}

	public static function ensure_five_minute_schedule(): void {
		$event = wp_get_scheduled_event( self::HOOK );
		if ( is_object( $event ) && (string) ( $event->schedule ?? '' ) === self::SCHEDULE ) {
			return;
		}
		wp_clear_scheduled_hook( self::HOOK );
		wp_schedule_event( self::next_five_minute_ts(), self::SCHEDULE, self::HOOK );
	}

	public static function next_five_minute_ts( int $now = 0 ): int {
		$now  = $now > 0 ? $now : time();
		$step = self::INTERVAL_SECONDS;
		$next = (int) ( ceil( $now / $step ) * $step );
		if ( $next < $now ) {
			$next += $step;
		}
		return $next;
	}

	public static function run(): void {
		if ( ! class_exists( 'Neo_Pulse_App_Agent_Run_Worker' ) ) {
			return;
		}
		Neo_Pulse_App_Agent_Run_Worker::process_pending_runs();
	}

	public static function kick(): void {
		if ( ! wp_next_scheduled( self::HOOK ) ) {
			self::activate();
		}
		wp_schedule_single_event( time() + 5, self::HOOK );
		if ( ! class_exists( 'Neo_Pulse_App_Agent_Run_Worker' ) ) {
			return;
		}
		// Advance server runs immediately; wp-cron alone is unreliable in local Docker.
		for ( $i = 0; $i < 24; $i++ ) {
			$runs = Neo_Pulse_App_Agent_Runs_Store::list_server_worker_runs( 5 );
			if ( empty( $runs ) ) {
				break;
			}
			Neo_Pulse_App_Agent_Run_Worker::process_pending_runs();
		}
	}
}

add_filter( 'cron_schedules', array( 'Neo_Pulse_App_Agent_Run_Worker_Cron', 'register_schedule' ) );
