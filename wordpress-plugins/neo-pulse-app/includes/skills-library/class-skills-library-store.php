<?php
/**
 * Skills Library JSON store: schema, prompts, evals per skill id.
 *
 * @package Neo_Pulse_App
 */

defined( 'ABSPATH' ) || exit;

class Neo_Pulse_App_Skills_Library_Store {

	const SKILL_SAFE_FIX = 'reporting.semrush.safe-fix';

	/** URL path slug (no dots — WP rewrites truncate dotted segments). */
	const SKILL_SAFE_FIX_SLUG = 'semrush-safe-fix';

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
			$root['skills'][ $skill_id ] = self::default_skill_bundle();
			self::write_root( $root );
		}
		$bundle = $root['skills'][ $skill_id ];
		foreach ( self::FILES as $file ) {
			if ( ! isset( $bundle[ $file ] ) || ! is_array( $bundle[ $file ] ) ) {
				return new WP_Error( 'neo-pulse_skills_corrupt', 'Skill library file is missing or invalid: ' . $file, array( 'status' => 500 ) );
			}
		}
		$prompts_err = self::validate_prompts( $bundle['prompts.json'] );
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
			$check = self::validate_prompts( $document );
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
			$root['skills'][ $skill_id ] = self::default_skill_bundle();
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
	private static function default_skill_bundle(): array {
		return array(
			'schema.json'  => self::default_schema(),
			'prompts.json' => self::default_prompts(),
			'evals.json'   => self::default_evals(),
		);
	}

	/**
	 * @param mixed $doc
	 * @return true|WP_Error
	 */
	public static function validate_prompts( $doc ) {
		if ( ! is_array( $doc ) ) {
			return new WP_Error( 'neo-pulse_skills_prompts', 'prompts.json must be an object', array( 'status' => 400 ) );
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
