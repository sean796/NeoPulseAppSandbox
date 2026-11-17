<?php
/**
 * Skills Library JSON store: schema, prompts, evals per skill id.
 *
 * @package Neo_Pulse_App
 */

defined( 'ABSPATH' ) || exit;

class Neo_Pulse_App_Skills_Library_Store {

	const SKILL_SAFE_FIX = 'reporting.semrush.safe-fix';
	const SKILL_POSTS_GAP = 'content.posts.gap-check';
	const SKILL_ENTITIES_GAP = 'content.entities.gap-check';
	const SKILL_MONEY_LINKS = 'content.internal-links.money-pages';
	const SKILL_EDITORIAL_AUDIT = 'content.editorial.audit';

	/** URL path slug (no dots — WP rewrites truncate dotted segments). */
	const SKILL_SAFE_FIX_SLUG  = 'semrush-safe-fix';
	const SKILL_POSTS_GAP_SLUG = 'content-posts-gap-check';
	const SKILL_ENTITIES_GAP_SLUG = 'content-entities-gap-check';
	const SKILL_MONEY_LINKS_SLUG = 'content-internal-links-money-pages';
	const SKILL_EDITORIAL_AUDIT_SLUG = 'editorial-content-audit';

	const FILES = array( 'schema.json', 'prompts.json', 'evals.json' );

	/**
	 * Accept full agent id or URL slug.
	 *
	 * @return string|WP_Error
	 */
	public static function resolve_skill_id( string $token ) {
		$token = trim( $token );
		if ( $token === self::SKILL_SAFE_FIX || $token === self::SKILL_SAFE_FIX_SLUG ) {
			return self::SKILL_SAFE_FIX;
		}
		if ( $token === self::SKILL_POSTS_GAP || $token === self::SKILL_POSTS_GAP_SLUG ) {
			return self::SKILL_POSTS_GAP;
		}
		if ( $token === self::SKILL_ENTITIES_GAP || $token === self::SKILL_ENTITIES_GAP_SLUG ) {
			return self::SKILL_ENTITIES_GAP;
		}
		if ( $token === self::SKILL_MONEY_LINKS || $token === self::SKILL_MONEY_LINKS_SLUG ) {
			return self::SKILL_MONEY_LINKS;
		}
		if ( $token === self::SKILL_EDITORIAL_AUDIT || $token === self::SKILL_EDITORIAL_AUDIT_SLUG ) {
			return self::SKILL_EDITORIAL_AUDIT;
		}
		return new WP_Error( 'neo-pulse_skills_unknown', 'Unknown skill id', array( 'status' => 404 ) );
	}

	/**
	 * @return array<string,mixed>
	 */
	public static function default_schema(): array {
		return array(
			'id'          => self::SKILL_SAFE_FIX,
			'label'       => 'Semrush Safe Fix Agent',
			'category'    => 'meta',
			'domain'      => 'reporting',
			'temperature' => 0.3,
			'maxTokens'   => 512,
			'fieldCopy'   => array(
				'input'  => array(
					'kind'      => array( 'title', 'meta_description', 'missing_alt', 'broken_internal_link', 'broken_internal_image' ),
					'pageUrl'   => 'string (url)',
					'targetUrl' => 'string (optional)',
					'siteUrl'   => 'string (url)',
					'excerpt'   => 'string',
				),
				'output' => array(
					'title'           => 'string',
					'metaDescription' => 'string',
					'alt'             => 'string',
				),
			),
			'checklist'   => array(
				'input'  => array(
					'siteName' => 'string',
					'siteUrl'  => 'string',
					'items'    => 'array of Semrush error rows',
				),
				'output' => array(
					'items' => array(
						'index'              => 'number',
						'neoMcpInstructions' => 'string',
						'mcpTool'            => 'string',
						'mcpOperation'       => 'string',
						'mcpArguments'       => 'object',
					),
				),
			),
		);
	}

