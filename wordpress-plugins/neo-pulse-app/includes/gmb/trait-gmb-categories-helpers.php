<?php
/**
 * GBP category helpers: hints, Google list/get mapping, OpenRouter pick.
 *
 * @package Neo_Pulse_App
 */

defined( 'ABSPATH' ) || exit;

trait Neo_Pulse_App_Gmb_Categories_Trait_Helpers {

	/**
	 * @return array{statusCode:int,body:array<string,mixed>}|null
	 */
	private static function require_connected(): ?array {
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
		if ( ! is_array( $tokens ) || ( empty( $tokens['access_token'] ) && empty( $tokens['refresh_token'] ) ) ) {
			return array(
				'statusCode' => 401,
				'body'       => array(
					'success' => false,
					'error'   => 'Not connected. Use Log in to Google Business first.',
				),
			);
		}

		$access = Neo_Pulse_App_Gmb_Tokens::get_valid_access_token();
		if ( is_wp_error( $access ) ) {
			return array(
				'statusCode' => 401,
				'body'       => array(
					'success' => false,
					'error'   => $access->get_error_message(),
				),
			);
		}

		return null;
	}

	/**
	 * @return array{statusCode:int,body:array<string,mixed>}
	 */
	private static function error( int $status, string $message ): array {
		return array(
			'statusCode' => $status,
			'body'       => array(
				'success' => false,
				'error'   => $message,
			),
		);
	}

	private static function region_code_from_site_url( string $site_url ): string {
		$host = wp_parse_url( $site_url, PHP_URL_HOST );
		$host = is_string( $host ) ? strtolower( $host ) : '';
		if ( $host !== '' && str_ends_with( $host, '.ca' ) ) {
			return 'CA';
		}
		return 'US';
	}

	/**
	 * @param array<string,mixed> $body
	 * @return array<int,string>
	 */
	private static function collect_display_hints( array $body, string $keyword ): array {
		$hints = array();
		$push  = static function ( string $raw ) use ( &$hints ): void {
			foreach ( explode( ',', $raw ) as $comma_chunk ) {
				foreach ( explode( ';', $comma_chunk ) as $semi_chunk ) {
					foreach ( explode( '|', $semi_chunk ) as $part ) {
						$t = trim( (string) $part );
						if ( $t === '' || strcasecmp( $t, 'Uncategorized' ) === 0 ) {
							continue;
						}
						if ( ! in_array( $t, $hints, true ) ) {
							$hints[] = $t;
						}
					}
				}
			}
		};

		$benchmarks = isset( $body['categoryBenchmarks'] ) && is_array( $body['categoryBenchmarks'] )
			? $body['categoryBenchmarks']
			: array();
		foreach ( $benchmarks as $row ) {
			if ( ! is_array( $row ) ) {
				continue;
			}
			$push( (string) ( $row['category'] ?? '' ) );
			if ( count( $hints ) >= self::MAX_HINTS ) {
				return array_slice( $hints, 0, self::MAX_HINTS );
			}
		}

		$competitor_hints = isset( $body['competitorCategoryHints'] ) && is_array( $body['competitorCategoryHints'] )
			? $body['competitorCategoryHints']
			: array();
		foreach ( $competitor_hints as $hint ) {
			if ( is_string( $hint ) ) {
				$push( $hint );
			} elseif ( is_array( $hint ) ) {
				$push( (string) ( $hint['primary'] ?? $hint['primaryCategory'] ?? '' ) );
				$push( (string) ( $hint['secondary'] ?? $hint['secondaryCategories'] ?? '' ) );
			}
			if ( count( $hints ) >= self::MAX_HINTS ) {
				return array_slice( $hints, 0, self::MAX_HINTS );
			}
		}

		if ( $keyword !== '' ) {
			$push( $keyword );
		}

		return array_slice( $hints, 0, self::MAX_HINTS );
	}

	/**
	 * @return array{primary:?array{name:string,displayName:string},additional:array<int,array{name:string,displayName:string}>}|WP_Error
	 */
	private static function fetch_location_categories( string $access_token, string $location_resource ) {
		$url      = self::BUSINESS_INFO_BASE . '/' . $location_resource . '?readMask=name,title,categories';
		$response = wp_remote_get(
			$url,
			array(
				'timeout' => 25,
				'headers' => array( 'Authorization' => 'Bearer ' . $access_token ),
			)
		);
		if ( is_wp_error( $response ) ) {
			return $response;
		}
		$code = (int) wp_remote_retrieve_response_code( $response );
		$data = json_decode( (string) wp_remote_retrieve_body( $response ), true );
		if ( $code < 200 || $code >= 300 || ! is_array( $data ) ) {
			$msg = is_array( $data ) ? (string) ( $data['error']['message'] ?? 'Failed to read GBP location categories.' ) : 'Failed to read GBP location categories.';
			return new WP_Error( 'neo_pulse_gmb_categories_read', $msg );
		}
		return self::map_categories_from_location( $data );
	}

