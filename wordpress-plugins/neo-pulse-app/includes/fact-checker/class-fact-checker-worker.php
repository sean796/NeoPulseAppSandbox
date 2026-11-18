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
	/** GPT-6 Sol :online — same or lower token cost than gpt-4o:online, with web search. */
	const WEB_MODEL = 'openai/gpt-6-sol:online';

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
		if ( is_wp_error( $system ) ) {
			return $system;
		}
		$user = self::user_prompt( $page, $macro );
		$raw  = self::openrouter_json( $model, $system, $user );
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
			'installation',
			'lifespan',
			'cleaning_maintenance',
			'climate',
			'business_services',
			'none',
		);
		$verdicts = array(
			'supported',
			'partially_supported',
			'unsupported',
			'contradicted',
			'business_confirmation_required',
			'no_product_claim',
		);
		$source_types = array( 'manufacturer', 'manual', 'government', 'independent', 'industry', '' );
		$severities   = array( 'critical', 'major', 'moderate', 'minor', '' );

		foreach ( $claims_raw as $row ) {
			if ( ! is_array( $row ) ) {
				continue;
			}
			$normalized = self::normalize_claim( $row, $categories, $verdicts );
			if ( $normalized === null ) {
				continue;
			}
			$quote       = $normalized['quote'];
			$category    = $normalized['category'];
			$verdict     = $normalized['verdict'];
			$source_url   = trim( (string) ( $row['sourceUrl'] ?? '' ) );
			$source_title = trim( (string) ( $row['sourceTitle'] ?? '' ) );
			$source_type  = strtolower( trim( (string) ( $row['sourceType'] ?? '' ) ) );
			$source_type  = str_replace( array( ' ', '-' ), '_', $source_type );
			if ( ! in_array( $source_type, $source_types, true ) ) {
				$source_type = '';
			}
			$source_host   = (string) ( wp_parse_url( $source_url, PHP_URL_HOST ) ?: '' );
			$client_source = self::same_site_host( $source_host, $site_host );
			$dealer_source = self::is_competitor_blinds_host( $source_host );
			$suggested = trim( (string) ( $row['suggestedWording'] ?? '' ) );
			$evidence  = trim( (string) ( $row['evidence'] ?? '' ) );
			if ( ! preg_match( '#^https?://#i', $source_url ) || $client_source || $dealer_source ) {
				continue;
			}
			if ( ! in_array( $verdict, array( 'supported', 'partially_supported', 'contradicted' ), true ) ) {
				continue;
			}
			$qualification = trim( (string) ( $row['qualification'] ?? '' ) );
			if ( $verdict === 'partially_supported' && $qualification === '' ) {
				$qualification = 'The source does not prove the full wording.';
			}
			if ( $evidence === '' ) {
				$evidence = 'The linked source addresses this claim.';
			}
			$severity = strtolower( trim( (string) ( $row['severity'] ?? '' ) ) );
			if ( ! in_array( $severity, $severities, true ) ) {
				$severity = '';
			}
			if ( $verdict === 'supported' ) {
				$severity = '';
			} elseif ( $severity === '' ) {
				$severity = $verdict === 'contradicted' ? 'major' : 'moderate';
			}
			$out[]     = array(
				'pageId'           => $page_id,
				'url'              => $page_url,
				'title'            => (string) ( $page['title'] ?? '' ),
				'status'           => (string) ( $page['status'] ?? '' ),
				'type'             => (string) ( $page['type'] ?? '' ),
				'quote'            => $quote,
				'product'          => trim( (string) ( $row['product'] ?? '' ) ),
				'claimLink'        => self::claim_link( $page_url, $quote ),
				'category'         => $category,
				'verdict'          => $verdict,
				'sourceTitle'      => $source_title,
				'sourceUrl'        => $source_url,
				'sourceType'       => $source_type,
				'qualification'    => $qualification,
				'suggestedWording' => $suggested,
				'evidence'         => $evidence,
				'severity'         => $severity,
				'aiseoScore'       => 0.0,
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
				'product'          => '',
				'claimLink'        => $page_url,
				'category'         => 'none',
				'verdict'          => 'no_product_claim',
				'sourceTitle'      => '',
				'sourceUrl'        => '',
				'sourceType'       => '',
				'qualification'    => '',
				'suggestedWording' => '',
				'evidence'         => '',
				'severity'         => '',
				'aiseoScore'       => 0.0,
			);
		}

		$aiseo_score = self::cap_aiseo_score( self::read_aiseo_score( $raw ), $out );
		foreach ( $out as $i => $claim_row ) {
			$out[ $i ]['aiseoScore'] = $aiseo_score;
		}
		return $out;
	}

	/**
	 * @param array<string,mixed> $row
	 * @param array<int,string>   $categories
	 * @param array<int,string>   $verdicts
	 * @return array{quote:string,category:string,verdict:string}|null
	 */
	private static function normalize_claim( array $row, array $categories, array $verdicts ): ?array {
		$quote = trim( (string) ( $row['quote'] ?? $row['claim'] ?? '' ) );
		if ( $quote === '' ) {
			return null;
		}
		$category = strtolower( trim( (string) ( $row['category'] ?? '' ) ) );
		$category = str_replace( array( ' ', '-' ), '_', $category );
		$category_aliases = array(
			'product_specification' => 'product_spec',
			'specification'         => 'product_spec',
			'spec'                  => 'product_spec',
			'specs'                 => 'product_spec',
			'operating_systems'     => 'operating_system',
			'motorization'          => 'operating_system',
			'maintenance'           => 'cleaning_maintenance',
			'cleaning'              => 'cleaning_maintenance',
			'install'               => 'installation',
			'measurements'          => 'installation',
			'life_span'             => 'lifespan',
			'cost'                  => 'pricing',
			'price'                 => 'pricing',
			'material'              => 'materials',
			'business'              => 'business_services',
			'services'              => 'business_services',
		);
		if ( isset( $category_aliases[ $category ] ) ) {
			$category = $category_aliases[ $category ];
		}
		if ( ! in_array( $category, $categories, true ) ) {
			$category = 'product_spec';
		}
		$verdict = strtolower( trim( (string) ( $row['verdict'] ?? '' ) ) );
		$verdict = str_replace( array( ' ', '-' ), '_', $verdict );
		$verdict_aliases = array(
			'partial'                       => 'partially_supported',
			'partiallysupported'            => 'partially_supported',
			'not_supported'                 => 'unsupported',
			'unverified'                    => 'unsupported',
			'false'                         => 'contradicted',
			'true'                          => 'supported',
			'outdated'                      => 'partially_supported',
			'no_product_claims'             => 'no_product_claim',
			'business_confirmation'         => 'business_confirmation_required',
			'business_confirm'              => 'business_confirmation_required',
			'company_confirmation_required' => 'business_confirmation_required',
		);
		if ( isset( $verdict_aliases[ $verdict ] ) ) {
			$verdict = $verdict_aliases[ $verdict ];
		}
		if ( ! in_array( $verdict, $verdicts, true ) ) {
			$verdict = 'unsupported';
		}
		return array(
			'quote'    => $quote,
			'category' => $category,
			'verdict'  => $verdict,
		);
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
	 * True when the source host is the site being checked, including www and subdomains.
	 */
	public static function same_site_host( string $source_host, string $site_host ): bool {
		$source_host = self::bare_host( $source_host );
		$site_host   = self::bare_host( $site_host );
		if ( $source_host === '' || $site_host === '' ) {
			return false;
		}
		if ( $source_host === $site_host ) {
			return true;
		}
		$suffix = '.' . $site_host;
		$len    = strlen( $suffix );
		return strlen( $source_host ) > $len && substr( $source_host, -$len ) === $suffix;
	}

	/**
	 * Competing blinds retailers are not competitive-agnostic sources.
	 */
	public static function is_competitor_blinds_host( string $host ): bool {
		$host = self::bare_host( $host );
		if ( $host === '' ) {
			return false;
		}
		$denied = array(
			'blindsplanet.ca',
			'benblinds.com',
			'blindsmagic.com',
			'advanceblindsanddrapery.com',
			'superiorblinds.com',
			'shutterspot.com',
			'blindswest.ca',
			'intheshadeflorida.com',
			'lindseyblindsetc.com',
			'customshadesoflondon.ca',
			'tailoredinteriors.ca',
			'eliteshadings.com',
			'dminteriorsanddesign.com',
			'interiorsbylaura.com',
		);
		foreach ( $denied as $denied_host ) {
			if ( $host === $denied_host || substr( $host, - ( strlen( $denied_host ) + 1 ) ) === ( '.' . $denied_host ) ) {
				return true;
			}
		}
		return false;
	}

	private static function bare_host( string $host ): string {
		$host = strtolower( trim( $host ) );
		if ( strpos( $host, 'www.' ) === 0 ) {
			$host = substr( $host, 4 );
		}
		return $host;
	}

	/**
	 * @param array<string,mixed> $raw
	 */
	public static function read_aiseo_score( array $raw ): float {
		$aiseo = isset( $raw['aiseo'] ) && is_array( $raw['aiseo'] ) ? $raw['aiseo'] : array();
		$score = isset( $aiseo['score'] ) ? (float) $aiseo['score'] : 0.0;
		if ( $score < 0 ) {
			return 0.0;
		}
		if ( $score > 10 ) {
			return 10.0;
		}
		return round( $score, 1 );
	}

	/**
	 * Cap a page AISEO score when material claims are unresolved.
	 *
	 * @param array<int,array<string,mixed>> $claims
	 */
	public static function cap_aiseo_score( float $score, array $claims ): float {
		$has_critical = false;
		$has_major    = false;
		foreach ( $claims as $row ) {
			if ( ! is_array( $row ) ) {
				continue;
			}
			$severity = strtolower( trim( (string) ( $row['severity'] ?? '' ) ) );
			$verdict  = (string) ( $row['verdict'] ?? '' );
			if ( $severity === 'critical' ) {
				$has_critical = true;
			}
			if ( $severity === 'major' || $verdict === 'contradicted' ) {
				$has_major = true;
			}
		}
		if ( $has_critical && $score > 4.0 ) {
			$score = 4.0;
		} elseif ( $has_major && $score > 6.0 ) {
			$score = 6.0;
		}
		return round( $score, 1 );
	}

	public static function aiseo_letter( float $score ): string {
		if ( $score >= 9.0 ) {
			return 'A';
		}
		if ( $score >= 8.0 ) {
			return 'B';
		}
		if ( $score >= 7.0 ) {
			return 'C';
		}
		if ( $score >= 6.0 ) {
			return 'D';
		}
		return 'F';
	}

	/**
	 * @param array<int,array<string,mixed>> $claims
	 * @param array<string,mixed>            $inventory
	 * @return array<string,mixed>
	 */
	public static function rollup( array $claims, array $inventory ): array {
		$by_verdict = array(
			'supported'                       => 0,
			'partially_supported'             => 0,
			'unsupported'                     => 0,
			'contradicted'                    => 0,
			'business_confirmation_required'  => 0,
			'no_product_claim'                => 0,
		);
		$material       = 0;
		$unresolved     = 0;
		$score_by_page  = array();
		$main_problems  = array();
		$required       = array();
		$optional       = array();
		foreach ( $claims as $row ) {
			if ( ! is_array( $row ) ) {
				continue;
			}
			$v = (string) ( $row['verdict'] ?? '' );
			if ( isset( $by_verdict[ $v ] ) ) {
				++$by_verdict[ $v ];
			}
			if ( $v === 'no_product_claim' ) {
				continue;
			}
			++$material;
			$page_id = (int) ( $row['pageId'] ?? 0 );
			if ( $page_id > 0 && ! isset( $score_by_page[ $page_id ] ) ) {
				$score_by_page[ $page_id ] = (float) ( $row['aiseoScore'] ?? 0 );
			}
			$severity = strtolower( trim( (string) ( $row['severity'] ?? '' ) ) );
			$quote    = trim( (string) ( $row['quote'] ?? '' ) );
			$suggest  = trim( (string) ( $row['suggestedWording'] ?? '' ) );
			$title    = trim( (string) ( $row['title'] ?? '' ) );
			$label    = $title !== '' ? ( $title . ': ' . $quote ) : $quote;
			if ( in_array( $v, array( 'unsupported', 'contradicted', 'business_confirmation_required', 'partially_supported' ), true ) ) {
				++$unresolved;
			}
			if ( in_array( $severity, array( 'critical', 'major' ), true ) || $v === 'contradicted' ) {
				$main_problems[] = $label;
			}
			if ( in_array( $severity, array( 'critical', 'major', 'moderate' ), true ) && $suggest !== '' ) {
				$required[] = $suggest;
			} elseif ( $severity === 'minor' && $suggest !== '' ) {
				$optional[] = $suggest;
			}
		}
		$pages = (int) ( $inventory['pageCount'] ?? 0 );
		$avg   = 0.0;
		if ( count( $score_by_page ) > 0 ) {
			$avg = round( array_sum( $score_by_page ) / count( $score_by_page ), 1 );
		}
		$letter = self::aiseo_letter( $avg );
		$counts = array(
			'pagesAudited' => $pages,
			'claimCount'   => $material,
			'supported'    => $by_verdict['supported'],
			'partial'      => $by_verdict['partially_supported'],
			'unsupported'  => $by_verdict['unsupported'] + $by_verdict['contradicted'] + $by_verdict['business_confirmation_required'],
			'aiseoScore'   => $avg,
			'aiseoLetter'  => $letter,
			'unresolved'   => $unresolved,
		);
		$summary = $material === 0
			? 'No product or service claims needed checking on the audited pages.'
			: ( 'Checked ' . $material . ' product and service claims across ' . $pages . ' pages. AISEO ' . $avg . '/10 (' . $letter . ').' );
		$publication = $unresolved > 0
			? 'Do not treat this set as fully fact-checked. Material claims remain unresolved.'
			: 'No unresolved material claims in this run.';
		$main_problems = array_values( array_unique( array_slice( $main_problems, 0, 8 ) ) );
		$required      = array_values( array_unique( array_slice( $required, 0, 8 ) ) );
		$optional      = array_values( array_unique( array_slice( $optional, 0, 8 ) ) );
		$next          = array( $publication );
		if ( count( $required ) > 0 ) {
			$next[] = 'Apply the required corrections in the sheet.';
		}
		return array(
			'counts'               => $counts,
			'summary'              => $summary,
			'mainProblems'         => $main_problems,
			'requiredCorrections'  => $required,
			'optionalImprovements' => $optional,
			'publication'          => $publication,
			'patterns'             => array(),
			'nextSteps'            => $next,
		);
	}

	/**
	 * Repo skills/fact-checker directory (wordpress-plugins/neo-pulse-app → repo root).
	 */
	private static function skill_dir(): string {
		$plugin = rtrim( (string) NEO_PULSE_APP_PLUGIN_DIR, '/\\' );
		$repo   = dirname( $plugin, 2 );
		return $repo . DIRECTORY_SEPARATOR . 'skills' . DIRECTORY_SEPARATOR . 'fact-checker';
	}

	/**
	 * @return string|WP_Error
	 */
	private static function read_skill_markdown( string $relative ) {
		$base = self::skill_dir();
		$path = $base . DIRECTORY_SEPARATOR . str_replace( array( '/', '\\' ), DIRECTORY_SEPARATOR, $relative );
		if ( ! is_readable( $path ) ) {
			return new WP_Error(
				'neo-pulse_fact_checker_skill',
				'Fact Checker skill file missing or unreadable: ' . $relative
			);
		}
		$raw = file_get_contents( $path );
		if ( ! is_string( $raw ) || trim( $raw ) === '' ) {
			return new WP_Error(
				'neo-pulse_fact_checker_skill',
				'Fact Checker skill file is empty: ' . $relative
			);
		}
		return self::strip_skill_frontmatter( $raw );
	}

	private static function strip_skill_frontmatter( string $md ): string {
		$text = ltrim( $md, "\xEF\xBB\xBF" );
		if ( strpos( $text, '---' ) !== 0 ) {
			return trim( $text );
		}
		$end = strpos( $text, "\n---", 3 );
		if ( $end === false ) {
			return trim( $text );
		}
		return trim( substr( $text, $end + 4 ) );
	}

	/**
	 * System prompt = live SKILL.md + fact-check-rules.md + sheet JSON contract.
	 *
	 * @return string|WP_Error
	 */
	private static function system_prompt() {
		$skill = self::read_skill_markdown( 'SKILL.md' );
		if ( is_wp_error( $skill ) ) {
			return $skill;
		}
		$rules = self::read_skill_markdown( 'references/fact-check-rules.md' );
		if ( is_wp_error( $rules ) ) {
			return $rules;
		}
		$contract = 'PROPERTY SKILLS / AUTO MODE (sheet rows, do not edit the site):'
			. "\nReturn one complete JSON object and nothing else: "
			. '{"aiseo":{"score":0},"claims":[{"quote":"...","product":"...","category":"product_spec|operating_system|materials|energy|safety|warranty|pricing|compatibility|durability|installation|lifespan|cleaning_maintenance|climate|business_services|none","verdict":"supported|partially_supported|contradicted|no_product_claim","sourceTitle":"...","sourceUrl":"https://...","sourceType":"manufacturer|manual|government|independent|industry|","qualification":"...","suggestedWording":"...","evidence":"...","severity":"critical|major|moderate|minor|"}]}.'
			. "\nFollow the Fact Checker skill and fact-check-rules above exactly. Never invent URLs. Omit claims with no competitive-neutral sourceUrl.";
		$year = (int) gmdate( 'Y' );
		$latest = 'LATEST_YEAR=' . $year . "\n"
			. 'Put LATEST_YEAR at the end of every web search query. Prefer current-year primary sources.';
		return $skill . "\n\n--- FACT CHECK RULES ---\n" . $rules . "\n--- END FACT CHECK RULES ---\n\n" . $contract . "\n\n" . $latest;
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
		return "Follow the Fact Checker skill and fact-check-rules in the system prompt. Ground claims with web search. End every web search query with LATEST_YEAR. Prefer manufacturer docs for MACRO_LOCATION.country.\n\n"
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
			. 'Extract material factual claims. Match each to competitive-neutral evidence that supports the exact wording. Every claim and every suggested wording needs an external sourceUrl. Omit claims with no linkable source. Return JSON with claims and aiseo.score only.';
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
		// gpt-6-sol does not accept temperature; omit it.
		$payload = array(
			'model'           => $model,
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