	/**
	 * Default prompts match the live Semrush safe-fix PHP strings.
	 *
	 * @return array<string,mixed>
	 */
	public static function default_prompts(): array {
		return array(
			'fieldCopy' => array(
				'base'            => 'You write one SEO field for a WordPress page. Use only the page H1, existing title, and excerpt in the user message. No new claims. Never use the em dash. Output JSON only.',
				'title'           => ' Field "title": 50-60 characters, Title Case, no brand prefix, no colon. The title must be unique to this exact page URL. Do not reuse a title that another page on the site already uses.',
				'metaDescription' => ' Field "metaDescription": 130-150 characters, one sentence of searcher value.',
				'alt'             => ' Field "alt": one short sentence describing the image. No file names.',
				'userTemplate'    => "Page URL: {pageUrl}\nSite: {siteUrl}\n{imageLine}Page excerpt:\n{excerpt}\n\nReturn JSON: {\"{field}\": \"...\"}",
			),
			'checklist' => array(
				'system'       => 'One JSON object. Finish every index in this single reply. '
					. '{"items":[{"index":0,"neoMcpInstructions":"one sentence under 140 characters","mcpTool":"neo-pulse_write","mcpOperation":"apply-technical-fix","mcpArguments":{}}]}. '
					. 'Title, meta, alt, broken link, broken image: mcpTool neo-pulse_write, mcpOperation apply-technical-fix. '
					. 'Pages not crawled, listed, slow load: mcpTool neo-mcp_php, mcpOperation run, mcpArguments {}. '
					. 'No code, no PHP, no extra keys, no second message.',
				'userTemplate' => "Client: {siteName}\nSite URL: {siteUrl}\nSemrush Errors:\n{errorsJson}",
			),
		);
	}

	/**
	 * @return array<string,mixed>
	 */
	public static function default_evals(): array {
		return array(
			'skill_name' => 'semrush-safe-fix',
			'evals'      => array(
				array(
					'id'              => 1,
					'prompt'          => 'Write a unique SEO title for a WordPress page from the H1 and excerpt only.',
					'expected_output' => 'JSON with a title field, 50-60 characters, Title Case, no brand prefix or colon.',
					'assertions'      => array(
						'Output is valid JSON with a non-empty title string',
						'Title length is between 50 and 60 characters',
					),
				),
			),
		);
	}

	/**
	 * @return array{schema.json:array,prompts.json:array,evals.json:array}|WP_Error
	 */
	public static function get_skill( string $skill_id ) {
		$resolved = self::resolve_skill_id( $skill_id );
		if ( is_wp_error( $resolved ) ) {
			return $resolved;
		}
		$skill_id = $resolved;
		$root = self::read_root();
		if ( ! isset( $root['skills'][ $skill_id ] ) || ! is_array( $root['skills'][ $skill_id ] ) ) {
			$root['skills'][ $skill_id ] = self::default_skill_bundle( $skill_id );
			self::write_root( $root );
		}
		$bundle = $root['skills'][ $skill_id ];
		foreach ( self::FILES as $file ) {
			if ( ! isset( $bundle[ $file ] ) || ! is_array( $bundle[ $file ] ) ) {
				return new WP_Error( 'neo-pulse_skills_corrupt', 'Skill library file is missing or invalid: ' . $file, array( 'status' => 500 ) );
			}
		}
		$prompts_err = self::validate_prompts( $bundle['prompts.json'], $skill_id );
		if ( is_wp_error( $prompts_err ) ) {
			return $prompts_err;
		}
		$evals_err = self::validate_evals( $bundle['evals.json'] );
		if ( is_wp_error( $evals_err ) ) {
			return $evals_err;
		}
		return array(
			'schema.json'  => $bundle['schema.json'],
			'prompts.json' => $bundle['prompts.json'],
			'evals.json'   => $bundle['evals.json'],
		);
	}

