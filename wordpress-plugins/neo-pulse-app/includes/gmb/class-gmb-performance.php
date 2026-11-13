<?php
/**
 * Google Business Profile performance metrics (fetchMultiDailyMetricsTimeSeries).
 *
 * @package Neo_Pulse_App
 */

defined( 'ABSPATH' ) || exit;

class Neo_Pulse_App_Gmb_Performance {

	const PERFORMANCE_METHOD = 'fetchMultiDailyMetricsTimeSeries';
	const PERFORMANCE_BASE   = 'https://businessprofileperformance.googleapis.com/v1/locations';

	/**
	 * @param array<string,mixed> $body
	 * @return array{statusCode:int,body:array<string,mixed>}
	 */
	public static function performance( array $body ): array {
		if ( ! Neo_Pulse_App_Gmb_Oauth::is_configured() ) {
			return array(
				'statusCode' => 503,
				'body'       => array(
					'success' => false,
					'error'   => 'GMB not configured.',
				),
			);
		}

		$tokens = Neo_Pulse_App_Gmb_Tokens::get_tokens();
		if ( ! is_array( $tokens ) || empty( $tokens['access_token'] ) ) {
			return array(
				'statusCode' => 401,
				'body'       => array(
					'success' => false,
					'error'   => 'Not connected. Use Connect Google Business first.',
				),
			);
		}

		foreach ( array( 'startDate', 'endDate', 'compareStartDate', 'compareEndDate' ) as $field ) {
			if ( empty( $body[ $field ] ) ) {
				return array(
					'statusCode' => 400,
					'body'       => array(
						'success' => false,
						'error'   => 'startDate, endDate, compareStartDate, compareEndDate are required (YYYY-MM-DD).',
					),
				);
			}
		}

		$location_ids = array();
		if ( ! empty( $body['locationIds'] ) && is_array( $body['locationIds'] ) ) {
			foreach ( $body['locationIds'] as $id ) {
				$normalized = self::normalize_location_id( (string) $id );
				if ( $normalized !== '' ) {
					$location_ids[] = $normalized;
				}
			}
		}

		if ( empty( $location_ids ) ) {
			return array(
				'statusCode' => 400,
				'body'       => array(
					'success' => false,
					'error'   => 'locationIds required. Edit this WordPress site and set "Google Business Profile Location ID" (e.g. the fid= value from your business.google.com profile URL), then use Pull GMB stats. Discovery is disabled to avoid API quota limits.',
				),
			);
		}

		$access_token = Neo_Pulse_App_Gmb_Tokens::get_valid_access_token();
		if ( is_wp_error( $access_token ) ) {
			return array(
				'statusCode' => 401,
				'body'       => array(
					'success' => false,
					'error'   => $access_token->get_error_message(),
				),
			);
		}

		$start_date         = (string) $body['startDate'];
		$end_date           = (string) $body['endDate'];
		$compare_start_date = (string) $body['compareStartDate'];
		$compare_end_date   = (string) $body['compareEndDate'];

		$current_period     = array( 'calls' => 0, 'chat' => 0, 'directions' => 0, 'websiteClicks' => 0 );
		$comparison_period  = array( 'calls' => 0, 'chat' => 0, 'directions' => 0, 'websiteClicks' => 0 );
		$first_api_error    = null;

		foreach ( $location_ids as $location_id ) {
			$cur = self::fetch_multi_for_period( $access_token, $location_id, $start_date, $end_date );
			if ( ! empty( $cur['quota'] ) ) {
				return array(
					'statusCode' => 429,
					'body'       => array(
						'success' => false,
						'error'   => $first_api_error ?: 'Quota exceeded (businessprofileperformance). Wait a minute and try again.',
					),
				);
			}
			if ( $first_api_error === null && ! empty( $cur['apiError'] ) ) {
				$first_api_error = (string) $cur['apiError'];
			}

			$comp = self::fetch_multi_for_period( $access_token, $location_id, $compare_start_date, $compare_end_date );
			if ( ! empty( $comp['quota'] ) ) {
				return array(
					'statusCode' => 429,
					'body'       => array(
						'success' => false,
						'error'   => $first_api_error ?: 'Quota exceeded (businessprofileperformance). Wait a minute and try again.',
					),
				);
			}
			if ( $first_api_error === null && ! empty( $comp['apiError'] ) ) {
				$first_api_error = (string) $comp['apiError'];
			}

			$cur_sums  = is_array( $cur['sums'] ) ? $cur['sums'] : array();
			$comp_sums = is_array( $comp['sums'] ) ? $comp['sums'] : array();
			$current_period['calls']         += (int) ( $cur_sums['calls'] ?? 0 );
			$current_period['chat']          += (int) ( $cur_sums['chat'] ?? 0 );
			$current_period['directions']    += (int) ( $cur_sums['directions'] ?? 0 );
			$current_period['websiteClicks'] += (int) ( $cur_sums['websiteClicks'] ?? 0 );
			$comparison_period['calls']         += (int) ( $comp_sums['calls'] ?? 0 );
			$comparison_period['chat']          += (int) ( $comp_sums['chat'] ?? 0 );
			$comparison_period['directions']    += (int) ( $comp_sums['directions'] ?? 0 );
			$comparison_period['websiteClicks'] += (int) ( $comp_sums['websiteClicks'] ?? 0 );
		}

		$payload = array(
			'success'          => true,
			'locationCount'    => count( $location_ids ),
			'currentPeriod'    => array_merge(
				array(
					'startDate' => $start_date,
					'endDate'   => $end_date,
				),
				$current_period
			),
			'comparisonPeriod' => array_merge(
				array(
					'startDate' => $compare_start_date,
					'endDate'   => $compare_end_date,
				),
				$comparison_period
			),
		);
		if ( $first_api_error ) {
			$payload['apiWarning'] = $first_api_error;
		}

		return array(
			'statusCode' => 200,
			'body'       => $payload,
		);
	}

