<?php
/**
 * Posts Content Gap: count, validate schedule, Blog Ideas payload (PHP, no Node).
 *
 * @package Neo_Pulse_App
 */

defined( 'ABSPATH' ) || exit;

class Neo_Pulse_App_Posts_Content_Gap_Pipeline {

	const TZ                  = 'America/Edmonton';
	const MONTH_END_BUFFER    = 5;
	const DEFAULT_PUBLISH_TIME = '09:00';

	/** @var array<string,int> */
	const QUOTAS = array(
		'standard' => 2,
		'lite'     => 1,
	);

	/** @var array<int,string> */
	const STANDARD_NAMES = array(
		'Blind Magic',
		'Lindsey Blinds',
		'Superior Blinds',
		'In the Shade',
		'Interiors by Laura',
		'DM Interiors',
		'Blinds West',
		'KWB',
		'Tailored Interiors',
		'Neo Digital',
		'Shutter Spot',
		'Custom Shades of London',
	);

	/** @var array<int,string> */
	const LITE_NAMES = array(
		'Advance Blinds',
		'Superior Tent Rentals',
		'You Junk It... I Dump It',
		'Phoenix Painting',
		'Posh Outdoors',
	);

	/** @var array<string,string> */
	const PUBLISH_TIME_BY_NAME = array(
		'Superior Tent Rentals'    => '03:00',
		'You Junk It... I Dump It' => '03:00',
		'KWB'                      => '03:00',
	);

	public static function schedule_rules_text(): string {
		$path = dirname( __FILE__ ) . '/schedule-rules.md';
		if ( is_readable( $path ) ) {
			return (string) file_get_contents( $path );
		}
		return "Return JSON {\"publishDates\":[\"YYYY-MM-DD\"],\"publishTime\":\"HH:MM\"}. "
			. 'publishDates length equals gap; dates unique, in month, on or before lastAllowedDay, not occupied.';
	}

	/**
	 * @param array<string,mixed> $site
	 * @return array<string,mixed>|WP_Error
	 */
	public static function build_count( array $site ) {
		$quota = self::blogs_per_month_for_site( $site );
		if ( $quota === null ) {
			$name = trim( (string) ( $site['name'] ?? 'This site' ) );
			return new WP_Error(
				'neo-pulse_posts_gap_quota',
				$name . ' has no saved blog quota on Integrations.'
			);
		}

		$month_key = self::next_month_key();
		$bounds    = self::month_bounds( $month_key );
		$auth      = array(
			'siteUrl'     => (string) ( $site['siteUrl'] ?? '' ),
			'username'    => (string) ( $site['username'] ?? '' ),
			'appPassword' => (string) ( $site['appPassword'] ?? '' ),
		);
		if ( $auth['siteUrl'] === '' || $auth['username'] === '' || $auth['appPassword'] === '' ) {
			return new WP_Error( 'neo-pulse_posts_gap_auth', 'Site is missing WordPress credentials' );
		}

		list( $status, $counts ) = Neo_Pulse_App_Wp_Editorial_Counts::get_quarter_editorial_counts(
			array_merge(
				$auth,
				array(
					'after'  => $bounds['after'],
					'before' => $bounds['before'],
				)
			)
		);
		unset( $status );
		if ( empty( $counts['ok'] ) ) {
			return new WP_Error(
				'neo-pulse_posts_gap_counts',
				(string) ( $counts['error'] ?? 'Post counts are unavailable for this site.' )
			);
		}
		$published = isset( $counts['postsPublished'] ) ? (int) $counts['postsPublished'] : null;
		$scheduled = isset( $counts['postsScheduled'] ) ? (int) $counts['postsScheduled'] : null;
		if ( $published === null || $scheduled === null ) {
			return new WP_Error( 'neo-pulse_posts_gap_counts', 'Post counts are unavailable for this site.' );
		}

		$parsed = self::parse_month_key( $month_key );
		list( , $sched_payload ) = Neo_Pulse_App_Wp_Posts_Inventory::get_scheduled_posts(
			array_merge(
				$auth,
				array(
					'month' => (int) $parsed['monthIndex'],
					'year'  => (int) $parsed['year'],
				)
			)
		);
		$occupied = array();
		if ( is_array( $sched_payload ) && isset( $sched_payload['posts'] ) && is_array( $sched_payload['posts'] ) ) {
			foreach ( $sched_payload['posts'] as $post ) {
				if ( ! is_array( $post ) ) {
					continue;
				}
				$ymd = self::ymd_from_iso_or_date( (string) ( $post['date_gmt'] ?? $post['date'] ?? '' ) );
				if ( $ymd && str_starts_with( $ymd, $month_key ) ) {
					$occupied[ $ymd ] = true;
				}
			}
		}
		$occupied_list = array_keys( $occupied );
		sort( $occupied_list );

		$current = $published + $scheduled;
		$gap     = max( 0, $quota - $current );

		return array(
			'siteId'          => (string) ( $site['id'] ?? '' ),
			'siteName'        => (string) ( $site['name'] ?? '' ),
			'month'           => $month_key,
			'published'       => $published,
			'scheduled'       => $scheduled,
			'current'         => $current,
			'quota'           => $quota,
			'gap'             => $gap,
			'goalMet'         => $gap === 0,
			'occupiedDates'   => $occupied_list,
			'lastAllowedDay'  => self::last_allowed_day( $month_key ),
			'publishTimeHint' => self::publish_time_hint_for_site( $site ),
		);
	}