	/**
	 * @param array<string,mixed> $document
	 * @return true|WP_Error
	 */
	public static function put_file( string $skill_id, string $file, array $document ) {
		$resolved = self::resolve_skill_id( $skill_id );
		if ( is_wp_error( $resolved ) ) {
			return $resolved;
		}
		$skill_id = $resolved;
		$file     = trim( $file );
		if ( $file === 'schema.json' ) {
			return new WP_Error( 'neo-pulse_skills_readonly', 'schema.json is read-only', array( 'status' => 400 ) );
		}
		if ( ! in_array( $file, array( 'prompts.json', 'evals.json' ), true ) ) {
			return new WP_Error( 'neo-pulse_skills_file', 'Unknown skill file', array( 'status' => 404 ) );
		}
		if ( $file === 'prompts.json' ) {
			$check = self::validate_prompts( $document, $skill_id );
			if ( is_wp_error( $check ) ) {
				return $check;
			}
		} else {
			$check = self::validate_evals( $document );
			if ( is_wp_error( $check ) ) {
				return $check;
			}
		}
		$root = self::read_root();
		if ( ! isset( $root['skills'][ $skill_id ] ) || ! is_array( $root['skills'][ $skill_id ] ) ) {
			$root['skills'][ $skill_id ] = self::default_skill_bundle( $skill_id );
		}
		$root['skills'][ $skill_id ][ $file ] = $document;
		if ( ! self::write_root( $root ) ) {
			return new WP_Error( 'neo-pulse_skills_write', 'Could not write skills library', array( 'status' => 500 ) );
		}
		return true;
	}

	/**
	 * Prompts the Semrush runner uses. Errors when missing or invalid.
	 *
	 * @return array<string,mixed>|WP_Error
	 */
	public static function load_prompts( string $skill_id = self::SKILL_SAFE_FIX ) {
		$bundle = self::get_skill( $skill_id );
		if ( is_wp_error( $bundle ) ) {
			return $bundle;
		}
		return $bundle['prompts.json'];
	}

	/**
	 * @return array{skills:array<string,array>}
	 */
	private static function read_root(): array {
		$raw = Neo_Pulse_App_Json_File_Store::read( Neo_Pulse_App_Data_Paths::skills_library_path() );
		if ( ! is_array( $raw ) ) {
			return array( 'skills' => array() );
		}
		$skills = isset( $raw['skills'] ) && is_array( $raw['skills'] ) ? $raw['skills'] : array();
		return array( 'skills' => $skills );
	}

	/**
	 * @param array{skills:array<string,array>} $root
	 */
	private static function write_root( array $root ): bool {
		return Neo_Pulse_App_Json_File_Store::write(
			Neo_Pulse_App_Data_Paths::skills_library_path(),
			array( 'skills' => $root['skills'] )
		);
	}

	/**
	 * @return array{schema.json:array,prompts.json:array,evals.json:array}
	 */
	private static function default_skill_bundle( string $skill_id = self::SKILL_SAFE_FIX ): array {
		if ( $skill_id === self::SKILL_POSTS_GAP ) {
			return array(
				'schema.json'  => self::default_posts_gap_schema(),
				'prompts.json' => self::default_posts_gap_prompts(),
				'evals.json'   => self::default_posts_gap_evals(),
			);
		}
		if ( $skill_id === self::SKILL_ENTITIES_GAP ) {
			return array(
				'schema.json'  => self::default_entities_gap_schema(),
				'prompts.json' => self::default_entities_gap_prompts(),
				'evals.json'   => self::default_entities_gap_evals(),
			);
		}
		if ( $skill_id === self::SKILL_MONEY_LINKS ) {
			return array(
				'schema.json'  => self::default_money_links_schema(),
				'prompts.json' => self::default_money_links_prompts(),
				'evals.json'   => self::default_money_links_evals(),
			);
		}
		if ( $skill_id === self::SKILL_EDITORIAL_AUDIT ) {
			return array(
				'schema.json'  => self::default_editorial_audit_schema(),
				'prompts.json' => self::default_editorial_audit_prompts(),
				'evals.json'   => self::default_editorial_audit_evals(),
			);
		}
		return array(
			'schema.json'  => self::default_schema(),
			'prompts.json' => self::default_prompts(),
			'evals.json'   => self::default_evals(),
		);
	}

