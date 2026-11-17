<?php
/**
 * Editorial content audit: inventory posts + service-area, OpenRouter page audit, rollup.
 *
 * @package Neo_Pulse_App
 */

defined( 'ABSPATH' ) || exit;

class Neo_Pulse_App_Editorial_Content_Audit_Worker {

	/** One page per worker tick so HTTP polls and PHP timeouts stay short. */
	const BATCH_SIZE = 1;

	/** Rewrite the findings CSV after every audited page so errors land before the next URL. */
	const DRIVE_EVERY = 1;

	/** @var array<int,array<string,mixed>> */
	private static $api_notes = array();

	/**
	 * Blog Ideas Studio style console event.
	 *
	 * @param array<string,mixed> $event
	 */
	public static function note_api( array $event ): void {
		$kind = sanitize_key( (string) ( $event['kind'] ?? '' ) );
		if ( $kind === '' ) {
			return;
		}
		self::$api_notes[] = array(
			'kind'       => $kind,
			'model'      => (string) ( $event['model'] ?? '' ),
			'promptChars'=> isset( $event['promptChars'] ) ? (int) $event['promptChars'] : null,
			'maxTokens'  => isset( $event['maxTokens'] ) ? (int) $event['maxTokens'] : null,
			'replyChars' => isset( $event['replyChars'] ) ? (int) $event['replyChars'] : null,
			'finish'     => (string) ( $event['finish'] ?? '' ),
			'seconds'    => isset( $event['seconds'] ) ? (float) $event['seconds'] : null,
			'status'     => isset( $event['status'] ) ? (int) $event['status'] : null,
			'url'        => (string) ( $event['url'] ?? '' ),
			'label'      => (string) ( $event['label'] ?? '' ),
			'error'      => (string) ( $event['error'] ?? '' ),
			'rows'       => isset( $event['rows'] ) ? (int) $event['rows'] : null,
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
	 * @return array<string,mixed>|WP_Error
	 */
	/**
	 * One REST page of posts or service-area pages, then the caller audits what it got.
	 *
	 * @param array<string,mixed> $site
	 * @param array<string,mixed> $fetch
	 * @return array{pages:array<int,array<string,mixed>>,fetch:array<string,mixed>}|WP_Error
	 */
	public static function load_next_batch( array $site, array $fetch ) {
		$site_url     = trim( (string) ( $site['siteUrl'] ?? '' ) );
		$username     = trim( (string) ( $site['username'] ?? '' ) );
		$app_password = (string) ( $site['appPassword'] ?? '' );
		if ( $site_url === '' || $username === '' || $app_password === '' ) {
			return new WP_Error( 'neo-pulse_editorial_audit_auth', 'Site is missing WordPress credentials' );
		}
		$normalized = Neo_Pulse_App_Wp_Url_Normalize::normalize_url( $site_url );
		$sources    = self::inventory_sources( $site );
		$index      = (int) ( $fetch['sourceIndex'] ?? 0 );
		$page_no    = max( 1, (int) ( $fetch['page'] ?? 1 ) );
		if ( $index >= count( $sources ) ) {
			return array(
				'pages' => array(),
				'fetch' => array( 'sourceIndex' => $index, 'page' => 1, 'done' => true ),
			);
		}
		$source = $sources[ $index ];
		$started = microtime( true );
		$result  = Neo_Pulse_App_Wp_Inventory_Collector::collect_page(
			$normalized,
			$username,
			$app_password,
			(string) $source['collection'],
			true,
			(string) $source['status'],
			$page_no
		);
		$ms = (int) round( ( microtime( true ) - $started ) * 1000 );
		self::note_api(
			array(
				'kind'    => empty( $result['ok'] ) ? 'publish_fail' : 'publish',
				'url'     => rtrim( $normalized, '/' ) . '/wp-json/wp/v2/' . $source['collection'] . '?status=' . $source['status'] . '&page=' . $page_no,
				'status'  => empty( $result['ok'] ) ? 0 : 200,
				'seconds' => $ms / 1000,
				'rows'    => count( (array) ( $result['rows'] ?? array() ) ),
				'label'   => $source['collection'] . ' ' . $source['status'] . ' page ' . $page_no,
				'error'   => empty( $result['ok'] ) ? (string) ( $result['error'] ?? 'failed' ) : '',
			)
		);
		if ( empty( $result['ok'] ) ) {
			return new WP_Error(
				'neo-pulse_editorial_audit_posts',
				(string) ( $result['error'] ?? 'Could not load posts' )
			);
		}
		$mapped = array();
		foreach ( (array) ( $result['rows'] ?? array() ) as $row ) {
			if ( ! is_array( $row ) ) {
				continue;
			}
			$page = self::map_page_row( $row, (string) $source['type'], (string) $source['status'] );
			if ( $page ) {
				$mapped[] = $page;
			}
		}
		$total_pages = (int) ( $result['totalPages'] ?? 1 );
		$per_page    = (int) ( $result['perPage'] ?? 20 );
		$next        = array( 'sourceIndex' => $index, 'page' => $page_no + 1, 'done' => false );
		if ( $page_no >= $total_pages || count( (array) ( $result['rows'] ?? array() ) ) < $per_page ) {
			$next['sourceIndex'] = $index + 1;
			$next['page']        = 1;
			$next['done']        = $next['sourceIndex'] >= count( $sources );
		}
		return array( 'pages' => $mapped, 'fetch' => $next );
	}

	/**
	 * @param array<string,mixed> $site
	 * @return array<int,array{collection:string,status:string,type:string}>
	 */
	private static function inventory_sources( array $site ): array {
		$sources = array(
			array( 'collection' => 'posts', 'status' => 'publish', 'type' => 'post' ),
			array( 'collection' => 'posts', 'status' => 'future', 'type' => 'post' ),
			array( 'collection' => 'posts', 'status' => 'draft', 'type' => 'post' ),
		);
		$entity = Neo_Pulse_App_Wp_Url_Normalize::resolve_secondary_rest_collection(
			$site['manualEndpoint'] ?? null,
			$site['entitySitemapUrl'] ?? null
		);
		if ( is_string( $entity ) && $entity !== '' ) {
			foreach ( array( 'publish', 'future', 'draft' ) as $status ) {
				$sources[] = array( 'collection' => $entity, 'status' => $status, 'type' => $entity );
			}
		}
		return $sources;
	}

	/**
	 * @param array<string,mixed> $site
	 * @return array<string,mixed>|WP_Error
	 */
	public static function build_inventory( array $site ) {
		$site_url     = trim( (string) ( $site['siteUrl'] ?? '' ) );
		$username     = trim( (string) ( $site['username'] ?? '' ) );
		$app_password = (string) ( $site['appPassword'] ?? '' );
		if ( $site_url === '' || $username === '' || $app_password === '' ) {
			return new WP_Error( 'neo-pulse_editorial_audit_auth', 'Site is missing WordPress credentials' );
		}

		$normalized = Neo_Pulse_App_Wp_Url_Normalize::normalize_url( $site_url );
		$pages      = array();

		foreach ( array( 'publish', 'future', 'draft' ) as $status ) {
			$started = microtime( true );
			$result = Neo_Pulse_App_Wp_Inventory_Collector::collect(
				$normalized,
				$username,
				$app_password,
				'posts',
				true,
				false,
				false,
				$status,
				null,
				null
			);
			$ms = (int) round( ( microtime( true ) - $started ) * 1000 );
			self::note_api(
				array(
					'kind'    => empty( $result['ok'] ) ? 'publish_fail' : 'publish',
					'url'     => rtrim( $normalized, '/' ) . '/wp-json/wp/v2/posts?status=' . $status,
					'status'  => empty( $result['ok'] ) ? 0 : 200,
					'seconds' => $ms / 1000,
					'rows'    => count( (array) ( $result['rows'] ?? array() ) ),
					'label'   => 'posts ' . $status,
					'error'   => empty( $result['ok'] ) ? (string) ( $result['error'] ?? 'failed' ) : '',
				)
			);
			if ( empty( $result['ok'] ) ) {
				return new WP_Error(
					'neo-pulse_editorial_audit_posts',
					(string) ( $result['error'] ?? 'Could not load blog posts' )
				);
			}
			foreach ( (array) ( $result['rows'] ?? array() ) as $row ) {
				$mapped = self::map_page_row( $row, 'post', $status );
				if ( $mapped ) {
					$pages[] = $mapped;
				}
			}
		}

		$entity = Neo_Pulse_App_Wp_Url_Normalize::resolve_secondary_rest_collection(
			$site['manualEndpoint'] ?? null,
			$site['entitySitemapUrl'] ?? null
		);
		if ( is_string( $entity ) && $entity !== '' ) {
			foreach ( array( 'publish', 'future', 'draft' ) as $status ) {
				$started = microtime( true );
				$result = Neo_Pulse_App_Wp_Inventory_Collector::collect(
					$normalized,
					$username,
					$app_password,
					$entity,
					true,
					false,
					false,
					$status,
					null,
					null
				);
				$ms = (int) round( ( microtime( true ) - $started ) * 1000 );
				self::note_api(
					array(
						'kind'    => empty( $result['ok'] ) ? 'publish_fail' : 'publish',
						'url'     => rtrim( $normalized, '/' ) . '/wp-json/wp/v2/' . $entity . '?status=' . $status,
						'status'  => empty( $result['ok'] ) ? 0 : 200,
						'seconds' => $ms / 1000,
						'rows'    => count( (array) ( $result['rows'] ?? array() ) ),
						'label'   => $entity . ' ' . $status,
						'error'   => empty( $result['ok'] ) ? (string) ( $result['error'] ?? 'failed' ) : '',
					)
				);
				if ( empty( $result['ok'] ) ) {
					return new WP_Error(
						'neo-pulse_editorial_audit_entities',
						(string) ( $result['error'] ?? 'Could not load service-area pages' )
					);
				}
				foreach ( (array) ( $result['rows'] ?? array() ) as $row ) {
					$mapped = self::map_page_row( $row, $entity, $status );
					if ( $mapped ) {
						$pages[] = $mapped;
					}
				}
			}
		}

		$by_key = array();
		foreach ( $pages as $page ) {
			$key = (string) ( $page['type'] ?? '' ) . ':' . (int) ( $page['id'] ?? 0 );
			$by_key[ $key ] = $page;
		}

		return array(
			'siteId'    => (string) ( $site['id'] ?? '' ),
			'siteName'  => self::public_name( $site ),
			'entityType'=> is_string( $entity ) ? $entity : '',
			'pageCount' => count( $by_key ),
			'pages'     => array_values( $by_key ),
			'property'  => self::property_context( $site ),
		);
	}

	/**
	 * Audit one page via OpenRouter. Returns findings for that page.
	 *
	 * @param array<string,mixed> $page
	 * @param array<string,mixed> $property
	 * @return array<int,array<string,mixed>>|WP_Error
	 */
	public static function audit_page( array $page, array $property ) {
		$model  = Neo_Pulse_App_Openrouter_Agent_Models::resolve( Neo_Pulse_App_Openrouter_Agent_Models::CATEGORY_DECISION );
		$system = self::system_prompt();
		$user   = self::user_prompt( $page, $property );
		$raw    = self::openrouter_json( $model, $system, $user );
		if ( is_wp_error( $raw ) ) {
			return $raw;
		}

		$findings_raw = isset( $raw['findings'] ) && is_array( $raw['findings'] ) ? $raw['findings'] : null;
		if ( $findings_raw === null ) {
			return new WP_Error( 'neo-pulse_editorial_audit_json', 'OpenRouter reply missing findings array' );
		}

		$page_id  = (int) ( $page['id'] ?? 0 );
		$out      = array();
		$allowed_sev = array( 'high', 'medium', 'low' );
		$allowed_cer = array( 'proven', 'confirm' );
		foreach ( $findings_raw as $row ) {
			if ( ! is_array( $row ) ) {
				return new WP_Error( 'neo-pulse_editorial_audit_json', 'Finding row is not an object' );
			}
			$severity  = strtolower( trim( (string) ( $row['severity'] ?? '' ) ) );
			$certainty = strtolower( trim( (string) ( $row['certainty'] ?? '' ) ) );
			$quote     = trim( (string) ( $row['quote'] ?? '' ) );
			$problem   = trim( (string) ( $row['problem'] ?? '' ) );
			$fix       = trim( (string) ( $row['fix'] ?? '' ) );
			if ( ! in_array( $severity, $allowed_sev, true )
				|| ! in_array( $certainty, $allowed_cer, true )
				|| $quote === ''
				|| $problem === ''
				|| $fix === ''
			) {
				return new WP_Error( 'neo-pulse_editorial_audit_json', 'Finding failed schema validation' );
			}
			if ( self::finding_is_price_confirm( $certainty, $problem, $fix ) ) {
				continue;
			}
			if ( self::finding_is_company_self_claim( $problem, $fix ) ) {
				continue;
			}
			$fix = self::specific_place_fix( $fix );
			if ( self::finding_attacks_listed_city( $problem, $fix, $property ) ) {
				continue;
			}
			$out[] = array(
				'pageId'    => $page_id,
				'url'       => (string) ( $page['url'] ?? '' ),
				'title'     => (string) ( $page['title'] ?? '' ),
				'status'    => (string) ( $page['status'] ?? '' ),
				'type'      => (string) ( $page['type'] ?? '' ),
				'severity'  => $severity,
				'certainty' => $certainty,
				'quote'     => $quote,
				'problem'   => $problem,
				'fix'       => $fix,
			);
		}
		foreach ( self::phone_findings( $page, $property ) as $phone_row ) {
			$out[] = $phone_row;
		}
		return $out;
	}

	private static function digits_only( string $value ): string {
		$out = '';
		$len = strlen( $value );
		for ( $i = 0; $i < $len; $i++ ) {
			$c = $value[ $i ];
			if ( $c >= '0' && $c <= '9' ) {
				$out .= $c;
			}
		}
		return $out;
	}

	/**
	 * @param array<string,mixed> $property
	 * @return array<string,string> last-10 digits => display phone
	 */
	private static function nap_phone_index( array $property ): array {
		$index  = array();
		$values = isset( $property['phones'] ) && is_array( $property['phones'] ) ? $property['phones'] : array();
		foreach ( $values as $phone ) {
			$digits = self::digits_only( (string) $phone );
			if ( strlen( $digits ) >= 10 ) {
				$index[ substr( $digits, -10 ) ] = trim( (string) $phone );
			}
		}
		$locations = isset( $property['locations'] ) && is_array( $property['locations'] ) ? $property['locations'] : array();
		foreach ( $locations as $loc ) {
			if ( ! is_array( $loc ) ) {
				continue;
			}
			$digits = self::digits_only( (string) ( $loc['phone'] ?? '' ) );
			if ( strlen( $digits ) >= 10 ) {
				$index[ substr( $digits, -10 ) ] = trim( (string) $loc['phone'] );
			}
		}
		return $index;
	}

	/**
	 * @param array<string,mixed> $page
	 * @param array<string,mixed> $property
	 * @return array<int,array<string,mixed>>
	 */
	private static function phone_findings( array $page, array $property ): array {
		$allowed = self::nap_phone_index( $property );
		if ( $allowed === array() ) {
			return array();
		}
		$display = reset( $allowed );
		$text    = (string) ( $page['text'] ?? '' );
		$buf     = '';
		$raw     = '';
		$seen    = array();
		$out     = array();
		$len     = strlen( $text );
		$flush   = static function () use ( &$buf, &$raw, &$seen, &$out, $allowed, $display, $page ): void {
			$digits = $buf;
			$shown  = trim( $raw );
			$buf    = '';
			$raw    = '';
			if ( strlen( $digits ) < 10 || strlen( $digits ) > 11 ) {
				return;
			}
			$key = substr( $digits, -10 );
			if ( isset( $allowed[ $key ] ) || isset( $seen[ $key ] ) ) {
				return;
			}
			$seen[ $key ] = true;
			$quote        = $shown !== '' ? $shown : $digits;
			$out[]        = array(
				'pageId'    => (int) ( $page['id'] ?? 0 ),
				'url'       => (string) ( $page['url'] ?? '' ),
				'title'     => (string) ( $page['title'] ?? '' ),
				'status'    => (string) ( $page['status'] ?? '' ),
				'type'      => (string) ( $page['type'] ?? '' ),
				'severity'  => 'high',
				'certainty' => 'proven',
				'quote'     => $quote,
				'problem'   => 'Phone number is not on the business NAP',
				'fix'       => 'Replace it with ' . (string) $display,
			);
		};
		for ( $i = 0; $i < $len; $i++ ) {
			$c = $text[ $i ];
			if ( $c >= '0' && $c <= '9' ) {
				$buf .= $c;
				$raw .= $c;
				continue;
			}
			if ( $buf !== '' && ( $c === '-' || $c === ' ' || $c === '.' || $c === '(' || $c === ')' ) ) {
				$raw .= $c;
				continue;
			}
			if ( $buf !== '' ) {
				$flush();
			}
		}
		if ( $buf !== '' ) {
			$flush();
		}
		return $out;
	}

	/**
	 * @param array<string,mixed> $row
	 * @param array<string,mixed> $property
	 * @return array<string,mixed>|null
	 */
	public static function accept_stored_finding( array $row, array $property ) {
		$problem   = trim( (string) ( $row['problem'] ?? '' ) );
		$fix       = trim( (string) ( $row['fix'] ?? '' ) );
		$certainty = strtolower( trim( (string) ( $row['certainty'] ?? '' ) ) );
		if ( $problem === '' || strtolower( $problem ) === 'no errors' ) {
			return $row;
		}
		if ( self::finding_is_price_confirm( $certainty, $problem, $fix ) ) {
			return null;
		}
		if ( self::finding_is_company_self_claim( $problem, $fix ) ) {
			return null;
		}
		$fix = self::specific_place_fix( $fix );
		if ( self::finding_attacks_listed_city( $problem, $fix, $property ) ) {
			return null;
		}
		$row['fix'] = $fix;
		return $row;
	}

	private static function finding_is_company_self_claim( string $problem, string $fix ): bool {
		$hay = strtolower( $problem . ' ' . $fix );
		$needles = array(
			'largest showroom',
			'showroom claim',
			'showroom size',
			'largest window',
			'unverified super',
			'regional largest',
			'premier destination',
		);
		foreach ( $needles as $needle ) {
			if ( strpos( $hay, $needle ) !== false ) {
				return true;
			}
		}
		return false;
	}

	private static function specific_place_fix( string $fix ): string {
		$hay = strtolower( $fix );
		if ( strpos( $hay, 'general terms' ) !== false || strpos( $hay, 'local references' ) !== false || strpos( $hay, 'or general' ) !== false ) {
			return 'Delete those out-of-area place names.';
		}
		return $fix;
	}

	private static function finding_is_price_confirm( string $certainty, string $problem, string $fix ): bool {
		$hay = strtolower( $problem . ' ' . $fix );
		$about_price = strpos( $hay, 'price' ) !== false
			|| strpos( $hay, 'dollar' ) !== false
			|| strpos( $hay, '$' ) !== false;
		if ( ! $about_price ) {
			return false;
		}
		if ( $certainty === 'confirm' ) {
			return true;
		}
		return strpos( $hay, 'unconfirmed' ) !== false
			|| strpos( $hay, 'unverified' ) !== false
			|| strpos( $hay, 'confirm ' ) !== false;
	}

	/**
	 * @param array<string,mixed> $property
	 */
	private static function finding_attacks_listed_city( string $problem, string $fix, array $property ): bool {
		$cities = array();
		$locations = isset( $property['locations'] ) && is_array( $property['locations'] ) ? $property['locations'] : array();
		foreach ( $locations as $loc ) {
			if ( ! is_array( $loc ) ) {
				continue;
			}
			$city = trim( (string) ( $loc['city'] ?? '' ) );
			if ( $city !== '' ) {
				$cities[] = $city;
			}
		}
		$list = isset( $property['cities'] ) && is_array( $property['cities'] ) ? $property['cities'] : array();
		foreach ( $list as $city ) {
			$city = trim( (string) $city );
			if ( $city !== '' ) {
				$cities[] = $city;
			}
		}
		$hay = strtolower( $problem . ' ' . $fix );
		foreach ( $cities as $city ) {
			$needle = strtolower( $city );
			if ( $needle === '' ) {
				continue;
			}
			if ( strpos( $hay, 'replace ' . $needle ) !== false || strpos( $hay, 'change ' . $needle ) !== false ) {
				return true;
			}
		}
		return false;
	}

	/**
	 * @param array<int,array<string,mixed>> $findings
	 * @param array<string,mixed>            $inventory
	 * @return array<string,mixed>|WP_Error
	 */
	public static function rollup( array $findings, array $inventory ) {
		$high = 0;
		$med  = 0;
		$low  = 0;
		$pages_with = array();
		foreach ( $findings as $row ) {
			$sev = (string) ( $row['severity'] ?? '' );
			if ( $sev === 'high' ) {
				++$high;
			} elseif ( $sev === 'medium' ) {
				++$med;
			} else {
				++$low;
			}
			$pid = (int) ( $row['pageId'] ?? 0 );
			if ( $pid > 0 ) {
				$pages_with[ $pid ] = true;
			}
		}

		$counts = array(
			'pagesAudited'       => (int) ( $inventory['pageCount'] ?? 0 ),
			'pagesWithFindings'  => count( $pages_with ),
			'findingCount'       => count( $findings ),
			'high'               => $high,
			'medium'             => $med,
			'low'                => $low,
		);

		if ( count( $findings ) === 0 ) {
			return array(
				'counts'       => $counts,
				'summary'      => 'No content problems were found on the audited posts and service-area pages.',
				'mainProblems' => array(),
				'patterns'     => array(),
				'nextSteps'    => array( 'Keep the pre-publish read check in place.' ),
				'gscNote'      => 'Search Console was not included in this audit run. Content findings only.',
			);
		}

		$model  = Neo_Pulse_App_Openrouter_Agent_Models::resolve( Neo_Pulse_App_Openrouter_Agent_Models::CATEGORY_BLOG );
		$system = 'You write Neo Digital content audit handoffs. Return JSON only with keys: summary (string), mainProblems (array of strings), patterns (array of strings), nextSteps (array of strings). Keep proven vs confirm separate. No em dashes. Do not invent counts.';
		$compact = array();
		foreach ( $findings as $row ) {
			$compact[] = array(
				'severity'  => (string) ( $row['severity'] ?? '' ),
				'certainty' => (string) ( $row['certainty'] ?? '' ),
				'problem'   => (string) ( $row['problem'] ?? '' ),
				'type'      => (string) ( $row['type'] ?? '' ),
			);
		}
		$user = "Site: " . (string) ( $inventory['siteName'] ?? '' ) . "\n"
			. 'Counts: ' . wp_json_encode( $counts ) . "\n"
			. 'Findings (problem lines only): ' . wp_json_encode( $compact );
		$raw = self::openrouter_json( $model, $system, $user );
		if ( is_wp_error( $raw ) ) {
			return $raw;
		}

		$summary = trim( (string) ( $raw['summary'] ?? '' ) );
		if ( $summary === '' ) {
			return new WP_Error( 'neo-pulse_editorial_audit_rollup', 'OpenRouter rollup missing summary' );
		}

		return array(
			'counts'       => $counts,
			'summary'      => $summary,
			'mainProblems' => self::string_list( $raw['mainProblems'] ?? array() ),
			'patterns'     => self::string_list( $raw['patterns'] ?? array() ),
			'nextSteps'    => self::string_list( $raw['nextSteps'] ?? array() ),
			'gscNote'      => 'Search Console was not included in this audit run. Content findings only.',
		);
	}

	/**
	 * @param mixed $raw
	 * @return array<int,string>
	 */
	private static function string_list( $raw ): array {
		if ( ! is_array( $raw ) ) {
			return array();
		}
		$out = array();
		foreach ( $raw as $item ) {
			$text = trim( (string) $item );
			if ( $text !== '' ) {
				$out[] = $text;
			}
		}
		return $out;
	}

	/**
	 * @param array<string,mixed> $row
	 * @return array<string,mixed>|null
	 */
	private static function map_page_row( array $row, string $type, string $fallback_status ) {
		$id = (int) ( $row['id'] ?? 0 );
		if ( $id <= 0 ) {
			return null;
		}
		$fields  = isset( $row['fields'] ) && is_array( $row['fields'] ) ? $row['fields'] : array();
		$content = trim( (string) ( $fields['content'] ?? '' ) );
		$title   = trim( (string) ( $fields['title'] ?? '' ) );
		$meta    = trim( (string) ( $fields['meta'] ?? '' ) );
		$text    = trim( wp_strip_all_tags( $content ) );
		if ( $text === '' && $title === '' ) {
			return null;
		}
		$status = sanitize_key( (string) ( $row['status'] ?? $fallback_status ) );
		if ( $status === '' ) {
			$status = $fallback_status;
		}
		return array(
			'id'      => $id,
			'url'     => (string) ( $row['url'] ?? '' ),
			'title'   => $title !== '' ? $title : 'Untitled',
			'status'  => $status,
			'type'    => $type,
			'meta'    => $meta,
			'content' => $content,
			'text'    => $text,
		);
	}

	/**
	 * @param array<string,mixed> $site
	 */
	public static function public_name( array $site ): string {
		$nap = isset( $site['napInfo'] ) && is_array( $site['napInfo'] ) ? $site['napInfo'] : array();
		$name = trim( (string) ( $nap['name'] ?? '' ) );
		if ( $name !== '' ) {
			return $name;
		}
		$id = trim( (string) ( $site['id'] ?? '' ) );
		// Blind Spot: Integrations may still say Shutter Spot; public brand is Blind Spot.
		$raw = trim( (string) ( $site['name'] ?? '' ) );
		if ( $id === 'wp-1791924906059-12' || stripos( $raw, 'shutter spot' ) !== false || stripos( (string) ( $site['siteUrl'] ?? '' ), 'shutterspot.com' ) !== false ) {
			return 'Blind Spot';
		}
		return $raw !== '' ? $raw : ( $id !== '' ? $id : 'Site' );
	}

	/**
	 * @param array<string,mixed> $site
	 * @return array<string,mixed>
	 */
	public static function property_context( array $site ): array {
		$nap       = isset( $site['napInfo'] ) && is_array( $site['napInfo'] ) ? $site['napInfo'] : array();
		$locations = isset( $site['locations'] ) && is_array( $site['locations'] ) ? $site['locations'] : array();
		$cities    = array();
		$phones    = array();
		$addresses = array();
		$location_rows = array();
		foreach ( $locations as $loc ) {
			if ( ! is_array( $loc ) ) {
				continue;
			}
			$city    = trim( (string) ( $loc['city'] ?? '' ) );
			$state   = trim( (string) ( $loc['state'] ?? '' ) );
			$country = trim( (string) ( $loc['country'] ?? '' ) );
			if ( $city !== '' ) {
				$cities[] = $city;
				$location_rows[] = array(
					'city'    => $city,
					'state'   => $state,
					'country' => $country,
					'address' => trim( (string) ( $loc['address'] ?? '' ) ),
					'zip'     => trim( (string) ( $loc['zip'] ?? '' ) ),
					'phone'   => trim( (string) ( $loc['phone'] ?? '' ) ),
				);
			}
			$phone = trim( (string) ( $loc['phone'] ?? '' ) );
			if ( $phone !== '' ) {
				$phones[] = $phone;
			}
			$addr = trim(
				implode(
					', ',
					array_filter(
						array(
							trim( (string) ( $loc['address'] ?? '' ) ),
							$city,
							$state,
							trim( (string) ( $loc['zip'] ?? '' ) ),
						)
					)
				)
			);
			if ( $addr !== '' ) {
				$addresses[] = $addr;
			}
		}
		$service_city    = trim( (string) ( $site['serviceCity'] ?? '' ) );
		$service_state   = trim( (string) ( $site['serviceState'] ?? '' ) );
		$service_country = trim( (string) ( $site['serviceCountry'] ?? '' ) );
		if ( $service_city !== '' ) {
			$cities[] = $service_city;
			$already  = false;
			foreach ( $location_rows as $row ) {
				if ( strcasecmp( (string) ( $row['city'] ?? '' ), $service_city ) === 0 ) {
					$already = true;
					break;
				}
			}
			if ( ! $already ) {
				$location_rows[] = array(
					'city'    => $service_city,
					'state'   => $service_state,
					'country' => $service_country,
				);
			}
		}
		$nap_phone = trim( (string) ( $nap['phone'] ?? '' ) );
		if ( $nap_phone !== '' ) {
			$phones[] = $nap_phone;
		}
		$nap_addr = trim( (string) ( $nap['address'] ?? '' ) );
		if ( $nap_addr !== '' ) {
			$addresses[] = $nap_addr;
		}
		return array(
			'name'           => self::public_name( $site ),
			'siteUrl'        => trim( (string) ( $site['siteUrl'] ?? '' ) ),
			'serviceCity'    => $service_city,
			'serviceState'   => $service_state,
			'serviceCountry' => $service_country,
			'cities'         => array_values( array_unique( $cities ) ),
			'locations'      => $location_rows,
			'phones'         => array_values( array_unique( $phones ) ),
			'addresses'      => array_values( array_unique( $addresses ) ),
		);
	}

	private static function system_prompt(): string {
		return 'You are a fact-check auditor for WordPress blog posts and service-area pages. '
			. 'Your primary job is to verify buyer-facing claims against the Integrations property record, with extra effort on location, NAP, phone, address, state/province, country, and "we serve / we install in" claims. '
			. 'Return one complete JSON object and nothing else: {"findings":[{"severity":"high|medium|low","certainty":"proven|confirm","quote":"...","problem":"...","fix":"..."}]}. '
			. 'Each quote, problem, and fix is one line under 180 characters. At most 4 findings. Empty findings is valid and preferred. Only report real, material issues a buyer would notice or that hurt trust. Skip minutiae. '
			. 'When more than four material issues exist, keep NAP, location, phone, and address errors first. '
			. 'problem and fix must be terse tasks. Never start with "The page", "This page", "This post", "The post", or "The page text". Do not restate that it is a page or post. Page id, url, and title are already known. '
			. 'Examples: problem "Heading Answer is generator leftover"; fix "Remove heading Answer". problem "Phone 555-0100 is not on the NAP"; fix "Replace with PROPERTY NAP phone". problem "Serves Calgary; Calgary is not a listed location"; fix "Remove Calgary or name a listed city". '
			. 'Ignore case-study, scenario, illustrative, and testimonial first names (Morgan, Lena, Brenda, Maya, and similar). Named homeowners in stories are not findings. Do not ask to remove them. '
			. 'Ignore trademark symbol nits, mild climate wording, style preferences, missing forms, missing sections, local color, and anything that is only low-severity polish. '
			. 'PROPERTY.locations is the full business NAP. Every row is a real location with city, state, country, address, and phone. PROPERTY.phones is every phone on those rows plus the NAP phone. '
			. 'Fact-check pass every page: collect cities, towns, regions, states/provinces, countries, streets, phones, emails, business names, and serve/install claims from title, meta, headings, body, FAQ, and link text; ground each against PROPERTY.locations and PROPERTY.phones. '
			. 'Match cities case-insensitively. Match phones after stripping spaces, dashes, parentheses, and leading +1 or 1. '
			. 'A listed city, street, or phone is correct on every page, including a page whose title names a different listed city. Do not replace one listed city with another. Do not write findings like "target city is Winnipeg, replace Plum Coulee" when both cities are in PROPERTY.locations. '
			. 'A place is out of area only when it is not in PROPERTY.locations and the page presents it as served. Wrong state/province or country next to a place that contradicts the matching location row is a proven finding. '
			. 'Check every phone number in the page against PROPERTY.phones and each location phone. A number that is not in that list is severity high and certainty proven. Quote the number. The fix names a phone from PROPERTY.phones. '
			. 'A street or showroom address presented as this business that matches no location row is severity high and certainty proven. '
			. 'Never write a finding about price, dollar amounts, or price ranges. Never use certainty confirm for price. Omit those. '
			. 'Check claims against the company NAP. Do not flag the company describing its own showroom, size, ranking, years, or market position. Missing from the property JSON is not a contradiction. Never write "remove largest showroom claim", "unverified superlative", or "showroom size". '
			. 'An out-of-area fix deletes the foreign place names or names one city from PROPERTY.locations. Never say "general terms", "local references", or "or general". '
			. 'Report only material errors: out-of-area served cities; wrong state/country labels; NAP phone/address/name mismatches; invented local install volume for an out-of-area place; a person/concept/country/highway/college/product name used as a neighbourhood; self-contradiction; a false product fact; generator leftovers (heading Answer, printed instructions, cut-off sentence, title pasted as a place); link text that names a different page than the href; a competitor link; utm_source=openai. '
			. 'Do not flag a neighbourhood, street, park, or subdivision just because it is not in the saved city list. '
			. 'Do not write findings like "Chadwick Square is not a confirmed neighborhood" or "these neighborhoods are not listed in the service cities". '
			. 'certainty proven means the text or the property record shows it is wrong. '
			. 'certainty confirm is only for a buyer-facing claim that contradicts the company record. Never confirm price. Never confirm showroom size. If the record is silent, omit the finding. '
			. 'For Blind Spot, the public name is Blind Spot. No em dashes.';
	}

	/**
	 * @param array<string,mixed> $page
	 * @param array<string,mixed> $property
	 */
	private static function user_prompt( array $page, array $property ): string {
		$text = (string) ( $page['text'] ?? '' );
		if ( strlen( $text ) > 24000 ) {
			$text = substr( $text, 0, 24000 );
		}
		return "Act as a fact-check auditor. Prefer NAP, location, phone, address, state/province, and country contradictions over polish.\n\n"
			. "PROPERTY JSON:\n" . wp_json_encode( $property ) . "\n\n"
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
			. "FACT-CHECK PASS: Collect every place, phone, address, and serve/install claim from title, meta, headings, body, FAQ, and links. Ground each against PROPERTY.locations and PROPERTY.phones. Report only material mismatches. Return JSON findings only.";
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
		// Same JSON completion budget as Neo_Pulse_App_Openrouter_Chat_Completion_Route.
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
		);
		// Gemini 3.8 Flash requires reasoning; low + exclude keeps JSON in content.
		if ( strpos( $model, 'google/gemini-3.8' ) === 0 || strpos( $model, 'liquid/' ) === 0 ) {
			$payload['reasoning'] = array(
				'effort'  => 'low',
				'exclude' => true,
			);
		} else {
			$payload['reasoning'] = array(
				'effort'  => 'none',
				'exclude' => true,
			);
		}
		self::note_api(
			array(
				'kind'        => 'llm_call',
				'model'       => $model,
				'promptChars' => $prompt_chars,
				'maxTokens'   => $max_tokens,
			)
		);
		$started = microtime( true );
		$res = wp_remote_post(
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
			$why  = function_exists( 'json_last_error_msg' ) ? json_last_error_msg() : 'invalid JSON';
			$note = $finish === 'length' ? 'Reply was cut off. ' : '';
			self::note_api(
				array(
					'kind'       => 'llm_fail',
					'model'      => $served,
					'seconds'    => $seconds,
					'status'     => $code,
					'replyChars' => strlen( $content ),
					'finish'     => $finish !== '' ? $finish : '?',
					'error'      => $note . $why,
				)
			);
			return new WP_Error(
				'neo-pulse_openrouter_json',
				$note . 'OpenRouter reply was not JSON (' . $why . ', finish ' . ( $finish !== '' ? $finish : 'unknown' ) . ', ' . strlen( $content ) . ' chars)'
			);
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
	 * Prefer assistant content; fall back to reasoning text (Liquid / reasoning models).
	 *
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
		if ( isset( $message['reasoning'] ) && is_string( $message['reasoning'] ) ) {
			$reasoning = trim( $message['reasoning'] );
			if ( $reasoning !== '' ) {
				return $reasoning;
			}
		}
		$details = $message['reasoning_details'] ?? null;
		if ( is_array( $details ) ) {
			$parts = array();
			foreach ( $details as $detail ) {
				if ( ! is_array( $detail ) ) {
					continue;
				}
				if ( isset( $detail['text'] ) && is_string( $detail['text'] ) ) {
					$text = trim( $detail['text'] );
					if ( $text !== '' ) {
						$parts[] = $text;
					}
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
