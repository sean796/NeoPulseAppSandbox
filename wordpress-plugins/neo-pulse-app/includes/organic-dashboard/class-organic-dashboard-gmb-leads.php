<?php
/**
 * Google My Business leads for the Organic Performance Report.
 *
 * @package Neo_Pulse_App
 */

defined( 'ABSPATH' ) || exit;

class Neo_Pulse_App_Organic_Dashboard_Gmb_Leads {

	/**
	 * @param array<string,mixed> $context Bundle fetch context.
	 * @return array{status:string,payload:array<string,mixed>}
	 */
	public static function resolve( array $context ): array {
		$body            = is_array( $context['body'] ?? null ) ? $context['body'] : array();
		$primary         = is_array( $context['primary'] ?? null ) ? $context['primary'] : array();
		$compare         = is_array( $context['compare'] ?? null ) ? $context['compare'] : array();
		$include_compare = ! empty( $context['include_compare'] );

		$gbp_raw = isset( $body['gbpLocationId'] ) ? trim( (string) $body['gbpLocationId'] ) : '';
		if ( $gbp_raw === '' ) {
			return array(
				'status'  => 'skipped',
				'payload' => array(
					'skipped' => true,
					'reason'  => 'missing_gbp_location_id',
					'error'   => 'Google Business Profile Location ID is not set for this property.',
				),
			);
		}

		if ( ! Neo_Pulse_App_Gmb_Oauth::is_configured() ) {
			return array(
				'status'  => 'skipped',
				'payload' => array(
					'skipped' => true,
					'reason'  => 'gmb_not_configured',
					'error'   => 'Google Business Profile is not configured on this host.',
				),
			);
		}

		$tokens = Neo_Pulse_App_Gmb_Tokens::get_tokens();
		if ( ! is_array( $tokens ) || empty( $tokens['access_token'] ) ) {
			return array(
				'status'  => 'skipped',
				'payload' => array(
					'skipped' => true,
					'reason'  => 'gmb_not_connected',
					'error'   => 'Not connected. Use Connect Google Business first.',
				),
			);
		}

		$start = (string) ( $primary['startDate'] ?? '' );
		$end   = (string) ( $primary['endDate'] ?? '' );
		if ( $start === '' || $end === '' ) {
			return array(
				'status'  => 'skipped',
				'payload' => array(
					'skipped' => true,
					'reason'  => 'missing_dates',
					'error'   => 'Primary date range is required for Google My Business Leads.',
				),
			);
		}

		$compare_start = (string) ( $compare['startDate'] ?? '' );
		$compare_end   = (string) ( $compare['endDate'] ?? '' );
		if ( $include_compare && ( $compare_start === '' || $compare_end === '' ) ) {
			return array(
				'status'  => 'skipped',
				'payload' => array(
					'skipped' => true,
					'reason'  => 'missing_compare_dates',
					'error'   => 'Compare date range is required for Google My Business Leads.',
				),
			);
		}
		if ( ! $include_compare ) {
			$compare_start = $start;
			$compare_end   = $end;
		}

		$result = Neo_Pulse_App_Gmb_Performance::performance(
			array(
				'locationIds'      => array( $gbp_raw ),
				'startDate'        => $start,
				'endDate'          => $end,
				'compareStartDate' => $compare_start,
				'compareEndDate'   => $compare_end,
			)
		);

		$status = (int) ( $result['statusCode'] ?? 500 );
		$payload = is_array( $result['body'] ?? null ) ? $result['body'] : array();

		if ( 429 === $status ) {
			return array(
				'status'  => 'error',
				'payload' => array(
					'skipped' => true,
					'reason'  => 'gmb_quota',
					'error'   => (string) ( $payload['error'] ?? 'Quota exceeded (businessprofileperformance).' ),
				),
			);
		}

		if ( 401 === $status || 503 === $status ) {
			return array(
				'status'  => 'skipped',
				'payload' => array(
					'skipped' => true,
					'reason'  => 503 === $status ? 'gmb_not_configured' : 'gmb_not_connected',
					'error'   => (string) ( $payload['error'] ?? 'Google Business Profile is unavailable.' ),
				),
			);
		}

		if ( 200 !== $status || empty( $payload['success'] ) ) {
			return array(
				'status'  => 'error',
				'payload' => array(
					'skipped' => true,
					'reason'  => 'gmb_error',
					'error'   => (string) ( $payload['error'] ?? 'Google My Business Leads fetch failed.' ),
				),
			);
		}

		$current = is_array( $payload['currentPeriod'] ?? null ) ? $payload['currentPeriod'] : array();
		$comp    = is_array( $payload['comparisonPeriod'] ?? null ) ? $payload['comparisonPeriod'] : array();

		$out = array(
			'success'    => true,
			'locationId' => Neo_Pulse_App_Gmb_Performance::normalize_location_id( $gbp_raw ),
			'primary'    => self::period_metrics( $current ),
		);
		if ( $include_compare ) {
			$out['compare'] = self::period_metrics( $comp );
		}
		if ( ! empty( $payload['apiWarning'] ) ) {
			$out['apiWarning'] = (string) $payload['apiWarning'];
		}

		return array(
			'status'  => 'ok',
			'payload' => $out,
		);
	}

	/**
	 * @param array<string,mixed> $period
	 * @return array{calls:int,chat:int,directions:int,websiteClicks:int}
	 */
	private static function period_metrics( array $period ): array {
		return array(
			'calls'         => (int) ( $period['calls'] ?? 0 ),
			'chat'          => (int) ( $period['chat'] ?? 0 ),
			'directions'    => (int) ( $period['directions'] ?? 0 ),
			'websiteClicks' => (int) ( $period['websiteClicks'] ?? 0 ),
		);
	}
}
