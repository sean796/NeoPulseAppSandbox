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
	const SKILL_FACT_CHECKER = 'content.product.fact-check';
	const SKILL_CANNIBALIZATION_AUDIT = 'content.blog.cannibalization-audit';
	const SKILL_GOOGLE_SEO_UPDATES = 'seo.google.updates';
	const SKILL_WINDOW_TREATMENTS_VERTICAL = 'vertical.window-treatments.guide';

	/** URL path slug (no dots — WP rewrites truncate dotted segments). */
	const SKILL_SAFE_FIX_SLUG  = 'semrush-safe-fix';
	const SKILL_POSTS_GAP_SLUG = 'content-posts-gap-check';
	const SKILL_ENTITIES_GAP_SLUG = 'content-entities-gap-check';
	const SKILL_MONEY_LINKS_SLUG = 'content-internal-links-money-pages';
	const SKILL_EDITORIAL_AUDIT_SLUG = 'editorial-content-audit';
	const SKILL_FACT_CHECKER_SLUG = 'fact-checker';
	const SKILL_CANNIBALIZATION_AUDIT_SLUG = 'cannibalization-audit';
	const SKILL_GOOGLE_SEO_UPDATES_SLUG = 'google-seo-updates';
	const SKILL_WINDOW_TREATMENTS_VERTICAL_SLUG = 'window-treatments-vertical';

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
		if ( $token === self::SKILL_FACT_CHECKER || $token === self::SKILL_FACT_CHECKER_SLUG ) {
			return self::SKILL_FACT_CHECKER;
		}
		if ( $token === self::SKILL_CANNIBALIZATION_AUDIT || $token === self::SKILL_CANNIBALIZATION_AUDIT_SLUG ) {
			return self::SKILL_CANNIBALIZATION_AUDIT;
		}
		if ( $token === self::SKILL_GOOGLE_SEO_UPDATES || $token === self::SKILL_GOOGLE_SEO_UPDATES_SLUG ) {
			return self::SKILL_GOOGLE_SEO_UPDATES;
		}
		if ( $token === self::SKILL_WINDOW_TREATMENTS_VERTICAL || $token === self::SKILL_WINDOW_TREATMENTS_VERTICAL_SLUG ) {
			return self::SKILL_WINDOW_TREATMENTS_VERTICAL;
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
		if ( $skill_id === self::SKILL_GOOGLE_SEO_UPDATES ) {
			$had_results = isset( $bundle['prompts.json']['entries'] );
			$stale_prompt = ! isset( $bundle['prompts.json']['topics'] ) || ! is_array( $bundle['prompts.json']['topics'] ) || count( $bundle['prompts.json']['topics'] ) < 5;
			$bundle = self::split_google_seo_prompts( $bundle );
			if ( $stale_prompt ) {
				$defaults = self::default_google_seo_updates_prompts();
				$rewrite = $bundle['prompts.json']['rewrite'] ?? $defaults['rewrite'];
				$bundle['prompts.json'] = array(
					'topics'  => $defaults['topics'],
					'rewrite' => is_array( $rewrite ) ? $rewrite : $defaults['rewrite'],
				);
			}
			$input = $bundle['schema.json']['archive']['input'] ?? null;
			$stale_schema = is_array( $input ) && isset( $input['blogRss'] );
			if ( $stale_schema ) {
				$bundle['schema.json'] = self::default_google_seo_updates_schema();
			}
			$root['skills'][ $skill_id ] = $bundle;
			if ( $had_results || $stale_schema || $stale_prompt ) {
				self::write_root( $root );
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
	/**
	 * Search results stay out of prompts.json. prompts.json is the fan-out prompt only.
	 *
	 * @param array<string,mixed> $bundle
	 * @return array<string,mixed>
	 */
	private static function split_google_seo_prompts( array $bundle ): array {
		$prompts = isset( $bundle['prompts.json'] ) && is_array( $bundle['prompts.json'] ) ? $bundle['prompts.json'] : array();
		if ( ! isset( $prompts['entries'] ) ) {
			return $bundle;
		}
		if ( ! isset( $prompts['entries'] ) ) {
			return $bundle;
		}
		$bundle['archive.json'] = array(
			'entries'      => is_array( $prompts['entries'] ) ? $prompts['entries'] : array(),
			'livePrompt'   => isset( $prompts['livePrompt'] ) && is_string( $prompts['livePrompt'] ) ? $prompts['livePrompt'] : '',
			'updatedAt'    => isset( $prompts['updatedAt'] ) ? (string) $prompts['updatedAt'] : '',
			'lastRunKey'   => isset( $prompts['lastRunKey'] ) ? (string) $prompts['lastRunKey'] : '',
			'lastRunError' => isset( $prompts['lastRunError'] ) ? (string) $prompts['lastRunError'] : '',
		);
		$defaults = self::default_google_seo_updates_prompts();
		$bundle['prompts.json'] = array(
			'topics'  => $defaults['topics'],
			'rewrite' => is_array( $prompts['rewrite'] ?? null ) ? $prompts['rewrite'] : $defaults['rewrite'],
		);
		return $bundle;
	}

	/**
	 * @return array<string,mixed>
	 */
	public static function read_google_seo_archive(): array {
		$root = self::read_root();
		$skill = $root['skills'][ self::SKILL_GOOGLE_SEO_UPDATES ] ?? null;
		if ( ! is_array( $skill ) ) {
			return array();
		}
		$archive = $skill['archive.json'] ?? null;
		return is_array( $archive ) ? $archive : array();
	}

	/**
	 * @param array<string,mixed> $archive
	 * @return true|WP_Error
	 */
	public static function write_google_seo_archive( array $archive ) {
		$root = self::read_root();
		if ( ! isset( $root['skills'][ self::SKILL_GOOGLE_SEO_UPDATES ] ) || ! is_array( $root['skills'][ self::SKILL_GOOGLE_SEO_UPDATES ] ) ) {
			$root['skills'][ self::SKILL_GOOGLE_SEO_UPDATES ] = self::default_skill_bundle( self::SKILL_GOOGLE_SEO_UPDATES );
		}
		$root['skills'][ self::SKILL_GOOGLE_SEO_UPDATES ]['archive.json'] = $archive;
		if ( ! self::write_root( $root ) ) {
			return new WP_Error( 'neo-pulse_skills_write', 'Could not write Google SEO archive', array( 'status' => 500 ) );
		}
		return true;
	}

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
		if ( $skill_id === self::SKILL_FACT_CHECKER ) {
			return array(
				'schema.json'  => self::default_fact_checker_schema(),
				'prompts.json' => self::default_fact_checker_prompts(),
				'evals.json'   => self::default_fact_checker_evals(),
			);
		}
		if ( $skill_id === self::SKILL_CANNIBALIZATION_AUDIT ) {
			return array(
				'schema.json'  => self::default_cannibalization_audit_schema(),
				'prompts.json' => self::default_cannibalization_audit_prompts(),
				'evals.json'   => self::default_cannibalization_audit_evals(),
			);
		}
		if ( $skill_id === self::SKILL_GOOGLE_SEO_UPDATES ) {
			return array(
				'schema.json'  => self::default_google_seo_updates_schema(),
				'prompts.json' => self::default_google_seo_updates_prompts(),
				'evals.json'   => self::default_google_seo_updates_evals(),
			);
		}
		if ( $skill_id === self::SKILL_WINDOW_TREATMENTS_VERTICAL ) {
			return array(
				'schema.json'  => self::default_window_treatments_vertical_schema(),
				'prompts.json' => self::default_window_treatments_vertical_prompts(),
				'evals.json'   => self::default_window_treatments_vertical_evals(),
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
	 * @return array<string,mixed>
	 */
	private static function default_fact_checker_schema(): array {
		return array(
			'id'          => self::SKILL_FACT_CHECKER,
			'label'       => 'Fact Checker',
			'category'    => 'research',
			'domain'      => 'reporting',
			'temperature' => 0.1,
			'maxTokens'   => 8192,
			'pageClaims'  => array(
				'input'  => array(
					'macroLocation' => 'city, state, country only',
					'page'          => 'id, url, title, status, type, meta, text',
				),
				'output' => array(
					'claims' => 'array of {quote, category, verdict, sourceTitle, sourceUrl, sourceType, qualification, suggestedWording, evidence, severity}',
					'aiseo'  => '{score:0-10}',
				),
			),
			'skillPath'   => 'skills/fact-checker',
		);
	}

	/**
	 * @return array<string,mixed>
	 */
	private static function default_fact_checker_prompts(): array {
		return array(
			'pageClaims' => array(
				'system'       => 'Loaded at run time from skills/fact-checker/SKILL.md and skills/fact-checker/references/fact-check-rules.md (Property Skills Auto / Run). Do not maintain a parallel hardcoded prompt.',
				'userTemplate' => "Follow the Fact Checker skill and fact-check-rules loaded in the system prompt.\n\nMACRO_LOCATION JSON:\n{macroLocationJson}\n\nPAGE JSON:\n{pageJson}\n\nPAGE TEXT:\n{pageText}\n\nExtract material claims. Ground them with competitive-neutral sources that support the exact wording. Every suggestion needs that external sourceUrl. Omit claims with no source. Include evidence, severity, and aiseo.score. Return JSON only.",
			),
		);
	}

	/**
	 * @return array<string,mixed>
	 */
	private static function default_fact_checker_evals(): array {
		return array(
			'skill_name' => 'fact-checker',
			'evals'      => array(
				array(
					'id'              => 1,
					'prompt'          => 'A blog claims PowerView automation cuts heating bills by 30 percent with no source.',
					'expected_output' => 'JSON claims with energy category, partially_supported or unsupported verdict, and qualification when partial.',
					'assertions'      => array(
						'Output is valid JSON with claims',
						'Supported or partial claims include an http(s) sourceUrl on a domain other than the client site',
						'Material claims include evidence and severity',
					),
				),
				array(
					'id'              => 2,
					'prompt'          => 'A service-area page only names cities and phones with no product specs.',
					'expected_output' => 'One claim with verdict no_product_claim.',
					'assertions'      => array(
						'Output is valid JSON with claims',
						'Streets, phones, and NAP are not reported as product claims',
					),
				),
			),
		);
	}

	/**
	 * @return array<string,mixed>
	 */
	private static function default_cannibalization_audit_schema(): array {
		return array(
			'id'          => self::SKILL_CANNIBALIZATION_AUDIT,
			'label'       => 'Cannibalization Audit',
			'category'    => 'research',
			'domain'      => 'aiseo',
			'temperature' => 0.1,
			'maxTokens'   => 2048,
			'redirectMap' => array(
				'input'  => array(
					'blogPosts' => 'published /blog/ urls with dateGmt',
					'gscWindow' => 'about 90 days page + page/query rows',
				),
				'output' => array(
					'redirects' => 'array of {from,to,reason,ageDays,clicks90d,foldIn}',
					'leave'     => 'array of {url,why}',
				),
			),
			'skillPath'   => 'skills/cannibalization-audit',
		);
	}

	/**
	 * @return array<string,mixed>
	 */
	private static function default_cannibalization_audit_prompts(): array {
		return array(
			'redirectMap' => array(
				'system'       => 'You build a blog cannibalization redirect map. One keeper per intent. Suggest 301s only. Never apply redirects. Leave young posts and unique-query URLs alone.',
				'userTemplate' => "Read skills/cannibalization-audit/references/redirect-map-rules.md.\n\nSITE:\n{siteJson}\n\nPOSTS:\n{postsJson}\n\nGSC:\n{gscJson}\n\nReturn JSON redirect map only.",
			),
		);
	}

	/**
	 * @return array<string,mixed>
	 */
	private static function default_google_seo_updates_schema(): array {
		return array(
			'id'          => self::SKILL_GOOGLE_SEO_UPDATES,
			'label'       => 'Google SEO Updates',
			'category'    => 'research',
			'domain'      => 'aiseo',
			'temperature' => 0.2,
			'maxTokens'   => 4096,
			'archive'     => array(
				'input'  => array(
					'openRouterOnline' => 'openai/gpt-6-sol:online query fan-out for the current month',
				),
				'output' => array(
					'entries'    => 'dated searches newest first',
					'livePrompt' => 'standing post-writing rules with sources',
				),
			),
			'checklist'   => array(
				'Official Google sources only',
				'One dated entry per search',
				'Rewrite livePrompt only when the new entry has items',
			),
		);
	}

	/**
	 * @return array<string,mixed>
	 */
	public static function default_google_seo_updates_prompts(): array {
		$rules = 'Search the live web for this topic only in {month} {year}. Write detailed bullets, not one-liners. No URLs, markdown links, or domain names in title, whatChanged, or postRule. Put the page you opened only in sourceUrl. Never invent dates. Never use the em dash. If nothing in this topic changes how a post should be written, return {"items":[]}. Otherwise return JSON only: {"items":[{"publishedAt":"YYYY-MM-DD","title":"...","sourceUrl":"https://...","whatChanged":"- bullet\\n- bullet","postRule":"- bullet"}]}. whatChanged is 4 to 6 bullets.';
		return array(
			'topics' => array(
				array(
					'id'           => 'core-update',
					'system'       => $rules,
					'userTemplate' => "Topic: Google core update.\nSearch: Google core update {month} {year}.\nWrite when it started, where it applies, how long the rollout is, and what a post writer should do during it.",
				),
				array(
					'id'           => 'ranking',
					'system'       => $rules,
					'userTemplate' => "Topic: ranking changes.\nSearch: Google Search ranking update {month} {year}.\nWrite which ranking systems or spam policies changed and what to change in posts.",
				),
				array(
					'id'           => 'ai-updates',
					'system'       => $rules . ' This topic is AI Overviews, AI Mode, and Gemini in Search. It is a required section when Google changed any of those.',
					'userTemplate' => "Topic: AI updates.\nSearch: Google AI Overviews, AI Mode, and Gemini in Search {month} {year}.\nWrite what changed in AI answers, what that means for posts, and what to do. This is its own section.",
				),
				array(
					'id'           => 'search-central',
					'system'       => $rules,
					'userTemplate' => "Topic: Search Central.\nSearch: Google Search Central blog {month} {year}.\nWrite only posts that change how a page should be written.",
				),
				array(
					'id'           => 'search-console',
					'system'       => $rules,
					'userTemplate' => "Topic: Search Console.\nSearch: Google Search Console issues {month} {year}.\nWrite reporting bugs or data gaps that would make someone misread performance. Say what not to change because of bad data.",
				),
			),
			'rewrite'      => array(
				'system'       => 'You rewrite the standing livePrompt for Neo Pulse post writing from dated Google SEO archive entries. Every rule must cite a sourceUrl and the entry date that introduced it. No rule without an archive item. No invented updates. Never use the em dash. Output JSON only: {"livePrompt":"..."}.',
				'userTemplate' => "Archive entries (newest first):\n{entriesJson}\n\nWrite the livePrompt JSON now.",
			),
		);
	}

	/**
	 * @return array<string,mixed>
	 */
	private static function default_google_seo_updates_evals(): array {
		return array(
			'skill_name' => 'google-seo-updates',
			'evals'      => array(
				array(
					'id'              => 1,
					'prompt'          => 'Official ranking doc announces a core update that changes how helpful content is judged.',
					'expected_output' => 'JSON extract with one item and a postRule that cites the official sourceUrl.',
					'assertions'      => array(
						'Output is valid JSON with title and items',
						'Each item has sourceUrl title whatChanged postRule',
					),
				),
				array(
					'id'              => 2,
					'prompt'          => 'RSS only has a Search Console UI note with no post-writing impact.',
					'expected_output' => 'JSON extract with items as an empty array.',
					'assertions'      => array(
						'items is an empty array',
						'No invented sourceUrl',
					),
				),
			),
		);
	}

	/**
	 * @return array<string,mixed>
	 */
	private static function default_window_treatments_vertical_schema(): array {
		return array(
			'id'          => self::SKILL_WINDOW_TREATMENTS_VERTICAL,
			'label'       => 'Window Treatments Vertical',
			'category'    => 'blog',
			'domain'      => 'aiseo',
			'temperature' => 0.2,
			'maxTokens'   => 2048,
			'checklist'   => array(
				'Library only; not assigned on client profiles',
				'Injected on content runs for Window treatments clients plus Tailored Interiors and Interiors by Laura',
				'Standing prompt only; no Generate job',
			),
		);
	}

	/**
	 * Standing prompt text (matches skills/window-treatments-vertical/references/standing-prompt.md).
	 */
	public static function default_window_treatments_vertical_live_prompt(): string {
		return <<<'PROMPT'
WINDOW TREATMENTS RULES (Hunter Douglas dealers for Neo Digital):

COUNTRY FIRST: Confirm Canada vs United States from the dealer profile before writing. A .com domain does not mean a US dealer. Canadian dealers use Canadian spelling (colour, centre, neighbourhood, grey), CAD, and provincial tax language. US dealers use American spelling, USD, and state or ZIP language. Official Hunter Douglas product, fabric, and colour names keep their own spelling even for Canadian dealers.

SAFE SYSTEMS: For Canadian dealers promote PowerView® Automation, SoftTouch® Motorization, LiteRise® (cordless), and wand controls. Do not advertise corded or cord-loop operating systems for Canadian dealers. For US dealers cordless and motorized lead; corded is allowed only when the dealer page supports it. Never claim Wells Fargo financing for Canadian dealers. Never invent energy or utility rebates.

TRADEMARKS: Spell and capitalise every Hunter Douglas and ALTA name exactly. Put the mark directly after the name with no space (Duette®). Never pluralise or possess a brand name. Never use a Hunter Douglas name to describe another brand. Write Hunter Douglas as two capitalised words.

® PRODUCTS: Duette®, Applause®, Sonnette®, Silhouette®, Pirouette®, Luminette®, Vignette®, Provenance®, Alustra®, Woven Textures®, Skyline®, Parkland®, EverWood®, Modern Precious Metals®, Heritance®, NewStyle®, Somner®, Aura®.
™ PRODUCTS: Nantucket™, Aria™, Palm Beach™, Polysatin™.
NO MARK: Designer Roller Shades, Designer Screen Shades, Designer Solar Shades, Designer Banded Shades, Carole Fabrics.
® FEATURES: PowerView® Automation (never PowerView Motorization), SoftTouch® Motorization, LiteRise®, UltraGlide®, Duolite®, Architella®.
™ FEATURES: Vertiglide™, EasyRise™, HiddenTilt™, TruView™, SoftClose™, Simplicity™.
NO MARK FEATURE: Top-Down/Bottom-Up. Avoid LightLock in copy unless the dealer page uses that exact string.

ALTA: Always capitals ALTA. Features are PowerWand™ and SmartAdjust™. Never put a Hunter Douglas feature name on an ALTA product or the reverse.

PRODUCT NAMES: Prefer website names for keywords and headings; formal names appear in promotions. Duette®/Applause® = Cellular Shades (Honeycomb Shades). Silhouette®/Pirouette®/Nantucket™ = Sheer Shades (Window Shadings). Luminette® = Sheer Panels (Privacy Sheers). Vignette® = Roman Shades (Modern Roman Shades). Sonnette® = Roller Shades (Cellular Roller Shades). Provenance® = Woven Wood Shades. Skyline® = Panel-Track Blinds (Gliding Window Panels). EverWood® = Faux Wood Blinds (Alternative Wood Blinds). Parkland® = Wood Blinds. Aria™ = Fabric Blinds (Soft Blinds). NewStyle® = Composite Shutters (Hybrid Shutters). Heritance® = Wood Shutters (Hardwood Shutters). Palm Beach™ Polysatin™ = Vinyl Shutters. Only mention a product the dealer sells. Keep ALTA, Maxxmar, Norman, and Carole Fabrics separate from Hunter Douglas naming.

PROMOTIONS: Do not invent a promotion, price, percentage, or end date. Write a promotion only when this page is that offer and the end date has not passed. Match the offer name, qualifying products, and end date exactly. Canada and US promotion sets differ; do not mix them. Confirm the dealer's own promotion landing page when the page is a promo.

DEALER EXCEPTIONS: Blind Spot (shutterspot.com, US) sells only Hunter Douglas and ALTA; free consultations are for new products, not repairs; it does not sell exterior solar shades. Tailored Interiors has no showroom; write in-home consultations only. Blinds West and Advance Blinds do not carry Aura® Illuminated Shades. Tailored Interiors and Advance Blinds do not carry Aria™. Public brand names stay Blind Spot and Custom Shades of London.

COPY RULES: No em dashes. No invented warranties, lifetime guarantees, safety certifications, or #1 claims. Cordless and no dangling cords are fine; do not say a product is certified child safe. Write Hunter Douglas dealer or the dealer's own dealer wording. Match consultation wording to the dealer site.
PROMPT;
	}

	/**
	 * @return array<string,mixed>
	 */
	public static function default_window_treatments_vertical_prompts(): array {
		return array(
			'livePrompt' => self::default_window_treatments_vertical_live_prompt(),
		);
	}

	/**
	 * @return array<string,mixed>
	 */
	private static function default_window_treatments_vertical_evals(): array {
		return array(
			'skill_name' => 'window-treatments-vertical',
			'evals'      => array(
				array(
					'id'              => 1,
					'prompt'          => 'Canadian dealer blog mentions PowerView and Duette.',
					'expected_output' => 'Copy uses PowerView® Automation and Duette® with correct marks and Canadian spelling.',
					'assertions'      => array(
						'Marks sit on product names',
						'No corded systems for Canadian dealers',
					),
				),
				array(
					'id'              => 2,
					'prompt'          => 'Generate a free motorization promo for every shade.',
					'expected_output' => 'Refuse invented promotions; match only a live dealer offer with its end date.',
					'assertions'      => array(
						'No invented promotions',
						'Public names Blind Spot and Custom Shades of London',
					),
				),
			),
		);
	}

	private static function default_cannibalization_audit_evals(): array {
		return array(
			'skill_name' => 'cannibalization-audit',
			'evals'      => array(
				array(
					'id'              => 1,
					'prompt'          => 'Two /blog/ URLs split the same GSC query. One has more clicks.',
					'expected_output' => 'JSON map with one overlap redirect to the higher-click keeper.',
					'assertions'      => array(
						'Output is valid JSON with redirects and leave',
						'reason is overlap or aged-low-demand',
					),
				),
				array(
					'id'              => 2,
					'prompt'          => 'A blog post is 30 days old with zero clicks.',
					'expected_output' => 'That URL is on the leave list as younger than 120 days.',
					'assertions'      => array(
						'Young posts are not culled',
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
		if ( $skill_id === self::SKILL_FACT_CHECKER ) {
			$claims = $doc['pageClaims'] ?? null;
			if ( ! is_array( $claims ) ) {
				return new WP_Error( 'neo-pulse_skills_prompts', 'prompts.json requires pageClaims object', array( 'status' => 400 ) );
			}
			foreach ( array( 'system', 'userTemplate' ) as $key ) {
				if ( ! isset( $claims[ $key ] ) || ! is_string( $claims[ $key ] ) || trim( $claims[ $key ] ) === '' ) {
					return new WP_Error( 'neo-pulse_skills_prompts', 'pageClaims.' . $key . ' must be a non-empty string', array( 'status' => 400 ) );
				}
			}
			return true;
		}
		if ( $skill_id === self::SKILL_CANNIBALIZATION_AUDIT ) {
			$map = $doc['redirectMap'] ?? null;
			if ( ! is_array( $map ) ) {
				return new WP_Error( 'neo-pulse_skills_prompts', 'prompts.json requires redirectMap object', array( 'status' => 400 ) );
			}
			foreach ( array( 'system', 'userTemplate' ) as $key ) {
				if ( ! isset( $map[ $key ] ) || ! is_string( $map[ $key ] ) || trim( $map[ $key ] ) === '' ) {
					return new WP_Error( 'neo-pulse_skills_prompts', 'redirectMap.' . $key . ' must be a non-empty string', array( 'status' => 400 ) );
				}
			}
			return true;
		}
		if ( $skill_id === self::SKILL_WINDOW_TREATMENTS_VERTICAL ) {
			$live = $doc['livePrompt'] ?? null;
			if ( ! is_string( $live ) || trim( $live ) === '' ) {
				return new WP_Error( 'neo-pulse_skills_prompts', 'prompts.json requires non-empty livePrompt', array( 'status' => 400 ) );
			}
			return true;
		}
		if ( $skill_id === self::SKILL_GOOGLE_SEO_UPDATES ) {
			$topics = $doc['topics'] ?? null;
			if ( ! is_array( $topics ) || count( $topics ) < 5 ) {
				return new WP_Error( 'neo-pulse_skills_prompts', 'prompts.json requires topics array with one prompt per search', array( 'status' => 400 ) );
			}
			foreach ( $topics as $i => $topic ) {
				if ( ! is_array( $topic ) ) {
					return new WP_Error( 'neo-pulse_skills_prompts', 'topics[' . $i . '] must be an object', array( 'status' => 400 ) );
				}
				foreach ( array( 'id', 'system', 'userTemplate' ) as $key ) {
					if ( ! isset( $topic[ $key ] ) || ! is_string( $topic[ $key ] ) || trim( $topic[ $key ] ) === '' ) {
						return new WP_Error( 'neo-pulse_skills_prompts', 'topics[' . $i . '].' . $key . ' must be a non-empty string', array( 'status' => 400 ) );
					}
				}
			}
			$rewrite = $doc['rewrite'] ?? null;
			if ( ! is_array( $rewrite ) ) {
				return new WP_Error( 'neo-pulse_skills_prompts', 'prompts.json requires rewrite object', array( 'status' => 400 ) );
			}
			foreach ( array( 'system', 'userTemplate' ) as $key ) {
				if ( ! isset( $rewrite[ $key ] ) || ! is_string( $rewrite[ $key ] ) || trim( $rewrite[ $key ] ) === '' ) {
					return new WP_Error( 'neo-pulse_skills_prompts', 'rewrite.' . $key . ' must be a non-empty string', array( 'status' => 400 ) );
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
