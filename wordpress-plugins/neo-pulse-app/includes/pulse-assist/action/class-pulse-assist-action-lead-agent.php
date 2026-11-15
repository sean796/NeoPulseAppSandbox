<?php
/**
 * Lead execution agent: synthesizes action plan and tool calls.
 *
 * @package Neo_Pulse_App
 */

defined( 'ABSPATH' ) || exit;

class Neo_Pulse_App_Pulse_Assist_Action_Lead_Agent {

	const LEAD_MODEL = 'google/gemini-2.5-flash';

	/**
	 * @param array<string,mixed>            $plan
	 * @param array<string,mixed>            $read_payload
	 * @param array<int,array<string,mixed>> $slice_reports
	 * @param array<string,mixed>            $body
	 * @return array<string,mixed>
	 */
	public static function synthesize( string $message, array $plan, array $read_payload, array $slice_reports, array $body, string $submode ): array {
		$execute_writes = $submode === 'build';

		$system = 'You are the Pulse Assist lead execution agent for team tasks. Return JSON only:
{
  "intentSummary": "",
  "previewBody": "",
  "previewTable": {"columns":["Task","Assignee","Project"],"rows":[["",""]]},
  "toolCalls": [{"tool":"tasks_create_batch","args":{"projectId":0,"tasks":[{"title":"","assigneeIds":[]}]}}],
  "submode_switch": "",
  "suggested_actions": []
}
For new project creation use:
{"tool":"tasks_create_project","args":{"title":"Project name","keyword":"","description":""}}
Rules:
- For Ask/Plan preview: toolCalls may list planned writes but they will NOT run unless submode is build.
- Use tasks_create_project when the user wants to create/add a new team project (not tasks inside an existing project).
- When the user asks for a new project AND task(s), emit tasks_create_project first, then tasks_create or tasks_create_batch with projectId 0 (executor chains to the new project).
- Use tasks_create or tasks_create_batch when assigning work inside an existing project.
- Use short professional titles in title case. Include active site/client name in optimization task titles when relevant.
- Assignee userIds must come from slice reports or team members.
- projectId must come from slice reports, team_context.activeProjectId, or projects list.
- proposedTasks should be concrete SEO optimization steps when user asks to optimize a client.
- Max ' . Neo_Pulse_App_Pulse_Assist_Action_Registry::MAX_BATCH_TASKS . ' tasks in tasks_create_batch.
- If assignee or project cannot be resolved, explain in previewBody and leave toolCalls empty with submode_switch "plan".
- When submode is ask, set submode_switch to "build" if writes would be needed.
- For project-only previewTable use columns ["Project","Keyword"].
- For compound project+task previewTable use columns ["Task","Project","Due"] with one row.
- Use tasks_save_template to save or update a template (keyword, name, defaultTasks). Call tasks_list_templates first to avoid duplicate keywords.
- Use tasks_delete_template to remove a template by keyword.
- Use tasks_create_project with templateKeyword to create a project from a saved template. Pass taskClients when the user names a client for specific tasks.
- Template previewTable for create-from-template: columns ["Task","Project","Client"].
- Automation recipe catalog tools: recipes_list (filters: category, bucket, execution, signal, vertical, q), recipes_describe (keyword), recipes_install (keyword/recipeKeyword, wordpressSiteId, title), recipes_run (mode: evaluate|now|install_only, keyword, wordpressSiteId, optional taskId).
- recipes_install creates a site-bound automation project. Recipe install previewTable columns: ["Recipe","Action"].
- When user asks to install an automation recipe for a client site, use recipes_install with the recipe keyword and wordpressSiteId from team_context properties.
- When user asks what automations exist, use recipes_list first, then summarize in previewBody.
- Post creator: use post_creator_execute for immediate runs (postCount, optionalPrompt, scheduleTimesPerMonth, scheduleStartDay, wordpressSiteId). Install monthly-post-creator or monthly-3-posts-editorial via recipes_install for recurring calendar automations.
- GSC reporting: use gsc_reporting_execute for an immediate MoM or YoY Search Console report (comparePreset mom|yoy, saveToDisk, wordpressSiteId). Install gsc-monthly-mom-report or gsc-monthly-yoy-report via recipes_install for a monthly calendar automation.
- PPC / Google Ads reporting: use ads_reporting_execute for an immediate MoM or YoY Ads spend report (comparePreset mom|yoy, saveToDisk, wordpressSiteId). Requires a 10-digit Google Ads customer ID on the property. Install ads-monthly-mom-report or ads-monthly-yoy-report via recipes_install for a monthly calendar automation. Do not use gsc_reporting_execute for Ads or PPC spend. Do not send PPC report requests to the PPC Google campaign builder.';

		$user = "Submode: {$submode}\nExecute writes: " . ( $execute_writes ? 'yes' : 'no' ) . "\n";
		$user .= "User message:\n{$message}\n\n";
		$user .= 'Intent plan: ' . wp_json_encode( $plan, JSON_UNESCAPED_SLASHES ) . "\n";
		$user .= 'Read tools: ' . wp_json_encode( $read_payload, JSON_UNESCAPED_SLASHES ) . "\n";
		$user .= 'Slice reports: ' . wp_json_encode( $slice_reports, JSON_UNESCAPED_SLASHES ) . "\n";
		$user .= 'Team context: ' . wp_json_encode( $body['team_context'] ?? array(), JSON_UNESCAPED_SLASHES );

		$parsed = Neo_Pulse_App_Chat_Openrouter::json_completion(
			array(
				array( 'role' => 'system', 'content' => $system ),
				array( 'role' => 'user', 'content' => $user ),
			),
			array(
				'model'       => self::LEAD_MODEL,
				'temperature' => 0.25,
				'maxTokens'   => 2400,
			)
		);

		if ( ! is_array( $parsed ) ) {
			return self::fallback_plan( $message, $body, $submode );
		}

		$tool_calls = isset( $parsed['toolCalls'] ) && is_array( $parsed['toolCalls'] ) ? $parsed['toolCalls'] : array();
		$table      = isset( $parsed['previewTable'] ) && is_array( $parsed['previewTable'] ) ? $parsed['previewTable'] : null;

		return array(
			'intentSummary'     => (string) ( $parsed['intentSummary'] ?? $plan['intentSummary'] ?? '' ),
			'previewBody'       => (string) ( $parsed['previewBody'] ?? '' ),
			'previewTable'      => $table,
			'toolCalls'         => self::normalize_tool_calls( $tool_calls ),
			'submode_switch'    => (string) ( $parsed['submode_switch'] ?? ( $submode === 'ask' && count( $tool_calls ) > 0 ? 'build' : '' ) ),
			'suggested_actions' => isset( $parsed['suggested_actions'] ) && is_array( $parsed['suggested_actions'] ) ? $parsed['suggested_actions'] : array(),
		);
	}

