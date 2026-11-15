<?php
/**
 * Action intent router and slice team planner for Pulse Assist.
 *
 * @package Neo_Pulse_App
 */

defined( 'ABSPATH' ) || exit;

class Neo_Pulse_App_Pulse_Assist_Action_Intent {

	const MAX_SLICE_AGENTS = 6;
	const SLICE_MODEL      = 'google/gemini-2.5-flash-lite';

	/** @var array<int,string> */
	const ACTION_SLICES = array(
		'member_resolver',
		'project_resolver',
		'project_creator',
		'task_decomposer',
		'task_validator',
		'template_resolver',
	);

	/**
	 * @param array<int,array<string,mixed>> $history
	 * @param array<string,mixed>            $body
	 */
	public static function route( string $message, array $history, array $body ): string {
		if ( ! self::has_team_context( $body ) ) {
			return 'none';
		}
		$lower = strtolower( trim( $message ) );
		if ( $lower === '' ) {
			return 'none';
		}

		$needles = array(
			'create task',
			'add task',
			'assign task',
			'task for',
			'tasks for',
			'optimize client',
			'project task',
			'my tasks',
			'task list',
			'team task',
		);
		foreach ( $needles as $needle ) {
			if ( str_contains( $lower, $needle ) ) {
				return 'action_plan';
			}
		}

		if ( str_contains( $lower, 'task' ) && ( str_contains( $lower, 'create' ) || str_contains( $lower, 'assign' ) || str_contains( $lower, 'pio' ) ) ) {
			return 'action_plan';
		}

		if ( str_contains( $lower, 'list' ) && str_contains( $lower, 'task' ) ) {
			return 'read_only';
		}

		if ( self::is_project_create_message( $lower, $body ) ) {
			return 'action_plan';
		}

		if ( self::is_template_message( $lower ) ) {
			return 'action_plan';
		}

		if ( self::is_recipe_message( $lower ) ) {
			return 'action_plan';
		}

		return 'none';
	}

	/**
	 * Automation recipe catalog install/list/describe/run.
	 */
	public static function is_recipe_message( string $lower ): bool {
		$needles = array(
			'automation recipe',
			'recipe library',
			'install recipe',
			'install automation',
			'automation catalog',
			'list recipes',
			'list automations',
			'what automations',
			'entity sap guardian',
			'intent decay radar',
			'seo autopilot',
			'recipes_list',
			'recipes_install',
		);
		foreach ( $needles as $needle ) {
			if ( str_contains( $lower, $needle ) ) {
				return true;
			}
		}
		foreach ( Neo_Pulse_App_Automation_Recipe_Registry::all() as $recipe ) {
			$name = strtolower( (string) ( $recipe['name'] ?? '' ) );
			$kw   = strtolower( (string) ( $recipe['keyword'] ?? '' ) );
			if ( $name !== '' && str_contains( $lower, $name ) ) {
				return true;
			}
			if ( $kw !== '' && str_contains( $lower, $kw ) ) {
				return true;
			}
		}
		return false;
	}

	/**
	 * Save, load, or create from task templates.
	 */
	public static function is_template_message( string $lower ): bool {
		$needles = array(
			'save template',
			'save as template',
			'as a template',
			'load template',
			'from template',
			'create from template',
			'delete template',
			'remove template',
			'template called',
		);
		foreach ( $needles as $needle ) {
			if ( str_contains( $lower, $needle ) ) {
				return true;
			}
		}
		return str_contains( $lower, 'template' )
			&& ( str_contains( $lower, 'save' ) || str_contains( $lower, 'create' ) || str_contains( $lower, 'load' ) || str_contains( $lower, 'delete' ) );
	}

	/**
	 * Detect project creation intent (including common typos: projecrt, porject).
	 *
	 * @param array<string,mixed> $body
	 */
	public static function is_project_create_message( string $lower, array $body = array() ): bool {
		$project_needles = array(
			'create project',
			'new project',
			'add project',
			'create a project',
			'make a project',
		);
		foreach ( $project_needles as $needle ) {
			if ( str_contains( $lower, $needle ) ) {
				return true;
			}
		}

		$has_project_stem = str_contains( $lower, 'projec' ) || str_contains( $lower, 'porject' );
		$has_create_verb  = str_contains( $lower, 'create' )
			|| str_contains( $lower, 'new' )
			|| str_contains( $lower, 'add' )
			|| str_contains( $lower, 'called' )
			|| str_contains( $lower, 'make' );

		if ( $has_project_stem && $has_create_verb ) {
			return true;
		}

		$pulse   = isset( $body['pulse_context'] ) && is_array( $body['pulse_context'] ) ? $body['pulse_context'] : array();
		$on_tasks = (string) ( $pulse['managerTab'] ?? '' ) === 'tasks';
		if ( $on_tasks && $has_project_stem && $has_create_verb ) {
			return true;
		}

		return false;
	}