	/**
	 * @param array<string,mixed> $location
	 * @return array{primary:?array{name:string,displayName:string},additional:array<int,array{name:string,displayName:string}>}
	 */
	private static function map_categories_from_location( array $location ): array {
		$cats    = isset( $location['categories'] ) && is_array( $location['categories'] ) ? $location['categories'] : array();
		$primary = null;
		$raw_pri = isset( $cats['primaryCategory'] ) && is_array( $cats['primaryCategory'] ) ? $cats['primaryCategory'] : null;
		if ( is_array( $raw_pri ) ) {
			$name = self::normalize_category_name( (string) ( $raw_pri['name'] ?? '' ) );
			if ( $name !== '' ) {
				$primary = array(
					'name'        => $name,
					'displayName' => trim( (string) ( $raw_pri['displayName'] ?? $name ) ),
				);
			}
		}
		$additional = array();
		$raw_add    = isset( $cats['additionalCategories'] ) && is_array( $cats['additionalCategories'] )
			? $cats['additionalCategories']
			: array();
		foreach ( $raw_add as $row ) {
			if ( ! is_array( $row ) ) {
				continue;
			}
			$name = self::normalize_category_name( (string) ( $row['name'] ?? '' ) );
			if ( $name === '' ) {
				continue;
			}
			$additional[] = array(
				'name'        => $name,
				'displayName' => trim( (string) ( $row['displayName'] ?? $name ) ),
			);
		}
		return array(
			'primary'    => $primary,
			'additional' => $additional,
		);
	}

	/**
	 * @param array<int,string> $hints
	 * @return array<int,array{name:string,displayName:string}>|WP_Error
	 */
	private static function resolve_category_candidates( string $access_token, string $region_code, array $hints ) {
		$by_name = array();
		foreach ( $hints as $hint ) {
			$query = self::categories_list_query( $access_token, $region_code, $hint );
			if ( is_wp_error( $query ) ) {
				return $query;
			}
			foreach ( $query as $cat ) {
				$by_name[ $cat['name'] ] = $cat;
				if ( count( $by_name ) >= self::MAX_CANDIDATES ) {
					break 2;
				}
			}
		}
		return array_values( $by_name );
	}

	/**
	 * @return array<int,array{name:string,displayName:string}>|WP_Error
	 */
	private static function categories_list_query( string $access_token, string $region_code, string $display_hint ) {
		$query    = http_build_query(
			array(
				'regionCode'   => $region_code,
				'languageCode' => 'en',
				'filter'       => 'displayName=' . $display_hint,
				'pageSize'     => 20,
				'view'         => 'BASIC',
			)
		);
		$url      = self::BUSINESS_INFO_BASE . '/categories?' . $query;
		$response = wp_remote_get(
			$url,
			array(
				'timeout' => 25,
				'headers' => array( 'Authorization' => 'Bearer ' . $access_token ),
			)
		);
		if ( is_wp_error( $response ) ) {
			return $response;
		}
		$code = (int) wp_remote_retrieve_response_code( $response );
		$data = json_decode( (string) wp_remote_retrieve_body( $response ), true );
		if ( $code < 200 || $code >= 300 ) {
			$msg = is_array( $data ) ? (string) ( $data['error']['message'] ?? 'categories.list failed.' ) : 'categories.list failed.';
			return new WP_Error( 'neo_pulse_gmb_categories_list', $msg );
		}
		$out        = array();
		$categories = isset( $data['categories'] ) && is_array( $data['categories'] ) ? $data['categories'] : array();
		foreach ( $categories as $row ) {
			if ( ! is_array( $row ) ) {
				continue;
			}
			$name = self::normalize_category_name( (string) ( $row['name'] ?? '' ) );
			if ( $name === '' ) {
				continue;
			}
			$out[] = array(
				'name'        => $name,
				'displayName' => trim( (string) ( $row['displayName'] ?? $name ) ),
			);
		}
		return $out;
	}

