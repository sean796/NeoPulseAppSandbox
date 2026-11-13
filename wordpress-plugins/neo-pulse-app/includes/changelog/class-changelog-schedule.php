<?php
/**
 * Changelog newsletter schedule defaults and sanitization.
 *
 * @package Neo_Pulse_App
 */

defined( 'ABSPATH' ) || exit;

class Neo_Pulse_App_Changelog_Schedule {

	const TZ = 'America/Edmonton';

	const WEEKDAYS = array(
		'monday',
		'tuesday',
		'wednesday',
		'thursday',
		'friday',
		'saturday',
		'sunday',
	);

	/**
	 * @return array<string,mixed>
	 */
	public static function defaults(): array {
		return array(
			'enabled'      => true,
			'weekday'      => 'friday',
			'time'         => '06:00',
			'timezone'     => self::TZ,
			'to'           => 'sean@neodigital.ca',
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
		$weekday = isset( $raw['weekday'] ) ? strtolower( trim( (string) $raw['weekday'] ) ) : $base['weekday'];
		if ( ! in_array( $weekday, self::WEEKDAYS, true ) ) {
			$weekday = $base['weekday'];
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
			'weekday'      => $weekday,
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
	 * Whether the schedule is due in the current Edmonton hour window.
	 *
	 * @param array<string,mixed> $schedule
	 */
	public static function is_due_now( array $schedule ): bool {
		if ( empty( $schedule['enabled'] ) ) {
			return false;
		}
		$tz      = new DateTimeZone( self::TZ );
		$now     = new DateTime( 'now', $tz );
		$weekday = strtolower( $now->format( 'l' ) );
		if ( $weekday !== (string) $schedule['weekday'] ) {
			return false;
		}
		$due_min = self::minute_of_day( (string) $schedule['time'] );
		$now_min = ( (int) $now->format( 'G' ) * 60 ) + (int) $now->format( 'i' );
		if ( $due_min === null || $now_min < $due_min ) {
			return false;
		}
		$run_key = self::run_key( $schedule, $now );
		return (string) ( $schedule['lastRunKey'] ?? '' ) !== $run_key;
	}

	/**
	 * @param array<string,mixed> $schedule
	 */
	public static function run_key( array $schedule, ?DateTime $now = null ): string {
		$tz  = new DateTimeZone( self::TZ );
		$now = $now instanceof DateTime ? $now : new DateTime( 'now', $tz );
		return $now->format( 'o-\WW' ) . ':' . (string) $schedule['time'];
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
		if ( $hour < 0 || $hour > 23 || $minute < 0 || $minute > 59 ) {
			return null;
		}
		return ( $hour * 60 ) + $minute;
	}

	/**
	 * Human next-run hint for UI.
	 *
	 * @param array<string,mixed> $schedule
	 */
	public static function next_run_label( array $schedule ): string {
		if ( empty( $schedule['enabled'] ) ) {
			return 'Auto-send off';
		}
		$weekday = ucfirst( (string) $schedule['weekday'] );
		$time    = (string) $schedule['time'];
		return "Every {$weekday} at {$time} America/Edmonton";
	}
}