	/**
	 * @return array<string,mixed>
	 */
	private static function default_posts_gap_schema(): array {
		return array(
			'id'          => self::SKILL_POSTS_GAP,
			'label'       => 'Posts Content Gap Check',
			'category'    => 'blog',
			'domain'      => 'blog-generator',
			'temperature' => 0.3,
			'maxTokens'   => 512,
			'schedule'    => array(
				'input'  => array(
					'month'           => 'string (YYYY-MM)',
					'gap'             => 'number',
					'occupiedDates'   => 'array of YYYY-MM-DD',
					'lastAllowedDay'  => 'string (YYYY-MM-DD)',
					'publishTimeHint' => 'string (HH:MM)',
				),
				'output' => array(
					'publishDates' => 'array of YYYY-MM-DD',
					'publishTime'  => 'string (HH:MM)',
				),
			),
			'skillPath'   => 'skills/posts-content-gap-check',
		);
	}

	/**
	 * @return array<string,mixed>
	 */
	private static function default_posts_gap_prompts(): array {
		return array(
			'schedule' => array(
				'system'       => 'Return one JSON object only: {"publishDates":["YYYY-MM-DD"],"publishTime":"HH:MM"}. Follow the schedule rules in the user message. Never use an em dash.',
				'userTemplate' => "Read skills/posts-content-gap-check/references/schedule-rules.md.\n\nCount JSON:\n{countJson}",
			),
		);
	}

	/**
	 * @return array<string,mixed>
	 */
	private static function default_posts_gap_evals(): array {
		return array(
			'skill_name' => 'content-posts-gap-check',
			'evals'      => array(
				array(
					'id'              => 1,
					'prompt'          => 'Given gap 2, month 2026-12, occupiedDates [2026-12-02], lastAllowedDay 2026-12-26, pick publishDates and publishTime.',
					'expected_output' => 'JSON with exactly 2 unique YYYY-MM-DD dates inside 2026-12, on or before 2026-12-26, not 2026-12-02, plus HH:MM publishTime.',
					'assertions'      => array(
						'Output is valid JSON with publishDates and publishTime',
						'publishDates length equals gap',
					),
				),
			),
		);
	}

	/**
	 * @return array<string,mixed>
	 */
	private static function default_entities_gap_schema(): array {
		return array(
			'id'          => self::SKILL_ENTITIES_GAP,
			'label'       => 'Entities Content Gap Check',
			'category'    => 'research',
			'domain'      => 'entity-sap',
			'temperature' => 0.3,
			'maxTokens'   => 512,
			'schedule'    => array(
				'input'  => array(
					'month'           => 'string (YYYY-MM)',
					'gap'             => 'number',
					'occupiedDates'   => 'array of YYYY-MM-DD',
					'lastAllowedDay'  => 'string (YYYY-MM-DD)',
					'publishTimeHint' => 'string (HH:MM)',
				),
				'output' => array(
					'publishDates' => 'array of YYYY-MM-DD',
					'publishTime'  => 'string (HH:MM)',
				),
			),
			'skillPath'   => 'skills/entities-content-gap-check',
		);
	}

	/**
	 * @return array<string,mixed>
	 */
	private static function default_entities_gap_prompts(): array {
		return array(
			'schedule' => array(
				'system'       => 'Return one JSON object only: {"publishDates":["YYYY-MM-DD"],"publishTime":"HH:MM"}. Follow the schedule rules in the user message. Never use an em dash.',
				'userTemplate' => "Read skills/entities-content-gap-check/references/schedule-rules.md.\n\nCount JSON:\n{countJson}",
			),
		);
	}