	/**
	 * @param array<string,mixed> $count
	 * @param array<string,mixed> $plan
	 * @return array{ok:true,plan:array<string,mixed>}|array{ok:false,errors:array<int,string>}
	 */
	public static function validate_schedule_plan( array $count, array $plan ): array {
		$errors = array();
		$gap    = isset( $count['gap'] ) ? (int) $count['gap'] : -1;
		if ( $gap < 0 ) {
			return array( 'ok' => false, 'errors' => array( 'count.gap must be a non-negative integer' ) );
		}
		if ( $gap === 0 ) {
			return array( 'ok' => false, 'errors' => array( 'gap is 0; do not create a schedule plan' ) );
		}

		$dates = $plan['publishDates'] ?? null;
		if ( ! is_array( $dates ) ) {
			$errors[] = 'publishDates must be an array of YYYY-MM-DD strings';
		} elseif ( count( $dates ) !== $gap ) {
			$errors[] = 'publishDates length must equal gap ' . $gap . '. Received: ' . count( $dates );
		}

		$time = isset( $plan['publishTime'] ) ? (string) $plan['publishTime'] : '';
		if ( ! preg_match( '/^\d{2}:\d{2}$/', $time ) ) {
			$errors[] = 'publishTime must be HH:MM. Received: ' . wp_json_encode( $plan['publishTime'] ?? null );
		} else {
			$parts = array_map( 'intval', explode( ':', $time ) );
			if ( $parts[0] > 23 || $parts[1] > 59 ) {
				$errors[] = 'publishTime out of range. Received: "' . $time . '"';
			}
		}

		$month       = (string) ( $count['month'] ?? '' );
		$last_allowed = (string) ( $count['lastAllowedDay'] ?? '' );
		$occupied    = array();
		if ( isset( $count['occupiedDates'] ) && is_array( $count['occupiedDates'] ) ) {
			foreach ( $count['occupiedDates'] as $d ) {
				$occupied[ (string) $d ] = true;
			}
		}
		$seen = array();
		if ( is_array( $dates ) ) {
			foreach ( $dates as $index => $raw ) {
				$ymd = (string) $raw;
				if ( ! preg_match( '/^\d{4}-\d{2}-\d{2}$/', $ymd ) ) {
					$errors[] = 'publishDates[' . $index . '] must be YYYY-MM-DD. Received: ' . wp_json_encode( $raw );
					continue;
				}
				if ( $month !== '' && ! str_starts_with( $ymd, $month . '-' ) ) {
					$errors[] = 'publishDates[' . $index . '] ' . $ymd . ' is outside month ' . $month . '.';
				}
				if ( $last_allowed !== '' && $ymd > $last_allowed ) {
					$errors[] = 'publishDates[' . $index . '] ' . $ymd . ' is after lastAllowedDay ' . $last_allowed . '.';
				}
				if ( isset( $occupied[ $ymd ] ) ) {
					$errors[] = 'publishDates[' . $index . '] ' . $ymd . ' is occupied.';
				}
				if ( isset( $seen[ $ymd ] ) ) {
					$errors[] = 'publishDates[' . $index . '] ' . $ymd . ' is duplicated';
				}
				$seen[ $ymd ] = true;
			}
		}

		if ( $errors ) {
			return array( 'ok' => false, 'errors' => $errors );
		}

		return array(
			'ok'   => true,
			'plan' => array(
				'publishDates' => array_map( 'strval', $dates ),
				'publishTime'  => $time,
			),
		);
	}

	/**
	 * @param array<string,mixed> $count
	 * @param array<string,mixed> $plan
	 * @return array<string,mixed>
	 */
	public static function build_post_creator_payload( array $count, array $plan ): array {
		$gap   = (int) $count['gap'];
		$month = (string) $count['month'];
		$days  = array();
		foreach ( $plan['publishDates'] as $ymd ) {
			$days[] = (int) substr( (string) $ymd, 8, 2 );
		}
		return array(
			'postCount'               => $gap,
			'scheduleTimesPerMonth'   => $gap,
			'keywordSource'           => 'gsc',
			'sitemapType'             => 'post',
			'featuredImage'           => true,
			'postDestination'         => 'wordpress',
			'scheduleFrequency'       => 'custom',
			'scheduleCustomStartDate' => $month . '-01',
			'scheduleStartDay'        => 1,
			'scheduleStartTime'       => (string) $plan['publishTime'],
			'schedulePublishDays'     => $days,
			'scheduleStaggerOptimized'=> true,
			'targetBucket'            => 'posts',
			'saveLocalArchive'        => true,
		);
	}