	/**
	 * @param mixed $raw
	 * @return array<int,array<string,mixed>>
	 */
	private static function normalize_tool_calls( $raw ): array {
		if ( ! is_array( $raw ) ) {
			return array();
		}
		$out = array();
		foreach ( $raw as $call ) {
			if ( ! is_array( $call ) ) {
				continue;
			}
			$tool = sanitize_key( (string) ( $call['tool'] ?? '' ) );
			if ( $tool === '' ) {
				continue;
			}
			$args = isset( $call['args'] ) && is_array( $call['args'] ) ? $call['args'] : array();
			$out[] = array(
				'tool' => $tool,
				'args' => $args,
			);
		}
		return array_slice( $out, 0, 5 );
	}

	/**
	 * @param array<string,mixed> $body
	 * @return array<string,mixed>
	 */
	private static function fallback_plan( string $message, array $body, string $submode ): array {
		$lower = strtolower( trim( $message ) );
		if ( Neo_Pulse_App_Pulse_Assist_Action_Intent::is_project_create_message( $lower, $body ) ) {
			$project_title = Neo_Pulse_App_Pulse_Assist_Action_Intent::extract_project_title( $message );
			if ( $project_title === '' ) {
				$project_title = Neo_Pulse_App_Pulse_Assist_Action_Intent::normalize_display_title( sanitize_text_field( trim( $message ) ) );
			}
			$is_compound    = Neo_Pulse_App_Pulse_Assist_Action_Intent::is_compound_project_task_message( $lower );
			$task_hint      = Neo_Pulse_App_Pulse_Assist_Action_Intent::extract_task_title_hint( $message );
			$task_title     = Neo_Pulse_App_Pulse_Assist_Action_Intent::build_task_title_from_hint( $task_hint, $body );
			$first_of_month = Neo_Pulse_App_Pulse_Assist_Action_Intent::message_mentions_first_of_month( $message );
			$due_date       = $first_of_month ? Neo_Pulse_App_Pulse_Assist_Action_Intent::next_first_of_month_iso() : '';
			$due_label      = $first_of_month ? gmdate( 'M j, Y', strtotime( $due_date ) ) : '';

			$tool_calls = array();
			if ( $project_title !== '' ) {
				$tool_calls[] = array(
					'tool' => 'tasks_create_project',
					'args' => array(
						'title'       => $project_title,
						'keyword'     => sanitize_title( $project_title ),
						'description' => '',
					),
				);
			}
			if ( $is_compound && $task_title !== '' ) {
				$task_args = array(
					'title'     => $task_title,
					'projectId' => 0,
				);
				if ( $due_date !== '' ) {
					$task_args['dueDate'] = $due_date;
				}
				$tool_calls[] = array(
					'tool' => 'tasks_create',
					'args' => $task_args,
				);
			}

			$preview_table = null;
			if ( $is_compound && $project_title !== '' && $task_title !== '' ) {
				$preview_table = array(
					'columns' => array( 'Task', 'Project', 'Due' ),
					'rows'    => array( array( $task_title, $project_title, $due_label ) ),
				);
			} elseif ( $project_title !== '' ) {
				$preview_table = array(
					'columns' => array( 'Project', 'Keyword' ),
					'rows'    => array( array( $project_title, sanitize_title( $project_title ) ) ),
				);
			}

			$preview_body = '';
			if ( $is_compound && $project_title !== '' && $task_title !== '' ) {
				$preview_body = 'Create project "' . $project_title . '" and add task "' . $task_title . '"';
				if ( $due_label !== '' ) {
					$preview_body .= ' due ' . $due_label;
				}
				$preview_body .= '.';
			} elseif ( $project_title !== '' ) {
				$preview_body = 'Create project "' . $project_title . '".';
			} else {
				$preview_body = 'Could not extract a project name. Try "create a project called Your Project Name".';
			}

			return array(
				'intentSummary'        => $is_compound ? 'Create project and task' : 'Create task project',
				'previewBody'          => $preview_body,
				'previewTable'         => $preview_table,
				'toolCalls'            => $tool_calls,
				'submode_switch'       => $submode === 'ask' ? 'build' : '',
				'suggested_actions'    => array( 'Switch to Build mode', 'Open Tasks tab' ),
				'compoundProjectTask'  => $is_compound,
			);
		}

		if ( Neo_Pulse_App_Pulse_Assist_Action_Intent::is_template_message( $lower ) ) {
			$template_keyword = '';
			if ( preg_match( '/template\s+(?:called\s+)?["\']?([a-z0-9-]+)["\']?/i', $message, $m ) ) {
				$template_keyword = sanitize_title( (string) $m[1] );
			} elseif ( preg_match( '/from\s+([a-z0-9-]+)\s+template/i', $message, $m ) ) {
				$template_keyword = sanitize_title( (string) $m[1] );
			}
			$client_name = Neo_Pulse_App_Pulse_Assist_Action_Tools_Tasks::client_display_name( $body );
			$tool_calls  = array();
			$preview_body = '';
			$preview_table = null;

			if ( str_contains( $lower, 'delete template' ) || str_contains( $lower, 'remove template' ) ) {
				if ( $template_keyword !== '' ) {
					$tool_calls[] = array(
						'tool' => 'tasks_delete_template',
						'args' => array( 'keyword' => $template_keyword ),
					);
					$preview_body = 'Delete template "' . $template_keyword . '".';
				}
			} elseif ( str_contains( $lower, 'save' ) && str_contains( $lower, 'template' ) ) {
				$name = $template_keyword !== '' ? Neo_Pulse_App_Pulse_Assist_Action_Intent::normalize_display_title( $template_keyword ) : 'Saved Template';
				if ( $template_keyword === '' ) {
					$template_keyword = sanitize_title( $name );
				}
				$tool_calls[] = array(
					'tool' => 'tasks_save_template',
					'args' => array(
						'keyword'      => $template_keyword,
						'name'         => $name,
						'defaultTasks' => array(),
					),
				);
				$preview_body = 'Save template "' . $name . '".';
			} elseif ( str_contains( $lower, 'from template' ) || str_contains( $lower, 'load template' ) ) {
				if ( $template_keyword !== '' ) {
					$project_title = Neo_Pulse_App_Pulse_Assist_Action_Intent::normalize_display_title( str_replace( '-', ' ', $template_keyword ) );
					$task_clients  = array();
					if ( $client_name !== '' ) {
						$task_clients[] = array( 'taskKeyword' => '', 'clientSiteId' => '' );
					}
					$tool_calls[] = array(
						'tool' => 'tasks_create_project',
						'args' => array(
							'title'           => $project_title,
							'keyword'         => $template_keyword,
							'templateKeyword' => $template_keyword,
							'taskClients'     => $task_clients,
						),
					);
					$preview_body  = 'Create project from template "' . $template_keyword . '"';
					$preview_table = array(
						'columns' => array( 'Task', 'Project', 'Client' ),
						'rows'    => array( array( '…', $project_title, $client_name ) ),
					);
					if ( $client_name !== '' ) {
						$preview_body .= ' for ' . $client_name;
					}
					$preview_body .= '.';
				}
			}

			return array(
				'intentSummary'     => 'Task template',
				'previewBody'       => $preview_body !== '' ? $preview_body : 'Review template actions and switch to Build.',
				'previewTable'      => $preview_table,
				'toolCalls'         => $tool_calls,
				'submode_switch'    => $submode === 'ask' ? 'build' : '',
				'suggested_actions' => array( 'Switch to Build mode', 'Open Tasks tab' ),
			);
		}

		return array(
			'intentSummary'     => 'Task manager request',
			'previewBody'       => 'Could not fully plan task actions. Confirm project and assignee, then switch to Build.',
			'previewTable'      => null,
			'toolCalls'         => array(),
			'submode_switch'    => $submode === 'ask' ? 'build' : '',
			'suggested_actions' => array( 'Switch to Build mode', 'Open Tasks tab' ),
		);
	}
}
