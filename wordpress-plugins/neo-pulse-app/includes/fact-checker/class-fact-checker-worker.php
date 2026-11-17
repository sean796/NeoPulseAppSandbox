<?php
/**
 * Fact Checker: product/service claims via OpenRouter web model.
 *
 * @package Neo_Pulse_App
 */

defined( 'ABSPATH' ) || exit;

class Neo_Pulse_App_Fact_Checker_Worker {

	const BATCH_SIZE = 1;
	const DRIVE_EVERY = 1;
	const WEB_MODEL = 'openai/gpt-4o:online';

	/** @var array<int,array<string,mixed>> */
	private static $api_notes = array();

	/**
	 * @param array<string,mixed> $event
	 */
	public static function note_api( array $event ): void {
		$kind = sanitize_key( (string) ( $event['kind'] ?? '' ) );
		if ( $kind === '' ) {
			return;
		}
		self::$api_notes[] = array(
			'kind'        => $kind,
			'model'       => (string) ( $event['model'] ?? '' ),
			'promptChars' => isset( $event['promptChars'] ) ? (int) $event['promptChars'] : null,
			'maxTokens'   => isset( $event['maxTokens'] ) ? (int) $event['maxTokens'] : null,
			'replyChars'  => isset( $event['replyChars'] ) ? (int) $event['replyChars'] : null,
			'finish'      => (string) ( $event['finish'] ?? '' ),
			'seconds'     => isset( $event['seconds'] ) ? (float) $event['seconds'] : null,
			'status'      => isset( $event['status'] ) ? (int) $event['status'] : null,
			'url'         => (string) ( $event['url'] ?? '' ),
			'label'       => (string) ( $event['label'] ?? '' ),
			'error'       => (string) ( $event['error'] ?? '' ),
			'rows'        => isset( $event['rows'] ) ? (int) $event['rows'] : null,
		);
	}

	/**
	 * @return array<int,array<string,mixed>>
	 */
	public static function drain_api_notes(): array {
		$notes           = self::$api_notes;
		self::$api_notes = array();
		return $notes;
	}

	/**
	 * @param array<string,mixed> $site
	 * @param array<string,mixed> $fetch
	 * @return array{pages:array<int,array<string,mixed>>,fetch:array<string,mixed>}|WP_Error
	 */
	public static function load_next_batch( array $site, array $fetch ) {
		return Neo_Pulse_App_Editorial_Content_Audit_Worker::load_next_batch( $site, $fetch );
	}

	/**
	 * @param array<string,mixed> $site
	 */
	public static function public_name( array $site ): string {
		return Neo_Pulse_App_Editorial_Content_Audit_Worker::public_name( $site );
	}

	/**
	 * City / state / country only. No streets or phones.
	 *
	 * @param array<string,mixed> $site
	 * @return array<string,mixed>
	 */
	public static function macro_location_context( array $site ): array {
		$locations = isset( $site['locations'] ) && is_array( $site['locations'] ) ? $site['locations'] : array();
		$rows      = array();
		foreach ( $locations as $loc ) {
			if ( ! is_array( $loc ) ) {
				continue;
			}
			$city = trim( (string) ( $loc['city'] ?? '' ) );
			if ( $city === '' ) {
				continue;
			}
			$rows[] = array(
				'city'    => $city,
				'state'   => trim( (string) ( $loc['state'] ?? '' ) ),
				'country' => trim( (string) ( $loc['country'] ?? '' ) ),
			);
		}
		$service_city    = trim( (string) ( $site['serviceCity'] ?? '' ) );
		$service_state   = trim( (string) ( $site['serviceState'] ?? '' ) );
		$service_country = trim( (string) ( $site['serviceCountry'] ?? '' ) );
		if ( $service_city !== '' ) {
			$already = false;
			foreach ( $rows as $row ) {
				if ( strcasecmp( (string) ( $row['city'] ?? '' ), $service_city ) === 0 ) {
					$already = true;
					break;
				}
			}
			if ( ! $already ) {
				$rows[] = array(
					'city'    => $service_city,
					'state'   => $service_state,
					'country' => $service_country,
				);
			}
		}
		$country = $service_country;
		if ( $country === '' && isset( $rows[0]['country'] ) ) {
			$country = trim( (string) $rows[0]['country'] );
		}
		return array(
			'name'           => self::public_name( $site ),
			'siteUrl'        => trim( (string) ( $site['siteUrl'] ?? '' ) ),
			'serviceCity'    => $service_city,
			'serviceState'   => $service_state,
			'serviceCountry' => $service_country,
			'country'        => $country,
			'locations'      => $rows,
		);
	}