	/**
	 * @return array{quota?:bool,apiError?:string,sums?:array<string,int>}
	 */
	private static function fetch_multi_for_period( string $access_token, string $location_id, string $start, string $end ): array {
		$start_parts = self::parse_ymd( $start );
		$end_parts   = self::parse_ymd( $end );
		$url         = self::PERFORMANCE_BASE . '/' . rawurlencode( $location_id ) . ':' . self::PERFORMANCE_METHOD;

		$params = array(
			'dailyMetrics'                    => array(
				'CALL_CLICKS',
				'BUSINESS_CONVERSATIONS',
				'BUSINESS_DIRECTION_REQUESTS',
				'WEBSITE_CLICKS',
			),
			'dailyRange.start_date.year'      => $start_parts['year'],
			'dailyRange.start_date.month'     => $start_parts['month'],
			'dailyRange.start_date.day'       => $start_parts['day'],
			'dailyRange.end_date.year'        => $end_parts['year'],
			'dailyRange.end_date.month'       => $end_parts['month'],
			'dailyRange.end_date.day'         => $end_parts['day'],
		);

		$query = array();
		foreach ( $params['dailyMetrics'] as $metric ) {
			$query[] = 'dailyMetrics=' . rawurlencode( $metric );
		}
		unset( $params['dailyMetrics'] );
		foreach ( $params as $key => $value ) {
			$query[] = rawurlencode( $key ) . '=' . rawurlencode( (string) $value );
		}

		$response = wp_remote_get(
			$url . '?' . implode( '&', $query ),
			array(
				'timeout' => 45,
				'headers' => array(
					'Authorization' => 'Bearer ' . $access_token,
					'Accept'        => 'application/json',
				),
			)
		);

		if ( is_wp_error( $response ) ) {
			return array(
				'sums'     => array( 'calls' => 0, 'chat' => 0, 'directions' => 0, 'websiteClicks' => 0 ),
				'apiError' => $response->get_error_message(),
			);
		}

		$code = (int) wp_remote_retrieve_response_code( $response );
		$data = json_decode( wp_remote_retrieve_body( $response ), true );

		if ( $code === 429 ) {
			$msg = is_array( $data ) && ! empty( $data['error']['message'] )
				? (string) $data['error']['message']
				: 'Quota exceeded (businessprofileperformance). Wait a minute and try again.';
			return array( 'quota' => true, 'apiError' => $msg );
		}

		if ( $code !== 200 ) {
			$msg = is_array( $data ) && ! empty( $data['error']['message'] )
				? (string) $data['error']['message']
				: ( is_array( $data ) && ! empty( $data['error']['code'] ) ? (string) $data['error']['code'] : 'HTTP ' . $code );
			return array(
				'sums'     => array( 'calls' => 0, 'chat' => 0, 'directions' => 0, 'websiteClicks' => 0 ),
				'apiError' => $msg,
			);
		}

		$sums = array( 'calls' => 0, 'chat' => 0, 'directions' => 0, 'websiteClicks' => 0 );
		$map  = array(
			'CALL_CLICKS'                 => 'calls',
			'BUSINESS_CONVERSATIONS'      => 'chat',
			'BUSINESS_DIRECTION_REQUESTS' => 'directions',
			'WEBSITE_CLICKS'              => 'websiteClicks',
		);

		$multi = is_array( $data ) && ! empty( $data['multiDailyMetricTimeSeries'] ) && is_array( $data['multiDailyMetricTimeSeries'] )
			? $data['multiDailyMetricTimeSeries']
			: array();

		foreach ( $multi as $block ) {
			if ( ! is_array( $block ) || empty( $block['dailyMetricTimeSeries'] ) || ! is_array( $block['dailyMetricTimeSeries'] ) ) {
				continue;
			}
			foreach ( $block['dailyMetricTimeSeries'] as $series ) {
				if ( ! is_array( $series ) ) {
					continue;
				}
				$metric = isset( $series['dailyMetric'] ) ? (string) $series['dailyMetric'] : '';
				$key    = $map[ $metric ] ?? null;
				if ( ! $key ) {
					continue;
				}
				$dated = isset( $series['timeSeries']['datedValues'] ) && is_array( $series['timeSeries']['datedValues'] )
					? $series['timeSeries']['datedValues']
					: array();
				$sums[ $key ] += self::sum_dated_values( $dated );
			}
		}

		return array( 'sums' => $sums );
	}

