<?php
/**
 * Hourly cron: run Semrush safe-fix when the daily 07:00 schedule is due.
 *
 * @package Neo_Pulse_App
 */

defined( 'ABSPATH' ) || exit;

class Neo_Pulse_App_Semrush_Safe_Fix_Cron {

	const HOOK = 'neo_pulse_app_semrush_safe_fix_run';

	public static function init(): void {
		add_action( self::HOOK, array( __CLASS__, 'run' ) );
		add_action( 'init', array( __CLASS__, 'maybe_schedule' ) );
	}

	public static function activate(): void {
		if ( ! wp_next_scheduled( self::HOOK ) ) {
			wp_schedule_event( time() + 180, 'hourly', self::HOOK );
		}
	}

	public static function deactivate(): void {
		$ts = wp_next_scheduled( self::HOOK );
		if ( $ts ) {
			wp_unschedule_event( $ts, self::HOOK );
		}
	}

	public static function maybe_schedule(): void {
		if ( ! wp_next_scheduled( self::HOOK ) ) {
			wp_schedule_event( time() + 180, 'hourly', self::HOOK );
		}
	}

	public static function run(): void {
		if ( ! class_exists( 'Neo_Pulse_App_Semrush_Safe_Fix_Runner' ) ) {
			return;
		}
		Neo_Pulse_App_Semrush_Safe_Fix_Runner::run_scheduled();
	}
}