	/**
	 * @param array<string,mixed> $page
	 * @param array<string,mixed> $macro
	 * @return array<int,array<string,mixed>>|WP_Error
	 */
	public static function check_page( array $page, array $macro ) {
		$model  = self::WEB_MODEL;
		$system = self::system_prompt();
		$user   = self::user_prompt( $page, $macro );
		$raw    = self::openrouter_json( $model, $system, $user );
		if ( is_wp_error( $raw ) ) {
			return $raw;
		}

		$claims_raw = isset( $raw['claims'] ) && is_array( $raw['claims'] ) ? $raw['claims'] : null;
		if ( $claims_raw === null ) {
			return new WP_Error( 'neo-pulse_fact_checker_json', 'OpenRouter reply missing claims array' );
		}

		$page_id   = (int) ( $page['id'] ?? 0 );
		$page_url  = (string) ( $page['url'] ?? '' );
		$site_url  = (string) ( $macro['siteUrl'] ?? '' );
		$site_host = (string) ( wp_parse_url( $site_url, PHP_URL_HOST ) ?: '' );
		$out       = array();
		$categories = array(
			'product_spec',
			'operating_system',
			'materials',
			'energy',
			'safety',
			'warranty',
			'pricing',
			'compatibility',
			'durability',
			'none',
		);
		$verdicts = array(
			'supported',
			'partially_supported',
			'unsupported',
			'outdated',
			'contradicted',
			'no_product_claims',
		);
		$source_types = array( 'manufacturer', 'manual', 'government', 'industry', '' );

		foreach ( $claims_raw as $row ) {
			if ( ! is_array( $row ) ) {
				return new WP_Error( 'neo-pulse_fact_checker_json', 'Claim row is not an object' );
			}
			$quote    = trim( (string) ( $row['quote'] ?? '' ) );
			$category = strtolower( trim( (string) ( $row['category'] ?? '' ) ) );
			$verdict  = strtolower( trim( (string) ( $row['verdict'] ?? '' ) ) );
			if ( $quote === '' || ! in_array( $category, $categories, true ) || ! in_array( $verdict, $verdicts, true ) ) {
				return new WP_Error( 'neo-pulse_fact_checker_json', 'Claim failed schema validation' );
			}
			$source_url  = trim( (string) ( $row['sourceUrl'] ?? '' ) );
			$source_type = strtolower( trim( (string) ( $row['sourceType'] ?? '' ) ) );
			if ( ! in_array( $source_type, $source_types, true ) ) {
				$source_type = '';
			}
			if ( $verdict === 'supported' || $verdict === 'partially_supported' ) {
				if ( ! preg_match( '#^https?://#i', $source_url ) ) {
					return new WP_Error( 'neo-pulse_fact_checker_json', 'Supported claim missing http(s) sourceUrl' );
				}
				$source_host = (string) ( wp_parse_url( $source_url, PHP_URL_HOST ) ?: '' );
				if ( $site_host !== '' && $source_host !== '' && strcasecmp( $site_host, $source_host ) === 0 ) {
					return new WP_Error( 'neo-pulse_fact_checker_json', 'Source URL must not be the client site' );
				}
			} else {
				$source_url = $source_url !== '' && preg_match( '#^https?://#i', $source_url ) ? $source_url : '';
			}
			$qualification = trim( (string) ( $row['qualification'] ?? '' ) );
			if ( $verdict === 'partially_supported' && $qualification === '' ) {
				return new WP_Error( 'neo-pulse_fact_checker_json', 'partially_supported needs qualification' );
			}
			$out[] = array(
				'pageId'           => $page_id,
				'url'              => $page_url,
				'title'            => (string) ( $page['title'] ?? '' ),
				'status'           => (string) ( $page['status'] ?? '' ),
				'type'             => (string) ( $page['type'] ?? '' ),
				'quote'            => $quote,
				'claimLink'        => self::claim_link( $page_url, $quote ),
				'category'         => $category,
				'verdict'          => $verdict,
				'sourceTitle'      => trim( (string) ( $row['sourceTitle'] ?? '' ) ),
				'sourceUrl'        => $source_url,
				'sourceType'       => $source_type,
				'qualification'    => $qualification,
				'suggestedWording' => trim( (string) ( $row['suggestedWording'] ?? '' ) ),
			);
			if ( count( $out ) >= 8 ) {
				break;
			}
		}

		if ( $out === array() ) {
			$out[] = array(
				'pageId'           => $page_id,
				'url'              => $page_url,
				'title'            => (string) ( $page['title'] ?? '' ),
				'status'           => (string) ( $page['status'] ?? '' ),
				'type'             => (string) ( $page['type'] ?? '' ),
				'quote'            => 'none',
				'claimLink'        => $page_url,
				'category'         => 'none',
				'verdict'          => 'no_product_claims',
				'sourceTitle'      => '',
				'sourceUrl'        => '',
				'sourceType'       => '',
				'qualification'    => '',
				'suggestedWording' => '',
			);
		}
		return $out;
	}

