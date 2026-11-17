<?php
/**
 * Fact Checker schedule + report recipient.
 *
 * @package Neo_Pulse_App
 */

defined( 'ABSPATH' ) || exit;

class Neo_Pulse_App_Fact_Checker_Schedule {

	const TZ         = 'America/Edmonton';
	const AGENT_ID   = 'content.product.fact-check';
	const DEFAULT_TO = 'sean@neodigital.ca';

	/**
	 * @return array<string,mixed>
	 */
	public static function defaults(): array {
		return array(
			'enabled'      => true,
			'time'         => '08:00',
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
		if ( $to === '' || ! is_email( $to ) ) {
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
		$path = Neo_Pulse_App_Data_Paths::fact_checker_schedule_path();
		$raw  = class_exists( 'Neo_Pulse_App_Json_File_Store' )
			? Neo_Pulse_App_Json_File_Store::read( $path )
			: null;
		return self::normalize( $raw );
	}

	/**
	 * @param array<string,mixed> $schedule
	 */
	public static function save( array $schedule ): bool {
		$path = Neo_Pulse_App_Data_Paths::fact_checker_schedule_path();
		return Neo_Pulse_App_Json_File_Store::write( $path, self::normalize( $schedule ) );
	}

	public static function is_library_enabled(): bool {
		return true;
	}
}