	/**
	 * Project creation plus one or more tasks in the same request.
	 */
	public static function is_compound_project_task_message( string $lower ): bool {
		if ( ! self::is_project_create_message( $lower ) ) {
			return false;
		}
		return str_contains( $lower, 'add a task' )
			|| str_contains( $lower, 'add task' )
			|| str_contains( $lower, 'create a task' )
			|| str_contains( $lower, 'create task' );
	}

	/**
	 * Extract a project title from user message (text after "called", bounded).
	 */
	public static function extract_project_title( string $message ): string {
		$lower = strtolower( $message );
		$pos   = strpos( $lower, 'called' );
		if ( $pos === false ) {
			return '';
		}
		$title       = trim( substr( $message, $pos + 6 ) );
		$title_lower = strtolower( $title );
		$boundaries  = array( ' and add', ' and create', ' with a task', ' with task' );
		foreach ( $boundaries as $boundary ) {
			$bpos = strpos( $title_lower, $boundary );
			if ( $bpos !== false ) {
				$title = trim( substr( $title, 0, $bpos ) );
				break;
			}
		}
		if ( $title === '' ) {
			return '';
		}
		return self::normalize_display_title( sanitize_text_field( $title ) );
	}

	/**
	 * Raw task phrase after "add/create task to".
	 */
	public static function extract_task_title_hint( string $message ): string {
		$lower    = strtolower( $message );
		$prefixes = array( 'add a task to ', 'add task to ', 'create a task to ', 'create task to ', 'task to ' );
		foreach ( $prefixes as $prefix ) {
			$pos = strpos( $lower, $prefix );
			if ( $pos !== false ) {
				return trim( substr( $message, $pos + strlen( $prefix ) ) );
			}
		}
		return '';
	}

	public static function normalize_display_title( string $title ): string {
		$title = preg_replace( '/\s+/', ' ', trim( $title ) );
		if ( $title === '' ) {
			return '';
		}
		if ( function_exists( 'mb_convert_case' ) ) {
			return mb_convert_case( $title, MB_CASE_TITLE, 'UTF-8' );
		}
		return ucwords( strtolower( $title ) );
	}

	/**
	 * @param array<string,mixed> $body
	 */
	public static function build_task_title_from_hint( string $hint, array $body ): string {
		$hint = trim( $hint );
		if ( $hint === '' ) {
			return '';
		}
		$schedule_suffixes = array(
			' every first of the month',
			' every first of month',
			' on the first of the month',
			' on the first of month',
			' every first of',
		);
		$hint_lower = strtolower( $hint );
		foreach ( $schedule_suffixes as $suffix ) {
			$pos = strpos( $hint_lower, $suffix );
			if ( $pos !== false ) {
				$hint = trim( substr( $hint, 0, $pos ) );
				break;
			}
		}
		$client = Neo_Pulse_App_Pulse_Assist_Action_Tools_Tasks::client_display_name( $body );
		$lower  = strtolower( $hint );
		if ( str_contains( $lower, 'optim' ) && str_contains( $lower, 'post' ) && $client !== '' ) {
			return self::normalize_display_title( 'Optimize ' . $client . ' posts' );
		}
		return self::normalize_display_title( $hint );
	}

	public static function message_mentions_first_of_month( string $message ): bool {
		$lower = strtolower( $message );
		return str_contains( $lower, 'first of the month' )
			|| str_contains( $lower, '1st of the month' )
			|| str_contains( $lower, 'first of month' )
			|| str_contains( $lower, 'every first of' );
	}

	public static function next_first_of_month_iso(): string {
		$now   = new DateTimeImmutable( 'now', new DateTimeZone( 'UTC' ) );
		$year  = (int) $now->format( 'Y' );
		$month = (int) $now->format( 'm' );
		$month++;
		if ( $month > 12 ) {
			$month = 1;
			$year++;
		}
		return sprintf( '%04d-%02d-01T00:00:00.000Z', $year, $month );
	}