	/**
	 * @param array<string,mixed> $site
	 */
	public static function blogs_per_month_for_site( array $site ): ?int {
		$tier = self::resolve_package_tier( $site );
		if ( $tier === null ) {
			return null;
		}
		return self::QUOTAS[ $tier ];
	}

	/**
	 * @param array<string,mixed> $site
	 */
	public static function resolve_package_tier( array $site ): ?string {
		$raw = trim( (string) ( $site['editorialContentPackage'] ?? '' ) );
		if ( $raw === 'standard' || $raw === 'lite' ) {
			return $raw;
		}
		$norm = self::normalize_name( (string) ( $site['name'] ?? '' ) );
		if ( $norm === '' ) {
			return null;
		}
		$standard = array();
		foreach ( self::STANDARD_NAMES as $name ) {
			$standard[ self::normalize_name( $name ) ] = true;
		}
		$lite = array();
		foreach ( self::LITE_NAMES as $name ) {
			$lite[ self::normalize_name( $name ) ] = true;
		}
		if ( isset( $standard[ $norm ] ) || str_starts_with( $norm, 'dm interiors' ) || str_starts_with( $norm, 'superior blinds' ) ) {
			return 'standard';
		}
		if ( isset( $lite[ $norm ] ) ) {
			return 'lite';
		}
		return null;
	}

	/**
	 * @param array<string,mixed> $site
	 */
	public static function publish_time_hint_for_site( array $site ): string {
		$stored = trim( (string) ( $site['editorialPublishTimeLocal'] ?? '' ) );
		if ( preg_match( '/^\d{2}:\d{2}$/', $stored ) ) {
			return $stored;
		}
		$norm = self::normalize_name( (string) ( $site['name'] ?? '' ) );
		foreach ( self::PUBLISH_TIME_BY_NAME as $name => $time ) {
			if ( self::normalize_name( $name ) === $norm ) {
				return $time;
			}
		}
		return self::DEFAULT_PUBLISH_TIME;
	}

	public static function normalize_name( string $raw ): string {
		$s = strtolower( $raw );
		$s = str_replace( '&', ' and ', $s );
		$s = preg_replace( '/[^a-z0-9]+/', ' ', $s );
		$s = preg_replace( '/\s+/', ' ', (string) $s );
		return trim( (string) $s );
	}

	public static function next_month_key( ?DateTimeImmutable $now = null ): string {
		$tz  = new DateTimeZone( self::TZ );
		$now = $now ?? new DateTimeImmutable( 'now', $tz );
		$ed  = $now->setTimezone( $tz );
		$y   = (int) $ed->format( 'Y' );
		$m   = (int) $ed->format( 'n' );
		if ( $m === 12 ) {
			return ( $y + 1 ) . '-01';
		}
		return $y . '-' . str_pad( (string) ( $m + 1 ), 2, '0', STR_PAD_LEFT );
	}

	/**
	 * @return array{year:int,monthIndex:int}|null
	 */
	public static function parse_month_key( string $month_key ): ?array {
		if ( ! preg_match( '/^(\d{4})-(\d{2})$/', trim( $month_key ), $m ) ) {
			return null;
		}
		$year        = (int) $m[1];
		$month_index = (int) $m[2] - 1;
		if ( $month_index < 0 || $month_index > 11 ) {
			return null;
		}
		return array(
			'year'       => $year,
			'monthIndex' => $month_index,
		);
	}

	/**
	 * @return array{after:string,before:string}
	 */
	public static function month_bounds( string $month_key ): array {
		$parsed = self::parse_month_key( $month_key );
		if ( ! $parsed ) {
			throw new InvalidArgumentException( 'Invalid month key: ' . $month_key );
		}
		$start = new DateTimeImmutable(
			sprintf( '%04d-%02d-01 00:00:00', $parsed['year'], $parsed['monthIndex'] + 1 )
		);
		$end = $start->modify( '+1 month' );
		return array(
			'after'  => $start->format( 'Y-m-d\TH:i:s.000\Z' ),
			'before' => $end->format( 'Y-m-d\TH:i:s.000\Z' ),
		);
	}

	public static function last_allowed_day( string $month_key ): string {
		$parsed = self::parse_month_key( $month_key );
		if ( ! $parsed ) {
			throw new InvalidArgumentException( 'Invalid month key: ' . $month_key );
		}
		$dim = (int) ( new DateTimeImmutable(
			sprintf( '%04d-%02d-01', $parsed['year'], $parsed['monthIndex'] + 1 )
		) )->modify( 'last day of this month' )->format( 'j' );
		$day = max( 1, $dim - self::MONTH_END_BUFFER );
		return sprintf( '%04d-%02d-%02d', $parsed['year'], $parsed['monthIndex'] + 1, $day );
	}

	public static function ymd_from_iso_or_date( string $value ): ?string {
		$raw = trim( $value );
		if ( $raw === '' ) {
			return null;
		}
		if ( preg_match( '/^(\d{4}-\d{2}-\d{2})/', $raw, $m ) ) {
			return $m[1];
		}
		$ts = strtotime( $raw );
		if ( $ts === false ) {
			return null;
		}
		return gmdate( 'Y-m-d', $ts );
	}
}