	public static function claim_link( string $page_url, string $quote ): string {
		$page_url = trim( $page_url );
		$quote    = trim( preg_replace( '/\s+/u', ' ', $quote ) ?? $quote );
		if ( $page_url === '' ) {
			return '';
		}
		if ( $quote === '' || strtolower( $quote ) === 'none' ) {
			return $page_url;
		}
		if ( function_exists( 'mb_substr' ) ) {
			$short = mb_substr( $quote, 0, 100 );
		} else {
			$short = substr( $quote, 0, 100 );
		}
		return $page_url . '#:~:text=' . rawurlencode( $short );
	}

	/**
	 * @param array<int,array<string,mixed>> $claims
	 * @param array<string,mixed>            $inventory
	 * @return array<string,mixed>
	 */
	public static function rollup( array $claims, array $inventory ): array {
		$by_verdict = array(
			'supported'            => 0,
			'partially_supported'  => 0,
			'unsupported'          => 0,
			'outdated'             => 0,
			'contradicted'         => 0,
			'no_product_claims'    => 0,
		);
		$material = 0;
		foreach ( $claims as $row ) {
			$v = (string) ( $row['verdict'] ?? '' );
			if ( isset( $by_verdict[ $v ] ) ) {
				++$by_verdict[ $v ];
			}
			if ( $v !== 'no_product_claims' ) {
				++$material;
			}
		}
		$pages = (int) ( $inventory['pageCount'] ?? 0 );
		$counts = array(
			'pagesAudited' => $pages,
			'claimCount'   => $material,
			'supported'    => $by_verdict['supported'],
			'partial'      => $by_verdict['partially_supported'],
			'unsupported'  => $by_verdict['unsupported'] + $by_verdict['outdated'] + $by_verdict['contradicted'],
		);
		$summary = $material === 0
			? 'No product or service claims needed checking on the audited pages.'
			: ( 'Checked ' . $material . ' product and service claims across ' . $pages . ' pages.' );
		return array(
			'counts'       => $counts,
			'summary'      => $summary,
			'mainProblems' => array(),
			'patterns'     => array(),
			'nextSteps'    => array( 'Review the fact-checker sheet and apply suggested wording where needed.' ),
		);
	}

