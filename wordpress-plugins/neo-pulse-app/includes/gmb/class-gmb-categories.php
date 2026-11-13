<?php
/**
 * GBP category recommend (grid + site → gcid) and apply (locations.patch).
 *
 * @package Neo_Pulse_App
 */

defined( 'ABSPATH' ) || exit;

require_once __DIR__ . '/trait-gmb-categories-helpers.php';

class Neo_Pulse_App_Gmb_Categories {

	const BUSINESS_INFO_BASE = 'https://mybusinessbusinessinformation.googleapis.com/v1';
	const MAX_ADDITIONAL     = 9;
	const MAX_HINTS          = 12;
	const MAX_CANDIDATES     = 40;

	use Neo_Pulse_App_Gmb_Categories_Trait_Helpers;

	/**
	 * @param array<string,mixed> $body
	 * @return array{statusCode:int,body:array<string,mixed>}
	 */
	public static function recommend( array $body ): array {
		$gate = self::require_connected();
		if ( $gate !== null ) {
			return $gate;
		}

		$raw_location = trim( (string) ( $body['gbpLocationId'] ?? '' ) );
		$site_name    = trim( (string) ( $body['siteName'] ?? '' ) );
		$site_url     = trim( (string) ( $body['siteUrl'] ?? '' ) );
		$keyword      = trim( (string) ( $body['keyword'] ?? '' ) );
		$api_key      = Neo_Pulse_App_Vertical_Benchmark_Openrouter::resolve_key( (string) ( $body['openRouterApiKey'] ?? '' ) );
		if ( $api_key === '' ) {
			return self::error( 400, 'openRouterApiKey is required (or set OPENROUTER_API_KEY).' );
		}

		$hints = self::collect_display_hints( $body, $keyword );
		if ( count( $hints ) === 0 ) {
			return self::error( 400, 'No category hints from the Local Grid report. Run a scan with category data first.' );
		}

		$access_token = Neo_Pulse_App_Gmb_Tokens::get_valid_access_token();
		if ( is_wp_error( $access_token ) ) {
			return self::error( 401, $access_token->get_error_message() );
		}

		$location_resource = Neo_Pulse_App_Gmb_Posts_Api::resolve_business_info_location(
			$access_token,
			$raw_location,
			$site_name,
			$site_url
		);
		if ( is_wp_error( $location_resource ) ) {
			return self::error( 422, $location_resource->get_error_message() );
		}

		$current = self::fetch_location_categories( $access_token, $location_resource );
		if ( is_wp_error( $current ) ) {
			return self::error( 422, $current->get_error_message() );
		}

		$region_code = self::region_code_from_site_url( $site_url );
		$candidates  = self::resolve_category_candidates( $access_token, $region_code, $hints );
		if ( is_wp_error( $candidates ) ) {
			return self::error( 422, $candidates->get_error_message() );
		}
		if ( count( $candidates ) === 0 ) {
			return self::error( 422, 'No Google Business categories matched the grid category names for region ' . $region_code . '.' );
		}

		try {
			$picked = self::openrouter_pick_categories(
				$api_key,
				$site_name,
				$site_url,
				$keyword,
				$current,
				$body,
				$candidates
			);
		} catch ( Exception $e ) {
			return self::error( 422, $e->getMessage() );
		}

		$candidate_by_name = array();
		foreach ( $candidates as $c ) {
			$candidate_by_name[ $c['name'] ] = $c;
		}

		$primary_name = (string) ( $picked['primaryCategoryName'] ?? '' );
		if ( $primary_name === '' || ! isset( $candidate_by_name[ $primary_name ] ) ) {
			return self::error( 422, 'OpenRouter primary category was not in the Google candidate list.' );
		}

		$additional_names = array();
		$raw_additional   = isset( $picked['additionalCategoryNames'] ) && is_array( $picked['additionalCategoryNames'] )
			? $picked['additionalCategoryNames']
			: array();
		foreach ( $raw_additional as $name ) {
			$name = trim( (string) $name );
			if ( $name === '' || $name === $primary_name ) {
				continue;
			}
			if ( ! isset( $candidate_by_name[ $name ] ) ) {
				return self::error( 422, 'OpenRouter additional category was not in the Google candidate list: ' . $name );
			}
			if ( ! in_array( $name, $additional_names, true ) ) {
				$additional_names[] = $name;
			}
			if ( count( $additional_names ) >= self::MAX_ADDITIONAL ) {
				break;
			}
		}

		$proposed_additional = array();
		foreach ( $additional_names as $name ) {
			$proposed_additional[] = $candidate_by_name[ $name ];
		}

		return array(
			'statusCode' => 200,
			'body'       => array(
				'success'    => true,
				'location'   => $location_resource,
				'regionCode' => $region_code,
				'current'    => $current,
				'proposed'   => array(
					'primary'    => $candidate_by_name[ $primary_name ],
					'additional' => $proposed_additional,
				),
				'candidates' => $candidates,
				'rationale'  => trim( (string) ( $picked['rationale'] ?? '' ) ),
			),
		);
	}

