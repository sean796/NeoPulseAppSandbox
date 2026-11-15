<?php
/**
 * Pulse Assist action tool registry (task manager and workspace writes).
 *
 * @package Neo_Pulse_App
 */

defined( 'ABSPATH' ) || exit;

class Neo_Pulse_App_Pulse_Assist_Action_Registry {

	const MAX_BATCH_TASKS = 25;

	/** @var array<string,array<string,mixed>> */
	private static $tools = array();

	public static function register_defaults(): void {
		self::$tools = array();

		$read = array(
			'tasks_list_projects'  => 'List team task projects.',
			'tasks_list_sections'  => 'List sections for a project (requires projectId).',
			'tasks_search'         => 'Search tasks by title or keyword.',
			'tasks_list_my'        => 'List tasks assigned to the current user.',
			'tasks_list_pulse_assigned' => 'List tasks assigned to Pulse AI (NEO Pulse bot).',
			'executions_get'            => 'Get task execution job status and progress (requires executionId).',
			'executions_list_for_task'    => 'List execution jobs for a task (requires taskId).',
			'team_list_members'    => 'List active team members for assignee resolution.',
			'tasks_list_templates' => 'List task project templates.',
			'recipes_list'         => 'List automation recipe catalog entries with optional filters.',
			'recipes_describe'     => 'Describe one automation recipe by keyword (actions, triggers, prerequisites).',
		);

		foreach ( $read as $id => $desc ) {
			self::register(
				$id,
				array(
					'description' => $desc,
					'risk'        => 'read',
					'submodes'    => array( 'ask', 'plan', 'build' ),
				)
			);
		}

		$write = array(
			'tasks_create'         => 'Create one task in a project.',
			'tasks_create_batch'   => 'Create multiple tasks in one project.',
			'tasks_update'         => 'Update task status, assignees, or due date.',
			'tasks_create_project' => 'Create a project, optionally from a template.',
			'tasks_save_template'  => 'Save or update one task project template.',
			'tasks_delete_template'=> 'Delete a task project template by keyword.',
			'executions_start'     => 'Start a Pulse-assigned task execution (content optimizer, GSC reporting, or post creator). Requires taskId.',
			'gsc_reporting_execute'=> 'Queue a GSC report agent run (MoM or YoY). Params: comparePreset (mom|yoy), saveToDisk, wordpressSiteId.',
			'ads_reporting_execute'=> 'Queue a PPC (Google Ads) report agent run (MoM or YoY). Params: comparePreset (mom|yoy), saveToDisk, wordpressSiteId. Requires a 10-digit Google Ads customer ID on the property.',
			'post_creator_execute' => 'Queue a post creator agent run. Params: postCount, keywordSource, optionalPrompt, scheduleTimesPerMonth, scheduleStartDay, scheduleStartTime, featuredImage, postDestination, wordpressSiteId.',
			'recipes_install'      => 'Install an automation recipe as a site-bound automation project.',
			'recipes_run'          => 'Evaluate or run an automation recipe (mode: evaluate, now, install_only).',
		);

		foreach ( $write as $id => $desc ) {
			self::register(
				$id,
				array(
					'description' => $desc,
					'risk'        => 'write',
					'submodes'    => array( 'build' ),
				)
			);
		}
	}

	/**
	 * @param array<string,mixed> $meta
	 */
	public static function register( string $id, array $meta ): void {
		self::$tools[ sanitize_key( $id ) ] = $meta;
	}

	/**
	 * @return array<string,array<string,mixed>>
	 */
	public static function all(): array {
		if ( count( self::$tools ) === 0 ) {
			self::register_defaults();
		}
		return self::$tools;
	}

	/**
	 * @return array<int,string>
	 */
	public static function catalog_lines(): array {
		$lines = array();
		foreach ( self::all() as $id => $meta ) {
			$risk = (string) ( $meta['risk'] ?? 'read' );
			$lines[] = "{$id} ({$risk}): " . (string) ( $meta['description'] ?? '' );
		}
		return $lines;
	}

	public static function is_write_tool( string $tool_id ): bool {
		$tool = self::all()[ sanitize_key( $tool_id ) ] ?? null;
		return is_array( $tool ) && (string) ( $tool['risk'] ?? '' ) === 'write';
	}

	public static function allowed_for_submode( string $tool_id, string $submode ): bool {
		$tool = self::all()[ sanitize_key( $tool_id ) ] ?? null;
		if ( ! is_array( $tool ) ) {
			return false;
		}
		$submodes = isset( $tool['submodes'] ) && is_array( $tool['submodes'] ) ? $tool['submodes'] : array();
		return in_array( $submode, $submodes, true );
	}

	/**
	 * @return array<int,string>
	 */
	public static function read_tool_ids(): array {
		$out = array();
		foreach ( self::all() as $id => $meta ) {
			if ( (string) ( $meta['risk'] ?? '' ) !== 'write' ) {
				$out[] = $id;
			}
		}
		return $out;
	}
}
