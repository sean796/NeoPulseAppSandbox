<?php
/**
 * Hourly cron: money-page internal links when site skill schedules are due.
 *
 * @package Neo_Pulse_App
 */

defined( 'ABSPATH' ) || exit;

class Neo_Pulse_App_Money_Page_Internal_Links_Cron {

	const HOOK = 'neo_pulse_app_money_page_internal_links_run';

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
		if ( ! class_exists( 'Neo_Pulse_App_Money_Page_Internal_Links_Runner' ) ) {
			return;
		}
		Neo_Pulse_App_Money_Page_Internal_Links_Runner::run_scheduled();
	}
}