	private static function system_prompt(): string {
		return 'You are a product claim fact-checker for WordPress blog posts and service-area pages. '
			. 'Return one complete JSON object and nothing else: '
			. '{"claims":[{"quote":"...","category":"product_spec|operating_system|materials|energy|safety|warranty|pricing|compatibility|durability|none","verdict":"supported|partially_supported|unsupported|outdated|contradicted|no_product_claims","sourceTitle":"...","sourceUrl":"https://...","sourceType":"manufacturer|manual|government|industry|","qualification":"...","suggestedWording":"..."}]}. '
			. 'Check product and service claims only. Do not check cities, phones, addresses, NAP, or serve/install geo claims. '
			. 'Use MACRO_LOCATION city/state/country only to pick the right manufacturer market (Hunter Douglas Canada when country is Canada). '
			. 'Prefer official manufacturer pages for that market, then manuals, then government or industry sources. '
			. 'Never cite the client site as a source. Never invent URLs. '
			. 'supported and partially_supported require an http(s) sourceUrl. partially_supported also requires qualification. '
			. 'At most 8 claims. Prefer specs, operating systems, materials, energy, safety, warranty, and compatibility. '
			. 'If the page has no product or service claims, return one claim with quote "none", category "none", verdict "no_product_claims". '
			. 'No em dashes. For Blind Spot, the public name is Blind Spot.';
	}

	/**
	 * @param array<string,mixed> $page
	 * @param array<string,mixed> $macro
	 */
	private static function user_prompt( array $page, array $macro ): string {
		$text = (string) ( $page['text'] ?? '' );
		if ( strlen( $text ) > 24000 ) {
			$text = substr( $text, 0, 24000 );
		}
		return "Act as a product claim fact-checker. Ground claims with web search. Prefer manufacturer docs for MACRO_LOCATION.country.\n\n"
			. "MACRO_LOCATION JSON:\n" . wp_json_encode( $macro ) . "\n\n"
			. "PAGE JSON:\n" . wp_json_encode(
				array(
					'id'     => (int) ( $page['id'] ?? 0 ),
					'url'    => (string) ( $page['url'] ?? '' ),
					'title'  => (string) ( $page['title'] ?? '' ),
					'status' => (string) ( $page['status'] ?? '' ),
					'type'   => (string) ( $page['type'] ?? '' ),
					'meta'   => (string) ( $page['meta'] ?? '' ),
				)
			) . "\n\n"
			. "PAGE TEXT:\n" . $text . "\n\n"
			. 'Extract important product and service claims. Search for sources. Return JSON claims only.';
	}