	/**
	 * @return array<string,mixed>
	 */
	private static function default_entities_gap_evals(): array {
		return array(
			'skill_name' => 'content-entities-gap-check',
			'evals'      => array(
				array(
					'id'              => 1,
					'prompt'          => 'Given gap 3, month 2026-12, occupiedDates [2026-12-02], lastAllowedDay 2026-12-26, pick publishDates and publishTime.',
					'expected_output' => 'JSON with exactly 3 unique YYYY-MM-DD dates inside 2026-12, on or before 2026-12-26, not 2026-12-02, plus HH:MM publishTime.',
					'assertions'      => array(
						'Output is valid JSON with publishDates and publishTime',
						'publishDates length equals gap',
					),
				),
			),
		);
	}

	/**
	 * @return array<string,mixed>
	 */
	private static function default_money_links_schema(): array {
		return array(
			'id'          => self::SKILL_MONEY_LINKS,
			'label'       => 'Money Page Internal Links',
			'category'    => 'blog',
			'domain'      => 'aiseo',
			'temperature' => 0.2,
			'maxTokens'   => 2048,
			'linkPlan'    => array(
				'input'  => array(
					'moneyPages' => 'array of {url, queries[]}',
					'blogUrls'   => 'array of blog URLs',
				),
				'output' => array(
					'links' => 'array of {moneyUrl, targetUrl, anchorText}',
				),
			),
			'skillPath'   => 'skills/money-page-internal-links',
		);
	}

	/**
	 * @return array<string,mixed>
	 */
	private static function default_money_links_prompts(): array {
		return array(
			'linkPlan' => array(
				'system'       => 'Return one JSON object only: {"links":[{"moneyUrl":"https://...","targetUrl":"https://...","anchorText":"..."}]}. Top-down: money pages link out to blogs or related money pages. Copy URLs from the lists. Never invent URLs. Never use an em dash.',
				'userTemplate' => "Read skills/money-page-internal-links/references/aiseo-internal-link-rules.md.\n\nInventory JSON:\n{inventoryJson}",
			),
		);
	}

	/**
	 * @return array<string,mixed>
	 */
	private static function default_money_links_evals(): array {
		return array(
			'skill_name' => 'content-internal-links-money-pages',
			'evals'      => array(
				array(
					'id'              => 1,
					'prompt'          => 'Given money page /shutters/ with GSC query roller shutters and blog /blog/window-tips/, propose one outbound link from the money page.',
					'expected_output' => 'JSON links array with moneyUrl as the money page, targetUrl as the blog or related money page, and a short anchorText.',
					'assertions'      => array(
						'Output is valid JSON with links',
						'URLs are copied from inventory',
					),
				),
			),
		);
	}

	/**
	 * @return array<string,mixed>
	 */
	private static function default_editorial_audit_schema(): array {
		return array(
			'id'          => self::SKILL_EDITORIAL_AUDIT,
			'label'       => 'Editorial Content Audit',
			'category'    => 'research',
			'domain'      => 'reporting',
			'temperature' => 0.1,
			'maxTokens'   => 4096,
			'pageAudit'   => array(
				'input'  => array(
					'property' => 'NAP, every location row, phones, addresses, states, countries',
					'page'     => 'id, url, title, status, type, meta, text',
				),
				'output' => array(
					'findings' => 'array of {severity, certainty, quote, problem, fix}',
				),
			),
			'skillPath'   => 'skills/editorial-content-audit',
		);
	}