	/**
	 * Recommend then patch in one request (no client preview step).
	 *
	 * @param array<string,mixed> $body
	 * @return array{statusCode:int,body:array<string,mixed>}
	 */
	public static function write( array $body ): array {
		$recommended = self::recommend( $body );
		if ( (int) ( $recommended['statusCode'] ?? 0 ) !== 200 || empty( $recommended['body']['success'] ) ) {
			return $recommended;
		}

		$proposed = isset( $recommended['body']['proposed'] ) && is_array( $recommended['body']['proposed'] )
			? $recommended['body']['proposed']
			: array();
		$primary  = isset( $proposed['primary'] ) && is_array( $proposed['primary'] ) ? $proposed['primary'] : array();
		$primary_name = trim( (string) ( $primary['name'] ?? '' ) );
		if ( $primary_name === '' ) {
			return self::error( 422, 'Recommendation returned no primary category.' );
		}

		$additional_names = array();
		$raw_additional   = isset( $proposed['additional'] ) && is_array( $proposed['additional'] )
			? $proposed['additional']
			: array();
		foreach ( $raw_additional as $row ) {
			if ( ! is_array( $row ) ) {
				continue;
			}
			$name = trim( (string) ( $row['name'] ?? '' ) );
			if ( $name !== '' && $name !== $primary_name ) {
				$additional_names[] = $name;
			}
		}

		$applied = self::apply(
			array(
				'gbpLocationId'            => (string) ( $body['gbpLocationId'] ?? '' ),
				'siteName'                 => (string) ( $body['siteName'] ?? '' ),
				'siteUrl'                  => (string) ( $body['siteUrl'] ?? '' ),
				'primaryCategoryName'      => $primary_name,
				'additionalCategoryNames'  => $additional_names,
			)
		);
		if ( (int) ( $applied['statusCode'] ?? 0 ) !== 200 || empty( $applied['body']['success'] ) ) {
			return $applied;
		}

		return array(
			'statusCode' => 200,
			'body'       => array(
				'success'    => true,
				'location'   => (string) ( $applied['body']['location'] ?? '' ),
				'written'    => $applied['body']['written'] ?? array( 'primary' => null, 'additional' => array() ),
				'rationale'  => trim( (string) ( $recommended['body']['rationale'] ?? '' ) ),
				'proposed'   => $proposed,
				'current'    => $recommended['body']['current'] ?? array( 'primary' => null, 'additional' => array() ),
			),
		);
	}

	/**
	 * @param array<string,mixed> $body
	 * @return array{statusCode:int,body:array<string,mixed>}
	 */
	public static function apply( array $body ): array {
		$gate = self::require_connected();
		if ( $gate !== null ) {
			return $gate;
		}

		$raw_location = trim( (string) ( $body['gbpLocationId'] ?? '' ) );
		$site_name    = trim( (string) ( $body['siteName'] ?? '' ) );
		$site_url     = trim( (string) ( $body['siteUrl'] ?? '' ) );

		$primary_name = self::normalize_category_name( (string) ( $body['primaryCategoryName'] ?? '' ) );
		if ( $primary_name === '' ) {
			return self::error( 400, 'primaryCategoryName is required.' );
		}

		$additional_names = array();
		$raw_additional   = isset( $body['additionalCategoryNames'] ) && is_array( $body['additionalCategoryNames'] )
			? $body['additionalCategoryNames']
			: array();
		foreach ( $raw_additional as $name ) {
			$name = self::normalize_category_name( (string) $name );
			if ( $name === '' || $name === $primary_name ) {
				continue;
			}
			if ( ! in_array( $name, $additional_names, true ) ) {
				$additional_names[] = $name;
			}
			if ( count( $additional_names ) >= self::MAX_ADDITIONAL ) {
				break;
			}
		}

		$access_token = Neo_Pulse_App_Gmb_Tokens::get_valid_access_token();
		if ( is_wp_error( $access_token ) ) {
			return self::error( 401, $access_token->get_error_message() );
		}

		$location_resource = Neo_Pulse_App_Gmb_Posts_Api::resolve_business_info_location(
			$access_token,
			$raw_location,
			$site_name,
			$site_url
		);
		if ( is_wp_error( $location_resource ) ) {
			return self::error( 422, $location_resource->get_error_message() );
		}

		$additional_body = array();
		foreach ( $additional_names as $name ) {
			$additional_body[] = array( 'name' => $name );
		}

		$payload = array(
			'categories' => array(
				'primaryCategory'      => array( 'name' => $primary_name ),
				'additionalCategories' => $additional_body,
			),
		);

		$url      = self::BUSINESS_INFO_BASE . '/' . $location_resource . '?updateMask=categories';
		$response = wp_remote_request(
			$url,
			array(
				'method'  => 'PATCH',
				'timeout' => 30,
				'headers' => array(
					'Authorization' => 'Bearer ' . $access_token,
					'Content-Type'  => 'application/json',
				),
				'body'    => wp_json_encode( $payload ),
			)
		);

		if ( is_wp_error( $response ) ) {
			return self::error( 422, $response->get_error_message() );
		}

		$code = (int) wp_remote_retrieve_response_code( $response );
		$data = json_decode( (string) wp_remote_retrieve_body( $response ), true );
		if ( $code < 200 || $code >= 300 ) {
			$msg = is_array( $data ) ? (string) ( $data['error']['message'] ?? $data['message'] ?? 'GBP category update failed.' ) : 'GBP category update failed.';
			return self::error( 422, $msg );
		}

		$written = self::map_categories_from_location( is_array( $data ) ? $data : array() );

		return array(
			'statusCode' => 200,
			'body'       => array(
				'success'  => true,
				'location' => $location_resource,
				'written'  => $written,
			),
		);
	}
}