	/**
	 * @param array<int,mixed> $dated_values
	 */
	private static function sum_dated_values( array $dated_values ): int {
		$total = 0;
		foreach ( $dated_values as $value ) {
			if ( is_array( $value ) && isset( $value['value'] ) ) {
				$total += (int) $value['value'];
			}
		}
		return $total;
	}

	/**
	 * @return array{year:int,month:int,day:int}
	 */
	private static function parse_ymd( string $date ): array {
		$parts = explode( '-', $date );
		return array(
			'year'  => isset( $parts[0] ) ? (int) $parts[0] : 0,
			'month' => isset( $parts[1] ) ? (int) $parts[1] : 1,
			'day'   => isset( $parts[2] ) ? (int) $parts[2] : 1,
		);
	}

	/**
	 * @return array<int,string>
	 */
	public static function location_id_candidates( string $location_id ): array {
		$id = trim( $location_id );
		if ( $id === '' ) {
			return array();
		}

		$candidates = array();
		$push       = static function ( string $value ) use ( &$candidates ): void {
			$value = trim( $value );
			if ( $value === '' || in_array( $value, $candidates, true ) ) {
				return;
			}
			$candidates[] = $value;
		};

		if ( preg_match( '/locations\/([0-9]+)/i', $id, $m ) ) {
			$push( $m[1] );
		}
		if ( preg_match( '/[?&]fid=([0-9]+)/i', $id, $m ) ) {
			$push( $m[1] );
		}
		if ( preg_match( '/\/n\/([0-9]+)/i', $id, $m ) ) {
			$push( $m[1] );
		}
		if ( preg_match( '/^[0-9]+$/', $id ) ) {
			$push( $id );
		}
		if ( empty( $candidates ) && ! preg_match( '/[?&\/=]/', $id ) ) {
			$digits = preg_replace( '/[^0-9]/', '', $id );
			if ( strlen( $digits ) >= 10 && strlen( $digits ) <= 25 ) {
				$push( $digits );
			}
		}

		return $candidates;
	}

	/**
	 * localPosts v4 often matches /n/ before fid= from profile URLs.
	 *
	 * @return array<int,string>
	 */
	public static function location_id_post_candidates( string $location_id ): array {
		$id = trim( $location_id );
		if ( $id === '' ) {
			return array();
		}

		$candidates = array();
		$push       = static function ( string $value ) use ( &$candidates ): void {
			$value = trim( $value );
			if ( $value === '' || in_array( $value, $candidates, true ) ) {
				return;
			}
			$candidates[] = $value;
		};

		if ( preg_match( '/locations\/([0-9]+)/i', $id, $m ) ) {
			$push( $m[1] );
		}
		if ( preg_match( '/\/n\/([0-9]+)/i', $id, $m ) ) {
			$push( $m[1] );
		}
		if ( preg_match( '/[?&]fid=([0-9]+)/i', $id, $m ) ) {
			$push( $m[1] );
		}
		if ( preg_match( '/^[0-9]+$/', $id ) ) {
			$push( $id );
		}
		if ( empty( $candidates ) ) {
			return self::location_id_candidates( $id );
		}

		return $candidates;
	}

	public static function normalize_location_id( string $location_id ): string {
		$candidates = self::location_id_candidates( $location_id );
		return $candidates[0] ?? '';
	}
}