	/**
	 * @return array<string,mixed>
	 */
	private static function default_editorial_audit_prompts(): array {
		return array(
			'pageAudit' => array(
				'system'       => 'You are a fact-check auditor for one WordPress post or service-area page. Verify buyer-facing claims against the full property NAP (every location, street, phone, state/province, country). Extra effort on location and serve/install claims. A listed city is valid on every page. Check every phone against the NAP phone list. Flag out-of-area served cities and wrong state/country labels. Prefer NAP/location findings over polish. Do not write price findings and do not use confirm for price. Return JSON only: {"findings":[{"severity":"high|medium|low","certainty":"proven|confirm","quote":"...","problem":"...","fix":"..."}]}. Empty findings is valid. Quote page text. No em dashes.',
				'userTemplate' => "Read skills/editorial-content-audit/references/audit-rules.md.\n\nAct as a fact-check auditor. Prefer NAP, location, phone, address, state/province, and country contradictions over polish.\n\nPROPERTY JSON:\n{propertyJson}\n\nPAGE JSON:\n{pageJson}\n\nPAGE TEXT:\n{pageText}\n\nFACT-CHECK PASS: Collect every place, phone, address, and serve/install claim from title, meta, headings, body, FAQ, and links. Ground each against PROPERTY.locations and PROPERTY.phones. Report only material mismatches. Return JSON findings only.",
			),
		);
	}

	/**
	 * @return array<string,mixed>
	 */
	private static function default_editorial_audit_evals(): array {
		return array(
			'skill_name' => 'editorial-content-audit',
			'evals'      => array(
				array(
					'id'              => 1,
					'prompt'          => 'A service-area page claims hundreds of installs in a city outside the saved service cities and uses a wrong phone number.',
					'expected_output' => 'JSON findings with high severity proven quotes for the invented local claim and wrong phone.',
					'assertions'      => array(
						'Output is valid JSON with findings',
						'Each finding has a non-empty quote',
					),
				),
				array(
					'id'              => 2,
					'prompt'          => 'A blog names a listed city but attaches the wrong province, and says we serve a metro that is not in PROPERTY.locations.',
					'expected_output' => 'JSON findings with proven severity for the wrong province label and the out-of-area metro serve claim.',
					'assertions'      => array(
						'Output is valid JSON with findings',
						'Location/NAP contradictions are preferred over polish',
					),
				),
			),
		);
	}