	/**
	 * @param array<int,array<string,mixed>> $history
	 * @param array<string,mixed>            $body
	 * @return array<string,mixed>
	 */
	public static function plan( string $message, array $history, array $body ): array {
		$empty = array(
			'intentSummary' => '',
			'sliceTeam'     => array(),
			'readTools'     => array( 'team_list_members', 'tasks_list_projects', 'tasks_search' ),
			'reason'        => 'No action plan',
		);

		$route = self::route( $message, $history, $body );
		if ( $route === 'none' ) {
			return $empty;
		}

		$ctx_block = self::team_context_block( $body );
		$props     = self::properties_block( $body );

		$system = 'You plan Pulse Assist task-manager actions. Return JSON only:
{"intentSummary":"","sliceTeam":[{"id":"project_creator","role":"Project creator","slice":"project_creator","focus":"","systemPrompt":""}],"readTools":["tasks_list_projects"],"needsWrite":true}
Rules:
- sliceTeam: pick 2-4 agents from: member_resolver, project_resolver, project_creator, task_decomposer, task_validator.
- member_resolver when a person name or assignee is mentioned.
- project_resolver when matching an existing client, property, or project.
- project_creator when the user wants to create a new task project (not tasks inside an existing project).
- task_decomposer when creating multiple tasks or optimization work is requested.
- task_validator when duplicates might exist.
- When the user asks to create a new project AND add task(s), include both project_creator and task_decomposer.
- readTools: subset of tasks_list_projects, tasks_list_sections, tasks_search, tasks_list_my, team_list_members, tasks_list_templates, recipes_list, recipes_describe.
- needsWrite true when user wants tasks, projects, or recipe installs created or updated.';

		$user = "User message:\n{$message}\n\n{$ctx_block}\n{$props}";

		$parsed = Neo_Pulse_App_Chat_Openrouter::json_completion(
			array(
				array( 'role' => 'system', 'content' => $system ),
				array( 'role' => 'user', 'content' => $user ),
			),
			array(
				'model'       => self::SLICE_MODEL,
				'temperature' => 0.2,
				'maxTokens'   => 1200,
			)
		);

		if ( ! is_array( $parsed ) || empty( $parsed['sliceTeam'] ) || ! is_array( $parsed['sliceTeam'] ) ) {
			$lower = strtolower( $message );
			$recipe = self::is_recipe_message( $lower );
			return array_merge(
				$empty,
				array(
					'intentSummary' => $recipe ? 'Automation recipe request' : 'Task manager request',
					'sliceTeam'     => self::default_slice_team( $message ),
					'readTools'     => $recipe
						? array( 'recipes_list', 'recipes_describe' )
						: array( 'team_list_members', 'tasks_list_projects', 'tasks_search' ),
					'needsWrite'    => $route === 'action_plan',
					'reason'        => 'Fallback slice team',
				)
			);
		}

		$slice_team = array_slice( $parsed['sliceTeam'], 0, self::MAX_SLICE_AGENTS );
		$read_tools = isset( $parsed['readTools'] ) && is_array( $parsed['readTools'] ) ? $parsed['readTools'] : array();

		return array(
			'intentSummary' => (string) ( $parsed['intentSummary'] ?? '' ),
			'sliceTeam'     => self::normalize_slice_team( $slice_team ),
			'readTools'     => self::normalize_read_tools( $read_tools ),
			'needsWrite'    => ! empty( $parsed['needsWrite'] ) || $route === 'action_plan',
			'reason'        => '',
		);
	}

	/**
	 * @param array<int,array<string,mixed>> $slice_team
	 * @return array<int,array<string,mixed>>
	 */
	private static function normalize_slice_team( array $slice_team ): array {
		$out = array();
		foreach ( $slice_team as $spec ) {
			if ( ! is_array( $spec ) ) {
				continue;
			}
			$slice = sanitize_key( (string) ( $spec['slice'] ?? '' ) );
			if ( $slice === '' ) {
				continue;
			}
			$id = sanitize_key( (string) ( $spec['id'] ?? $slice ) );
			$out[] = array(
				'id'           => $id,
				'role'         => (string) ( $spec['role'] ?? $slice ),
				'slice'        => $slice,
				'focus'        => (string) ( $spec['focus'] ?? '' ),
				'systemPrompt' => (string) ( $spec['systemPrompt'] ?? self::default_system_for_slice( $slice ) ),
			);
		}
		return $out;
	}

