<?php
/**
 * Per-site skill run schedule. Same due rule for every skill.
 *
 * Cadence is hourly, daily, weekly, or monthly (America/Edmonton).
 * Older rows stored cadence "daily" for every shape: a day of month
 * is monthly, an interval under 24 hours is hourly, otherwise daily.
 *
 * @package Neo_Pulse_App
 */

defined( 'ABSPATH' ) || exit;

class Neo_Pulse_App_Skill_Run_Schedule {

	const TZ = 'America/Edmonton';

	/**
	 * @param array<string,mixed> $site
	 * @return array{due:bool,runKey:string}
	 */
	public static function due_for_site( array $site, string $agent_id, ?DateTime $now = null ): array {
		$schedule = self::read( $site, $agent_id );
		$tz       = new DateTimeZone( self::TZ );
		$now      = $now instanceof DateTime ? clone $now : new DateTime( 'now', $tz );
		if ( $now->getTimezone()->getName() !== self::TZ ) {
			$now->setTimezone( $tz );
		}
		$cadence = (string) $schedule['cadence'];
		if ( $cadence === 'weekly' && (int) $now->format( 'w' ) !== (int) $schedule['dayOfWeek'] ) {
			return array( 'due' => false, 'runKey' => '' );
		}
		if ( $cadence === 'monthly' ) {
			$day    = (int) $schedule['dayOfMonth'];
			$last   = (int) $now->format( 't' );
			$target = $day > $last ? $last : $day;
			if ( (int) $now->format( 'j' ) !== $target ) {
				return array( 'due' => false, 'runKey' => '' );
			}
		}
		$cur = ( (int) $now->format( 'G' ) * 60 ) + (int) $now->format( 'i' );
		if ( $cadence === 'hourly' ) {
			$step = (int) $schedule['intervalHours'] * 60;
			if ( $step < 1 ) {
				return array( 'due' => false, 'runKey' => '' );
			}
			$slot = (int) ( intdiv( $cur, $step ) * $step );
		} else {
			$anchor = self::minute_of_day( (string) $schedule['time'] );
			if ( $anchor === null || $cur < $anchor ) {
				return array( 'due' => false, 'runKey' => '' );
			}
			$slot = $anchor;
		}
		$run_key = $now->format( 'Y-m-d' ) . '-' . $slot;
		$last    = (string) ( $schedule['lastRunKey'] ?? '' );
		return array(
			'due'    => $last !== $run_key,
			'runKey' => $run_key,
		);
	}

	/**
	 * @param array<string,mixed> $site
	 * @return array<string,mixed>
	 */
	public static function read( array $site, string $agent_id ): array {
		$all = $site['skillSchedules'] ?? null;
		$raw = ( is_array( $all ) && isset( $all[ $agent_id ] ) && is_array( $all[ $agent_id ] ) )
			? $all[ $agent_id ]
			: array();
		$allowed  = array( 1, 2, 4, 6, 12, 24 );
		$interval = isset( $raw['intervalHours'] ) ? (int) $raw['intervalHours'] : 24;
		if ( ! in_array( $interval, $allowed, true ) ) {
			$interval = 24;
		}
		$time = isset( $raw['time'] ) ? trim( (string) $raw['time'] ) : '07:00';
		if ( self::minute_of_day( $time ) === null ) {
			$time = '07:00';
		} else {
			$parts = explode( ':', $time );
			$time  = sprintf( '%02d:%02d', (int) $parts[0], (int) $parts[1] );
		}
		$day = isset( $raw['dayOfMonth'] ) ? (int) $raw['dayOfMonth'] : 0;
		if ( $day < 1 || $day > 31 ) {
			$day = 0;
		}
		$dow = array_key_exists( 'dayOfWeek', $raw ) ? (int) $raw['dayOfWeek'] : -1;
		if ( $dow < 0 || $dow > 6 ) {
			$dow = -1;
		}
		$stored = isset( $raw['cadence'] ) ? (string) $raw['cadence'] : '';
		if ( in_array( $stored, array( 'hourly', 'weekly', 'monthly' ), true ) ) {
			$cadence = $stored;
		} elseif ( $day >= 1 ) {
			$cadence = 'monthly';
		} elseif ( $interval < 24 ) {
			$cadence = 'hourly';
		} else {
			$cadence = 'daily';
		}
		if ( $cadence === 'hourly' ) {
			if ( $interval >= 24 ) {
				$interval = 1;
			}
			$day = 0;
			$dow = -1;
		} elseif ( $cadence === 'weekly' ) {
			$interval = 24;
			$day      = 0;
			if ( $dow < 0 ) {
				$dow = 1;
			}
		} elseif ( $cadence === 'monthly' ) {
			$interval = 24;
			$dow      = -1;
			if ( $day < 1 ) {
				$day = 1;
			}
		} else {
			$cadence  = 'daily';
			$interval = 24;
			$day      = 0;
			$dow      = -1;
		}
		return array(
			'cadence'       => $cadence,
			'intervalHours' => $interval,
			'time'          => $time,
			'dayOfWeek'     => $dow >= 0 ? $dow : null,
			'dayOfMonth'    => $day >= 1 ? $day : null,
			'lastRunKey'    => isset( $raw['lastRunKey'] ) ? (string) $raw['lastRunKey'] : '',
		);
	}

	public static function stamp( string $site_id, string $agent_id, string $run_key ): void {
		if ( $site_id === '' || $agent_id === '' || $run_key === '' ) {
			return;
		}
		if ( ! class_exists( 'Neo_Pulse_App_Json_File_Store' ) || ! class_exists( 'Neo_Pulse_App_Data_Paths' ) ) {
			return;
		}
		$path = Neo_Pulse_App_Data_Paths::sites_path();
		$data = Neo_Pulse_App_Json_File_Store::read( $path );
		if ( ! is_array( $data ) || ! isset( $data['sites'] ) || ! is_array( $data['sites'] ) ) {
			return;
		}
		foreach ( $data['sites'] as $i => $site ) {
			if ( ! is_array( $site ) || (string) ( $site['id'] ?? '' ) !== $site_id ) {
				continue;
			}
			$schedules = isset( $site['skillSchedules'] ) && is_array( $site['skillSchedules'] )
				? $site['skillSchedules']
				: array();
			$current = isset( $schedules[ $agent_id ] ) && is_array( $schedules[ $agent_id ] )
				? $schedules[ $agent_id ]
				: array();
			$current['lastRunKey']      = $run_key;
			$schedules[ $agent_id ]     = $current;
			$data['sites'][ $i ]['skillSchedules'] = $schedules;
			Neo_Pulse_App_Json_File_Store::write( $path, $data );
			return;
		}
	}

	/**
	 * @return int|null
	 */
	private static function minute_of_day( string $time ) {
		if ( ! preg_match( '/^(\d{1,2}):(\d{2})(?::\d{2})?$/', $time, $m ) ) {
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