	/**
	 * @param mixed  $doc
	 * @param string $skill_id
	 * @return true|WP_Error
	 */
	public static function validate_prompts( $doc, string $skill_id = self::SKILL_SAFE_FIX ) {
		if ( ! is_array( $doc ) ) {
			return new WP_Error( 'neo-pulse_skills_prompts', 'prompts.json must be an object', array( 'status' => 400 ) );
		}
		if ( $skill_id === self::SKILL_POSTS_GAP || $skill_id === self::SKILL_ENTITIES_GAP ) {
			$schedule = $doc['schedule'] ?? null;
			if ( ! is_array( $schedule ) ) {
				return new WP_Error( 'neo-pulse_skills_prompts', 'prompts.json requires schedule object', array( 'status' => 400 ) );
			}
			foreach ( array( 'system', 'userTemplate' ) as $key ) {
				if ( ! isset( $schedule[ $key ] ) || ! is_string( $schedule[ $key ] ) || trim( $schedule[ $key ] ) === '' ) {
					return new WP_Error( 'neo-pulse_skills_prompts', 'schedule.' . $key . ' must be a non-empty string', array( 'status' => 400 ) );
				}
			}
			return true;
		}
		if ( $skill_id === self::SKILL_MONEY_LINKS ) {
			$plan = $doc['linkPlan'] ?? null;
			if ( ! is_array( $plan ) ) {
				return new WP_Error( 'neo-pulse_skills_prompts', 'prompts.json requires linkPlan object', array( 'status' => 400 ) );
			}
			foreach ( array( 'system', 'userTemplate' ) as $key ) {
				if ( ! isset( $plan[ $key ] ) || ! is_string( $plan[ $key ] ) || trim( $plan[ $key ] ) === '' ) {
					return new WP_Error( 'neo-pulse_skills_prompts', 'linkPlan.' . $key . ' must be a non-empty string', array( 'status' => 400 ) );
				}
			}
			return true;
		}
		if ( $skill_id === self::SKILL_EDITORIAL_AUDIT ) {
			$audit = $doc['pageAudit'] ?? null;
			if ( ! is_array( $audit ) ) {
				return new WP_Error( 'neo-pulse_skills_prompts', 'prompts.json requires pageAudit object', array( 'status' => 400 ) );
			}
			foreach ( array( 'system', 'userTemplate' ) as $key ) {
				if ( ! isset( $audit[ $key ] ) || ! is_string( $audit[ $key ] ) || trim( $audit[ $key ] ) === '' ) {
					return new WP_Error( 'neo-pulse_skills_prompts', 'pageAudit.' . $key . ' must be a non-empty string', array( 'status' => 400 ) );
				}
			}
			return true;
		}
		$fc = $doc['fieldCopy'] ?? null;
		$cl = $doc['checklist'] ?? null;
		if ( ! is_array( $fc ) || ! is_array( $cl ) ) {
			return new WP_Error( 'neo-pulse_skills_prompts', 'prompts.json requires fieldCopy and checklist objects', array( 'status' => 400 ) );
		}
		foreach ( array( 'base', 'title', 'metaDescription', 'alt', 'userTemplate' ) as $key ) {
			if ( ! isset( $fc[ $key ] ) || ! is_string( $fc[ $key ] ) || trim( $fc[ $key ] ) === '' ) {
				return new WP_Error( 'neo-pulse_skills_prompts', 'fieldCopy.' . $key . ' must be a non-empty string', array( 'status' => 400 ) );
			}
		}
		foreach ( array( 'system', 'userTemplate' ) as $key ) {
			if ( ! isset( $cl[ $key ] ) || ! is_string( $cl[ $key ] ) || trim( $cl[ $key ] ) === '' ) {
				return new WP_Error( 'neo-pulse_skills_prompts', 'checklist.' . $key . ' must be a non-empty string', array( 'status' => 400 ) );
			}
		}
		return true;
	}

	/**
	 * @param mixed $doc
	 * @return true|WP_Error
	 */
	public static function validate_evals( $doc ) {
		if ( ! is_array( $doc ) ) {
			return new WP_Error( 'neo-pulse_skills_evals', 'evals.json must be an object', array( 'status' => 400 ) );
		}
		if ( ! isset( $doc['skill_name'] ) || ! is_string( $doc['skill_name'] ) || trim( $doc['skill_name'] ) === '' ) {
			return new WP_Error( 'neo-pulse_skills_evals', 'evals.json requires skill_name', array( 'status' => 400 ) );
		}
		if ( ! isset( $doc['evals'] ) || ! is_array( $doc['evals'] ) ) {
			return new WP_Error( 'neo-pulse_skills_evals', 'evals.json requires evals array', array( 'status' => 400 ) );
		}
		foreach ( $doc['evals'] as $i => $eval ) {
			if ( ! is_array( $eval ) ) {
				return new WP_Error( 'neo-pulse_skills_evals', 'evals[' . $i . '] must be an object', array( 'status' => 400 ) );
			}
			if ( ! isset( $eval['id'] ) ) {
				return new WP_Error( 'neo-pulse_skills_evals', 'evals[' . $i . '] requires id', array( 'status' => 400 ) );
			}
			if ( ! isset( $eval['prompt'] ) || ! is_string( $eval['prompt'] ) || trim( $eval['prompt'] ) === '' ) {
				return new WP_Error( 'neo-pulse_skills_evals', 'evals[' . $i . '] requires prompt', array( 'status' => 400 ) );
			}
			if ( ! isset( $eval['expected_output'] ) || ! is_string( $eval['expected_output'] ) || trim( $eval['expected_output'] ) === '' ) {
				return new WP_Error( 'neo-pulse_skills_evals', 'evals[' . $i . '] requires expected_output', array( 'status' => 400 ) );
			}
		}
		return true;
	}
}