	/**
	 * @return array<int,array<string,mixed>>
	 */
	private static function default_slice_team( string $message ): array {
		$lower = strtolower( $message );
		if ( self::is_recipe_message( $lower ) ) {
			return array(
				array(
					'id'           => 'project_resolver',
					'role'         => 'Recipe resolver',
					'slice'        => 'project_resolver',
					'focus'        => 'Automation recipes',
					'systemPrompt' => self::default_system_for_slice( 'project_resolver' ),
				),
			);
		}
		if ( self::is_template_message( $lower ) ) {
			return array(
				array(
					'id'           => 'template_resolver',
					'role'         => 'Template resolver',
					'slice'        => 'template_resolver',
					'focus'        => '',
					'systemPrompt' => self::default_system_for_slice( 'template_resolver' ),
				),
				array(
					'id'           => 'task_validator',
					'role'         => 'Task validator',
					'slice'        => 'task_validator',
					'focus'        => '',
					'systemPrompt' => self::default_system_for_slice( 'task_validator' ),
				),
			);
		}
		if ( self::is_compound_project_task_message( $lower ) ) {
			return array(
				array(
					'id'           => 'project_creator',
					'role'         => 'Project creator',
					'slice'        => 'project_creator',
					'focus'        => self::extract_project_title( $message ),
					'systemPrompt' => self::default_system_for_slice( 'project_creator' ),
				),
				array(
					'id'           => 'task_decomposer',
					'role'         => 'Task decomposer',
					'slice'        => 'task_decomposer',
					'focus'        => self::extract_task_title_hint( $message ),
					'systemPrompt' => self::default_system_for_slice( 'task_decomposer' ),
				),
				array(
					'id'           => 'task_validator',
					'role'         => 'Task validator',
					'slice'        => 'task_validator',
					'focus'        => '',
					'systemPrompt' => self::default_system_for_slice( 'task_validator' ),
				),
			);
		}
		if ( self::is_project_create_message( $lower ) ) {
			return array(
				array(
					'id'           => 'project_creator',
					'role'         => 'Project creator',
					'slice'        => 'project_creator',
					'focus'        => Neo_Pulse_App_Pulse_Assist_Action_Intent::extract_project_title( $message ),
					'systemPrompt' => self::default_system_for_slice( 'project_creator' ),
				),
				array(
					'id'           => 'task_validator',
					'role'         => 'Task validator',
					'slice'        => 'task_validator',
					'focus'        => '',
					'systemPrompt' => self::default_system_for_slice( 'task_validator' ),
				),
			);
		}
		$slices = array( 'project_resolver', 'task_decomposer' );
		if ( preg_match( '/\b[a-z]{2,}\b/i', $message ) ) {
			array_unshift( $slices, 'member_resolver' );
		}
		if ( str_contains( $lower, 'task' ) ) {
			$slices[] = 'task_validator';
		}
		$out = array();
		foreach ( array_unique( $slices ) as $slice ) {
			$out[] = array(
				'id'           => $slice,
				'role'         => ucwords( str_replace( '_', ' ', $slice ) ),
				'slice'        => $slice,
				'focus'        => '',
				'systemPrompt' => self::default_system_for_slice( $slice ),
			);
		}
		return array_slice( $out, 0, self::MAX_SLICE_AGENTS );
	}

	private static function default_system_for_slice( string $slice ): string {
		switch ( $slice ) {
			case 'member_resolver':
				return 'Resolve assignee names to userId using team members. Return findings with matched userId and displayName.';
			case 'project_resolver':
				return 'Match client or property names to a task project id and title.';
			case 'project_creator':
				return 'Extract the new project title and keyword from the user request. Check existing projects to avoid duplicate titles.';
			case 'task_decomposer':
				return 'Break the user request into concrete task titles for SEO/client optimization work.';
			case 'task_validator':
				return 'Check existing tasks to avoid duplicate titles for the same project.';
			case 'template_resolver':
				return 'Match template keyword or name from tasks_list_templates. Propose defaultTasks and note {client} placeholders for client-specific titles.';
			default:
				return 'Analyze the task request slice and return structured findings.';
		}
	}

	/**
	 * @param mixed $raw
	 * @return array<int,string>
	 */
	private static function normalize_read_tools( $raw ): array {
		if ( ! is_array( $raw ) ) {
			return array( 'team_list_members', 'tasks_list_projects' );
		}
		$allowed = Neo_Pulse_App_Pulse_Assist_Action_Registry::read_tool_ids();
		$out     = array();
		foreach ( $raw as $id ) {
			$id = sanitize_key( (string) $id );
			if ( $id !== '' && in_array( $id, $allowed, true ) ) {
				$out[] = $id;
			}
		}
		return count( $out ) > 0 ? $out : array( 'team_list_members', 'tasks_list_projects' );
	}

	/**
	 * @param array<string,mixed> $body
	 */
	private static function has_team_context( array $body ): bool {
		$ctx = isset( $body['team_context'] ) && is_array( $body['team_context'] ) ? $body['team_context'] : null;
		return is_array( $ctx ) && ! empty( $ctx['teamId'] );
	}

	/**
	 * @param array<string,mixed> $body
	 */
	private static function team_context_block( array $body ): string {
		$ctx = isset( $body['team_context'] ) && is_array( $body['team_context'] ) ? $body['team_context'] : array();
		return 'Team context JSON:' . wp_json_encode( $ctx, JSON_UNESCAPED_SLASHES );
	}

	/**
	 * @param array<string,mixed> $body
	 */
	private static function properties_block( array $body ): string {
		$ctx = isset( $body['properties_context'] ) && is_array( $body['properties_context'] ) ? $body['properties_context'] : array();
		return 'Properties context JSON:' . wp_json_encode( $ctx, JSON_UNESCAPED_SLASHES );
	}
}