	private static function normalize_category_name( string $raw ): string {
		$name = trim( $raw );
		if ( $name === '' ) {
			return '';
		}
		if ( str_starts_with( $name, 'categories/' ) ) {
			return $name;
		}
		if ( str_starts_with( $name, 'gcid:' ) ) {
			return 'categories/' . $name;
		}
		return $name;
	}

	/**
	 * @param array{primary:?array{name:string,displayName:string},additional:array<int,array{name:string,displayName:string}>} $current
	 * @param array<string,mixed> $body
	 * @param array<int,array{name:string,displayName:string}> $candidates
	 * @return array{primaryCategoryName:string,additionalCategoryNames:array<int,string>,rationale:string}
	 */
	private static function openrouter_pick_categories(
		string $api_key,
		string $site_name,
		string $site_url,
		string $keyword,
		array $current,
		array $body,
		array $candidates
	): array {
		$candidate_lines = array();
		foreach ( $candidates as $c ) {
			$candidate_lines[] = $c['name'] . ' | ' . $c['displayName'];
		}

		$benchmark_lines = array();
		$benchmarks      = isset( $body['categoryBenchmarks'] ) && is_array( $body['categoryBenchmarks'] )
			? $body['categoryBenchmarks']
			: array();
		foreach ( array_slice( $benchmarks, 0, 8 ) as $row ) {
			if ( ! is_array( $row ) ) {
				continue;
			}
			$cat = trim( (string) ( $row['category'] ?? '' ) );
			if ( $cat === '' ) {
				continue;
			}
			$share             = isset( $row['top3SharePct'] ) ? (string) $row['top3SharePct'] : '';
			$benchmark_lines[] = $cat . ( $share !== '' ? ' (top3 share ' . $share . '%)' : '' );
		}

		$current_primary = is_array( $current['primary'] ?? null )
			? ( (string) ( $current['primary']['displayName'] ?? '' ) . ' [' . (string) ( $current['primary']['name'] ?? '' ) . ']' )
			: '(none)';
		$current_add     = array();
		foreach ( $current['additional'] as $row ) {
			$current_add[] = (string) ( $row['displayName'] ?? '' ) . ' [' . (string) ( $row['name'] ?? '' ) . ']';
		}

		$system = 'You pick Google Business Profile categories for a local business. '
			. 'Choose exactly one primaryCategoryName and up to 9 additionalCategoryNames. '
			. 'Every name MUST be copied verbatim from the CANDIDATES list (the name field before the pipe). '
			. 'Never invent category names or gcid values. Prefer categories that match the website and services, '
			. 'and that align with Local Grid winners when they fit the real business. '
			. 'Output JSON only: {"primaryCategoryName":"categories/gcid:...","additionalCategoryNames":["categories/gcid:..."],"rationale":"one short sentence"}.';

		$user = "Business: {$site_name}\nWebsite: {$site_url}\nScan keyword: {$keyword}\n"
			. "Current primary: {$current_primary}\n"
			. 'Current additional: ' . ( count( $current_add ) ? implode( '; ', $current_add ) : '(none)' ) . "\n"
			. "Grid primary category dominance:\n" . ( count( $benchmark_lines ) ? implode( "\n", $benchmark_lines ) : '(none)' ) . "\n"
			. "CANDIDATES (name | displayName):\n" . implode( "\n", $candidate_lines );

		$parsed = Neo_Pulse_App_Vertical_Benchmark_Openrouter::json_completion(
			array(
				array(
					'role'    => 'system',
					'content' => $system,
				),
				array(
					'role'    => 'user',
					'content' => $user,
				),
			),
			array(
				'apiKey'      => $api_key,
				'temperature' => 0.2,
				'maxTokens'   => 800,
			)
		);

		$primary = self::normalize_category_name( (string) ( $parsed['primaryCategoryName'] ?? '' ) );
		$extra   = array();
		$raw_ex  = isset( $parsed['additionalCategoryNames'] ) && is_array( $parsed['additionalCategoryNames'] )
			? $parsed['additionalCategoryNames']
			: array();
		foreach ( $raw_ex as $name ) {
			$n = self::normalize_category_name( (string) $name );
			if ( $n !== '' ) {
				$extra[] = $n;
			}
		}

		return array(
			'primaryCategoryName'     => $primary,
			'additionalCategoryNames' => $extra,
			'rationale'               => trim( (string) ( $parsed['rationale'] ?? '' ) ),
		);
	}
}
