<?php
/**
 * Declarative recipe metadata for agent runs.
 *
 * @package Neo_Pulse_App
 */

defined( 'ABSPATH' ) || exit;

class Neo_Pulse_App_Agent_Runs_Recipe_Registry {

	/** @var array<string,array<string,mixed>> */
	private static $recipes = array(
		'overview_pages_meta_batch' => array(
			'title'       => 'Pages bucket meta batch',
			'managerTabs' => array( 'overview' ),
		),
		'content_optimizer_bulk'    => array(
			'title'       => 'Content optimization batch',
			'managerTabs' => array( 'content-optimizer' ),
		),
		'gsc_reporting'             => array(
			'title'       => 'GSC reporting',
			'managerTabs' => array( 'generator' ),
		),
		'ads_reporting'             => array(
			'title'       => 'PPC reporting',
			'managerTabs' => array( 'generator' ),
		),
		'post_creator'              => array(
			'title'       => 'Post creator',
			'managerTabs' => array( 'generator' ),
		),
		'local_dominator_export'    => array(
			'title'       => 'Local Dominator grid export',
			'managerTabs' => array( 'generator' ),
		),
		'entity_page_creator'       => array(
			'title'       => 'Entity page creator',
			'managerTabs' => array( 'generator' ),
		),
		'entity_generator'          => array(
			'title'       => 'Entity generator',
			'managerTabs' => array( 'generator' ),
		),
		'sap_generator'             => array(
			'title'       => 'SAP generator',
			'managerTabs' => array( 'generator' ),
		),
		'chatgpt_website_audit'     => array(
			'title'       => 'ChatGPT website audit',
			'managerTabs' => array( 'generator' ),
		),
		'dfs_llm_article_audit'     => array(
			'title'       => 'DFS LLM article audit',
			'managerTabs' => array( 'generator' ),
		),
		'browser_automation'        => array(
			'title'       => 'Residential browser automation',
			'managerTabs' => array( 'generator' ),
		),
		'content_gap_check'         => array(
			'title'       => 'Content gap check',
			'managerTabs' => array( 'generator' ),
		),
		'semrush_safe_fix'          => array(
			'title'       => 'Semrush safe fix',
			'managerTabs' => array( 'dashboard' ),
		),
	);

	public static function is_valid( string $recipe_key ): bool {
		return isset( self::$recipes[ sanitize_key( $recipe_key ) ] );
	}

	/**
	 * @return array<string,mixed>|null
	 */
	public static function get( string $recipe_key ): ?array {
		$key = sanitize_key( $recipe_key );
		return self::$recipes[ $key ] ?? null;
	}

	public static function title_for( string $recipe_key ): string {
		$meta = self::get( $recipe_key );
		return $meta ? (string) $meta['title'] : $recipe_key;
	}

	/**
	 * @return array<int,array<string,string>>
	 */
	public static function list_for_api(): array {
		$out = array();
		foreach ( self::$recipes as $key => $meta ) {
			$out[] = array(
				'recipeKey' => $key,
				'title'     => (string) $meta['title'],
			);
		}
		return $out;
	}
}
