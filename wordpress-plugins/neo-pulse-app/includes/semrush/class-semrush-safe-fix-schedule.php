<?php
/**
 * Semrush safe-fix daily schedule (07:00 America/Edmonton).
 *
 * @package Neo_Pulse_App
 */

defined( 'ABSPATH' ) || exit;

class Neo_Pulse_App_Semrush_Safe_Fix_Schedule {

	const TZ         = 'America/Edmonton';
	const AGENT_ID   = 'reporting.semrush.safe-fix';
	const DEFAULT_TO = 'sean@neodigital.ca';

	/**
	 * @return array<string,mixed>
	 */
	public static function defaults(): array {
		return array(
			'enabled'      => true,
			'time'         => '07:00',
			'timezone'     => self::TZ,
			'to'           => self::DEFAULT_TO,
			'lastRunKey'   => '',
			'lastRunAt'    => '',
			'lastRunError' => '',
			'lastRunOk'    => null,
		);
	}

	/**
	 * @param mixed $raw
	 * @return array<string,mixed>
	 */
	public static function normalize( $raw ): array {
		$base = self::defaults();
		if ( ! is_array( $raw ) ) {
			return $base;
		}
		$time = isset( $raw['time'] ) ? trim( (string) $raw['time'] ) : $base['time'];
		if ( ! preg_match( '/^\d{1,2}:\d{2}$/', $time ) ) {
			$time = $base['time'];
		} else {
			$parts  = explode( ':', $time );
			$hour   = max( 0, min( 23, (int) $parts[0] ) );
			$minute = max( 0, min( 59, (int) $parts[1] ) );
			$time   = sprintf( '%02d:%02d', $hour, $minute );
		}
		$to = isset( $raw['to'] ) ? sanitize_email( strtolower( trim( (string) $raw['to'] ) ) ) : $base['to'];
		if ( $to === '' ) {
			$to = $base['to'];
		}
		return array(
			'enabled'      => array_key_exists( 'enabled', $raw ) ? (bool) $raw['enabled'] : true,
			'time'         => $time,
			'timezone'     => self::TZ,
			'to'           => $to,
			'lastRunKey'   => isset( $raw['lastRunKey'] ) ? substr( trim( (string) $raw['lastRunKey'] ), 0, 64 ) : '',
			'lastRunAt'    => isset( $raw['lastRunAt'] ) ? substr( trim( (string) $raw['lastRunAt'] ), 0, 64 ) : '',
			'lastRunError' => isset( $raw['lastRunError'] ) ? substr( trim( (string) $raw['lastRunError'] ), 0, 500 ) : '',
			'lastRunOk'    => array_key_exists( 'lastRunOk', $raw ) ? ( is_null( $raw['lastRunOk'] ) ? null : (bool) $raw['lastRunOk'] ) : null,
		);
	}

	/**
	 * @return array<string,mixed>
	 */
	public static function load(): array {
		$path = Neo_Pulse_App_Data_Paths::semrush_safe_fix_schedule_path();
		$raw  = class_exists( 'Neo_Pulse_App_Json_File_Store' )
			? Neo_Pulse_App_Json_File_Store::read( $path )
			: null;
		return self::normalize( $raw );
	}

	/**
	 * @param array<string,mixed> $schedule
	 */
	public static function save( array $schedule ): bool {
		$path = Neo_Pulse_App_Data_Paths::semrush_safe_fix_schedule_path();
		return Neo_Pulse_App_Json_File_Store::write( $path, self::normalize( $schedule ) );
	}

	/**
	 * Whether the morning run is due (past 07:00 Edmonton, once per calendar day).
	 *
	 * @param array<string,mixed> $schedule
	 */
	public static function is_due_now( array $schedule ): bool {
		if ( empty( $schedule['enabled'] ) ) {
			return false;
		}
		$tz  = new DateTimeZone( self::TZ );
		$now = new DateTime( 'now', $tz );
		$due = self::minute_of_day( (string) $schedule['time'] );
		$cur = ( (int) $now->format( 'G' ) * 60 ) + (int) $now->format( 'i' );
		if ( $due === null || $cur < $due ) {
			return false;
		}
		$run_key = self::run_key( $now );
		return (string) ( $schedule['lastRunKey'] ?? '' ) !== $run_key;
	}

	public static function run_key( ?DateTime $now = null ): string {
		$tz  = new DateTimeZone( self::TZ );
		$now = $now instanceof DateTime ? $now : new DateTime( 'now', $tz );
		return $now->format( 'Y-m-d' );
	}

	/**
	 * Agent library On/Off: missing override means enabled.
	 */
	public static function is_library_enabled(): bool {
		$path = Neo_Pulse_App_Data_Paths::agent_library_path();
		$raw  = Neo_Pulse_App_Json_File_Store::read( $path );
		if ( ! is_array( $raw ) || ! isset( $raw['overrides'] ) || ! is_array( $raw['overrides'] ) ) {
			return true;
		}
		$id = self::AGENT_ID;
		if ( ! array_key_exists( $id, $raw['overrides'] ) ) {
			return true;
		}
		return (bool) $raw['overrides'][ $id ];
	}

	/**
	 * @return int|null
	 */
	private static function minute_of_day( string $time ) {
		if ( ! preg_match( '/^(\d{1,2}):(\d{2})$/', $time, $m ) ) {
			return null;
		}
		$hour   = (int) $m[1];
		$minute = (int) $m[2];
		if ( $hour > 23 || $minute > 59 ) {
			return null;
		}
		return ( $hour * 60 ) + $minute;
	}
}