	/**
	 * @return array<string,mixed>|WP_Error
	 */
	private static function openrouter_json( string $model, string $system, string $user ) {
		$api_key = class_exists( 'Neo_Pulse_App_Secrets' ) ? Neo_Pulse_App_Secrets::openrouter_api_key() : '';
		if ( $api_key === '' ) {
			return new WP_Error( 'neo-pulse_openrouter', 'OpenRouter API key is not configured on the server' );
		}
		$headers = class_exists( 'Neo_Pulse_App_Openrouter_Attribution' )
			? Neo_Pulse_App_Openrouter_Attribution::request_headers( $api_key )
			: array(
				'Authorization' => 'Bearer ' . $api_key,
				'Content-Type'  => 'application/json',
			);
		$max_tokens   = 200000;
		$prompt_chars = strlen( $system ) + strlen( $user );
		$payload      = array(
			'model'           => $model,
			'temperature'     => 0.1,
			'max_tokens'      => $max_tokens,
			'response_format' => array( 'type' => 'json_object' ),
			'messages'        => array(
				array(
					'role'    => 'system',
					'content' => $system,
				),
				array(
					'role'    => 'user',
					'content' => $user,
				),
			),
			'reasoning'       => array(
				'effort'  => 'none',
				'exclude' => true,
			),
		);
		self::note_api(
			array(
				'kind'        => 'llm_call',
				'model'       => $model,
				'promptChars' => $prompt_chars,
				'maxTokens'   => $max_tokens,
			)
		);
		$started = microtime( true );
		$res     = wp_remote_post(
			'https://openrouter.ai/api/v1/chat/completions',
			array(
				'timeout' => 180,
				'headers' => $headers,
				'body'    => wp_json_encode( $payload ),
			)
		);
		$seconds = round( ( microtime( true ) - $started ), 1 );
		if ( is_wp_error( $res ) ) {
			self::note_api(
				array(
					'kind'    => 'llm_fail',
					'model'   => $model,
					'seconds' => $seconds,
					'status'  => 0,
					'error'   => $res->get_error_message(),
				)
			);
			return $res;
		}
		$code = (int) wp_remote_retrieve_response_code( $res );
		$body = (string) wp_remote_retrieve_body( $res );
		if ( $code < 200 || $code >= 300 ) {
			$snippet = substr( trim( wp_strip_all_tags( $body ) ), 0, 240 );
			self::note_api(
				array(
					'kind'    => 'llm_fail',
					'model'   => $model,
					'seconds' => $seconds,
					'status'  => $code,
					'error'   => $snippet !== '' ? $snippet : ( 'HTTP ' . $code ),
				)
			);
			return new WP_Error(
				'neo-pulse_openrouter_http',
				'OpenRouter HTTP ' . $code . ( $snippet !== '' ? ( ': ' . $snippet ) : '' )
			);
		}
		$decoded = json_decode( $body, true );
		$message = is_array( $decoded ) && isset( $decoded['choices'][0]['message'] ) && is_array( $decoded['choices'][0]['message'] )
			? $decoded['choices'][0]['message']
			: array();
		$content = self::openrouter_message_text( $message );
		$finish  = is_array( $decoded ) ? (string) ( $decoded['choices'][0]['finish_reason'] ?? 'stop' ) : 'stop';
		$served  = is_array( $decoded ) && isset( $decoded['model'] ) ? (string) $decoded['model'] : $model;
		$parsed  = json_decode( $content, true );
		if ( ! is_array( $parsed ) ) {
			$start = strpos( $content, '{' );
			$end   = strrpos( $content, '}' );
			if ( $start !== false && $end !== false && $end > $start ) {
				$parsed = json_decode( substr( $content, $start, $end - $start + 1 ), true );
			}
		}
		if ( ! is_array( $parsed ) ) {
			$why = function_exists( 'json_last_error_msg' ) ? json_last_error_msg() : 'invalid JSON';
			self::note_api(
				array(
					'kind'       => 'llm_fail',
					'model'      => $served,
					'seconds'    => $seconds,
					'status'     => $code,
					'replyChars' => strlen( $content ),
					'finish'     => $finish !== '' ? $finish : '?',
					'error'      => $why,
				)
			);
			return new WP_Error( 'neo-pulse_openrouter_json', 'OpenRouter reply was not JSON (' . $why . ')' );
		}
		self::note_api(
			array(
				'kind'       => 'llm_done',
				'model'      => $served,
				'replyChars' => strlen( $content ),
				'finish'     => $finish !== '' ? $finish : '?',
				'seconds'    => $seconds,
				'status'     => $code,
			)
		);
		return $parsed;
	}

	/**
	 * @param array<string,mixed> $message
	 */
	private static function openrouter_message_text( array $message ): string {
		$content = $message['content'] ?? '';
		if ( is_string( $content ) && trim( $content ) !== '' ) {
			return trim( $content );
		}
		if ( is_array( $content ) ) {
			$parts = array();
			foreach ( $content as $part ) {
				if ( is_array( $part ) && isset( $part['text'] ) && is_string( $part['text'] ) ) {
					$text = trim( $part['text'] );
					if ( $text !== '' ) {
						$parts[] = $text;
					}
				} elseif ( is_string( $part ) && trim( $part ) !== '' ) {
					$parts[] = trim( $part );
				}
			}
			$joined = trim( implode( "\n", $parts ) );
			if ( $joined !== '' ) {
				return $joined;
			}
		}
		return '';
	}
}
