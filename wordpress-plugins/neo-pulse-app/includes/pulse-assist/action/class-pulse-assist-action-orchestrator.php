<?php
/**
 * Pulse Assist action orchestrator: plan → parallel specialists → lead → execute (Build).
 *
 * @package Neo_Pulse_App
 */

defined( 'ABSPATH' ) || exit;

class Neo_Pulse_App_Pulse_Assist_Action_Orchestrator {

	/**
	 * @param array<int,array<string,mixed>> $history
	 * @param array<string,mixed>            $body
	 * @param callable|null                  $emit
	 * @return array<string,mixed>
	 */
	public static function run( string $message, array $history, array $body, string $submode, int $user_id, ?callable $emit = null ): array {
		$emit_event = static function ( array $payload ) use ( $emit ): void {
			if ( is_callable( $emit ) ) {
				$emit( $payload );
			}
		};

		$empty = array(
			'handled'         => false,
			'card'            => null,
			'intentSummary'   => '',
			'sliceTeam'       => array(),
			'actionPlanTools' => array(),
			'executed'        => false,
		);

		$route = Neo_Pulse_App_Pulse_Assist_Action_Intent::route( $message, $history, $body );
		if ( $route === 'none' ) {
			return $empty;
		}

		$emit_event(
			array(
				'status' => 'phase',
				'phase'  => 'action',
				'label'  => 'Planning task actions…',
			)
		);

		$plan = Neo_Pulse_App_Pulse_Assist_Action_Intent::plan( $message, $history, $body );
		$slice_team = isset( $plan['sliceTeam'] ) && is_array( $plan['sliceTeam'] ) ? $plan['sliceTeam'] : array();

		if ( count( $slice_team ) > 0 ) {
			$agents = array();
			foreach ( $slice_team as $spec ) {
				$agents[] = array(
					'id'   => (string) ( $spec['id'] ?? '' ),
					'role' => (string) ( $spec['role'] ?? '' ),
				);
			}
			$emit_event(
				array(
					'status' => 'agent_plan',
					'agents' => $agents,
				)
			);
		}

		$read_tools = isset( $plan['readTools'] ) && is_array( $plan['readTools'] ) ? $plan['readTools'] : array();
		$read_payload = Neo_Pulse_App_Pulse_Assist_Action_Executor::fetch_read_tools( $read_tools, $body, $user_id );

		$emit_event(
			array(
				'status' => 'phase',
				'phase'  => 'fetch',
				'label'  => 'Running task specialists…',
			)
		);

		$parallel = Neo_Pulse_App_Pulse_Assist_Action_Parallel_Team::run(
			$slice_team,
			$read_payload,
			$body,
			$message,
			$emit
		);
		$slice_reports = $parallel['sliceReports'] ?? array();

		$emit_event( array( 'status' => 'lead', 'state' => 'running' ) );

		$execution = Neo_Pulse_App_Pulse_Assist_Action_Lead_Agent::synthesize(
			$message,
			$plan,
			$read_payload,
			$slice_reports,
			$body,
			$submode
		);

		$execution = self::normalize_execution( $execution, $body, $message );

		$emit_event( array( 'status' => 'lead', 'state' => 'done' ) );

		$tool_calls = isset( $execution['toolCalls'] ) && is_array( $execution['toolCalls'] ) ? $execution['toolCalls'] : array();
		if ( count( $tool_calls ) > 0 ) {
			$emit_event(
				array(
					'status' => 'action_plan',
					'tools'  => $tool_calls,
				)
			);
		}

		$exec_result = null;
		$executed    = false;
		if ( $submode === 'build' && count( $tool_calls ) > 0 ) {
			$emit_event(
				array(
					'status' => 'phase',
					'phase'  => 'compose',
					'label'  => 'Executing task actions…',
				)
			);
			$exec_result = Neo_Pulse_App_Pulse_Assist_Action_Executor::execute_plan(
				$tool_calls,
				$body,
				$user_id,
				'build',
				$emit
			);
			$executed = ! empty( $exec_result['ok'] );
		}

		$card = self::card_from_execution( $execution, $exec_result, $submode, $route, $body, $message );

		return array(
			'handled'         => true,
			'card'            => $card,
			'intentSummary'   => (string) ( $execution['intentSummary'] ?? '' ),
			'sliceTeam'       => $slice_team,
			'actionPlanTools' => $tool_calls,
			'executed'        => $executed,
			'execResult'      => $exec_result,
		);
	}

	/**
	 * @param array<string,mixed>      $execution
	 * @param array<string,mixed>|null $exec_result
	 * @return array<string,mixed>
	 */
	private static function card_from_execution( array $execution, ?array $exec_result, string $submode, string $route, array $body, string $message ): array {
		$body_text  = (string) ( $execution['previewBody'] ?? '' );
		$table      = isset( $execution['previewTable'] ) && is_array( $execution['previewTable'] ) ? $execution['previewTable'] : null;
		$tool_calls = isset( $execution['toolCalls'] ) && is_array( $execution['toolCalls'] ) ? $execution['toolCalls'] : array();
		$compound   = ! empty( $execution['compoundProjectTask'] )
			|| Neo_Pulse_App_Pulse_Assist_Action_Intent::is_compound_project_task_message( strtolower( $message ) );

		if ( $submode === 'build' && is_array( $exec_result ) ) {
			$created          = isset( $exec_result['createdTaskIds'] ) && is_array( $exec_result['createdTaskIds'] ) ? $exec_result['createdTaskIds'] : array();
			$created_projects = isset( $exec_result['createdProjectIds'] ) && is_array( $exec_result['createdProjectIds'] ) ? $exec_result['createdProjectIds'] : array();
			$count            = count( $created );
			$project_count    = count( $created_projects );
			$summary_body     = self::build_execution_summary_body( $exec_result, $body );
			$links            = array(
				array(
					'label'    => 'Open Tasks',
					'navigate' => array(
						'kind' => 'managerTab',
						'tab'  => 'tasks',
					),
				),
			);

			$template_saved   = false;
			$template_deleted = false;
			$template_name    = '';
			$results          = isset( $exec_result['results'] ) && is_array( $exec_result['results'] ) ? $exec_result['results'] : array();
			foreach ( $results as $row ) {
				if ( ! is_array( $row ) ) {
					continue;
				}
				$result = isset( $row['result'] ) && is_array( $row['result'] ) ? $row['result'] : array();
				if ( empty( $result['ok'] ) ) {
					continue;
				}
				$tool = sanitize_key( (string) ( $row['tool'] ?? '' ) );
				if ( $tool === 'tasks_save_template' && ! empty( $result['template']['name'] ) ) {
					$template_saved = true;
					$template_name  = trim( (string) $result['template']['name'] );
				}
				if ( $tool === 'tasks_delete_template' ) {
					$template_deleted = true;
					$template_name  = trim( (string) ( $result['keyword'] ?? '' ) );
				}
				if ( $tool === 'recipes_install' && ! empty( $result['card'] ) && is_array( $result['card'] ) ) {
					$install_card = $result['card'];
					$project_id   = (int) ( $result['projectId'] ?? 0 );
					return array_merge(
						$install_card,
						array(
							'project_id'    => $project_id,
							'action_result' => array(
								'createdProjectId' => $project_id,
								'projectId'        => $project_id,
							),
							'links' => array(
								array(
									'label'    => 'Open Tasks',
									'navigate' => array(
										'kind' => 'managerTab',
										'tab'  => 'tasks',
									),
								),
							),
						)
					);
				}
			}

			if ( ! empty( $exec_result['ok'] ) && $template_saved ) {
				return array(
					'type'           => 'action',
					'title'          => 'Saved template',
					'body'           => $template_name !== '' ? 'Saved template "' . $template_name . '".' : 'Template was saved.',
					'confidence'     => 'high',
					'table'          => $table,
					'submode_switch' => '',
					'links'          => $links,
					'suggested_actions' => array( 'Open Tasks tab', 'Create project from template' ),
					'details_drawer' => array( 'execution' => $exec_result ),
				);
			}

			if ( ! empty( $exec_result['ok'] ) && $template_deleted ) {
				return array(
					'type'           => 'action',
					'title'          => 'Deleted template',
					'body'           => $template_name !== '' ? 'Deleted template "' . $template_name . '".' : 'Template was deleted.',
					'confidence'     => 'high',
					'table'          => $table,
					'submode_switch' => '',
					'links'          => $links,
					'suggested_actions' => array( 'Open Tasks tab' ),
					'details_drawer' => array( 'execution' => $exec_result ),
				);
			}

			if ( ! empty( $exec_result['ok'] ) && $project_count > 0 && $count > 0 ) {
				return array(
					'type'           => 'action',
					'title'          => 'Created project and ' . $count . ' task' . ( $count === 1 ? '' : 's' ),
					'body'           => $summary_body !== '' ? $summary_body : 'Project and tasks were added to your team task list.',
					'confidence'     => 'high',
					'table'          => $table,
					'submode_switch' => '',
					'action_result'  => array(
						'createdTaskIds'     => $created,
						'createdProjectId' => (int) ( $created_projects[0] ?? 0 ),
						'projectId'          => (int) ( $exec_result['projectId'] ?? 0 ),
					),
					'links'               => $links,
					'suggested_actions'   => array( 'Open Tasks tab', 'Assign follow-up in task detail' ),
					'details_drawer'      => array(
						'execution' => $exec_result,
					),
				);
			}

			if ( ! empty( $exec_result['ok'] ) && $count > 0 ) {
				$table = self::patch_table_project_column(
					$table,
					Neo_Pulse_App_Pulse_Assist_Action_Tools_Tasks::project_label_for_card(
						$body,
						(int) ( $exec_result['projectId'] ?? 0 )
					)
				);
				return array(
					'type'           => 'action',
					'title'          => 'Created ' . $count . ' task' . ( $count === 1 ? '' : 's' ),
					'body'           => $summary_body !== '' ? $summary_body : 'Tasks were added to your team task list.',
					'confidence'     => 'high',
					'table'          => $table,
					'submode_switch' => '',
					'action_result'  => array(
						'createdTaskIds' => $created,
						'projectId'      => (int) ( $exec_result['projectId'] ?? 0 ),
					),
					'links'          => array(
						array(
							'label'    => 'Open Tasks',
							'navigate' => array(
								'kind' => 'managerTab',
								'tab'  => 'tasks',
							),
						),
					),
					'suggested_actions' => array( 'Open Tasks tab', 'Assign follow-up in task detail' ),
					'details_drawer'      => array(
						'execution' => $exec_result,
					),
				);
			}

			if ( ! empty( $exec_result['ok'] ) && $project_count > 0 ) {
				if ( $compound && $count === 0 ) {
					return array(
						'type'       => 'error',
						'title'      => 'Project created, task missing',
						'body'       => $summary_body !== ''
							? $summary_body . ' The project was created, but the requested task was not added. Open Tasks and add the task manually, or retry in Build mode.'
							: 'The project was created, but the requested task was not added.',
						'confidence' => 'low',
						'action_result' => array(
							'createdProjectId' => (int) ( $created_projects[0] ?? 0 ),
							'projectId'        => (int) ( $exec_result['projectId'] ?? 0 ),
						),
						'details_drawer' => array(
							'execution' => $exec_result,
						),
					);
				}

				$project_id    = (int) ( $created_projects[0] ?? 0 );
				$project_title = Neo_Pulse_App_Pulse_Assist_Action_Tools_Tasks::project_title_for_id( $body, $project_id );
				if ( $project_title === '' && is_array( $table ) && isset( $table['rows'][0][0] ) ) {
					$project_title = trim( (string) $table['rows'][0][0] );
				}
				return array(
					'type'           => 'action',
					'title'          => 'Created project',
					'body'           => $summary_body !== ''
						? $summary_body
						: ( $project_title !== '' ? 'Created project "' . $project_title . '".' : 'Project was created.' ),
					'confidence'     => 'high',
					'table'          => $table,
					'submode_switch' => '',
					'action_result'  => array(
						'createdProjectId' => $project_id,
						'projectId'        => $project_id,
					),
					'links'          => array(
						array(
							'label'    => 'Open Tasks',
							'navigate' => array(
								'kind' => 'managerTab',
								'tab'  => 'tasks',
							),
						),
					),
					'suggested_actions' => array( 'Open Tasks tab', 'Add tasks to this project' ),
					'details_drawer'      => array(
						'execution' => $exec_result,
					),
				);
			}

			$errors = isset( $exec_result['errors'] ) && is_array( $exec_result['errors'] ) ? implode( ' ', $exec_result['errors'] ) : 'Build did not create tasks or projects.';
			return array(
				'type'       => 'error',
				'title'      => 'Task build failed',
				'body'       => $errors,
				'confidence' => 'low',
			);
		}

		$type  = $submode === 'plan' ? 'plan' : 'answer';
		$title = $submode === 'plan' ? 'Task plan preview' : 'Task action preview';
		$is_project_plan = false;
		$is_recipe_plan  = false;
		foreach ( $tool_calls as $call ) {
			if ( ! is_array( $call ) ) {
				continue;
			}
			$tool = sanitize_key( (string) ( $call['tool'] ?? '' ) );
			if ( $tool === 'tasks_create_project' ) {
				$is_project_plan = true;
			}
			if ( $tool === 'recipes_install' || $tool === 'recipes_run' ) {
				$is_recipe_plan = true;
			}
		}
		if ( $is_project_plan ) {
			$title = $submode === 'plan' ? 'Project plan preview' : 'Project action preview';
		}
		if ( $is_recipe_plan ) {
			$title = $submode === 'plan' ? 'Recipe plan preview' : 'Recipe action preview';
		}
		if ( $body_text === '' && count( $tool_calls ) > 0 ) {
			$body_text = $is_recipe_plan
				? 'Review the planned recipe actions below. Switch to Build to apply them.'
				: 'Review the planned tasks below. Switch to Build to create them in your task list.';
		}
		if ( $submode === 'plan' ) {
			$body_text .= $is_recipe_plan
				? "\n\nThis is a read-only preview. Switch to Build to apply these recipe actions."
				: "\n\nThis is a read-only preview. Switch to Build to create these tasks.";
		}
		if ( $submode === 'ask' && count( $tool_calls ) > 0 ) {
			$body_text .= $is_recipe_plan
				? "\n\nAsk mode is preview only. Switch to Build to apply these recipe actions."
				: "\n\nAsk mode is preview only. Click Create tasks (Build mode) below to add them to your task list.";
		}

		$card = array(
			'type'              => $type,
			'title'             => $title,
			'body'              => trim( $body_text ),
			'confidence'        => 'medium',
			'table'             => $table,
			'submode_switch'    => (string) ( $execution['submode_switch'] ?? ( count( $tool_calls ) > 0 ? 'build' : '' ) ),
			'suggested_actions' => isset( $execution['suggested_actions'] ) && is_array( $execution['suggested_actions'] ) ? $execution['suggested_actions'] : array(),
			'links'             => array(
				array(
					'label'    => 'Open Tasks',
					'navigate' => array(
						'kind' => 'managerTab',
						'tab'  => 'tasks',
					),
				),
			),
		);

		return $card;
	}

	/**
	 * @param array<string,mixed> $execution
	 * @param array<string,mixed> $body
	 * @return array<string,mixed>
	 */
	private static function normalize_execution( array $execution, array $body, string $message ): array {
		$tool_calls = isset( $execution['toolCalls'] ) && is_array( $execution['toolCalls'] ) ? $execution['toolCalls'] : array();
		if ( count( $tool_calls ) === 0 ) {
			return $execution;
		}

		$lower          = strtolower( $message );
		$is_compound    = Neo_Pulse_App_Pulse_Assist_Action_Intent::is_compound_project_task_message( $lower );
		$project_id     = Neo_Pulse_App_Pulse_Assist_Action_Tools_Tasks::resolve_project_id( $body );
		$client_name    = Neo_Pulse_App_Pulse_Assist_Action_Tools_Tasks::client_display_name( $body );
		$project_label  = $project_id > 0
			? Neo_Pulse_App_Pulse_Assist_Action_Tools_Tasks::project_label_for_card( $body, $project_id )
			: $client_name;
		$first_of_month = Neo_Pulse_App_Pulse_Assist_Action_Intent::message_mentions_first_of_month( $message );
		$has_task_tool  = false;
		$has_project_tool = false;
		$project_title  = '';

		foreach ( $tool_calls as $i => $call ) {
			if ( ! is_array( $call ) ) {
				continue;
			}
			$args = isset( $call['args'] ) && is_array( $call['args'] ) ? $call['args'] : array();
			$tool = sanitize_key( (string) ( $call['tool'] ?? '' ) );
			if ( $tool === 'tasks_create_project' ) {
				$has_project_tool = true;
				$title = trim( (string) ( $args['title'] ?? '' ) );
				if ( $title === '' ) {
					$title = Neo_Pulse_App_Pulse_Assist_Action_Intent::extract_project_title( $message );
				}
				if ( $title !== '' ) {
					$title = Neo_Pulse_App_Pulse_Assist_Action_Intent::normalize_display_title( $title );
					$args['title'] = sanitize_text_field( $title );
					$project_title = $title;
					if ( empty( $args['keyword'] ) ) {
						$args['keyword'] = sanitize_title( $title );
					}
				}
				$tool_calls[ $i ]['args'] = $args;
				continue;
			}
			if ( in_array( $tool, array( 'tasks_create', 'tasks_create_batch' ), true ) ) {
				$has_task_tool = true;
			}
			$llm_project_id = (int) ( $args['projectId'] ?? 0 );
			if ( $project_id > 0 ) {
				$args['projectId'] = $project_id;
			} elseif ( $client_name !== '' && $llm_project_id > 0 ) {
				$llm_title = Neo_Pulse_App_Pulse_Assist_Action_Tools_Tasks::project_title_for_id( $body, $llm_project_id );
				if ( $llm_title !== '' && ! Neo_Pulse_App_Pulse_Assist_Action_Tools_Tasks::names_overlap( $llm_title, $client_name ) ) {
					unset( $args['projectId'] );
				}
			}
			if ( $tool === 'tasks_create' ) {
				$title = trim( (string) ( $args['title'] ?? '' ) );
				if ( $title === '' ) {
					$title = Neo_Pulse_App_Pulse_Assist_Action_Intent::build_task_title_from_hint(
						Neo_Pulse_App_Pulse_Assist_Action_Intent::extract_task_title_hint( $message ),
						$body
					);
				} else {
					$title = Neo_Pulse_App_Pulse_Assist_Action_Intent::normalize_display_title( $title );
				}
				if ( $title !== '' ) {
					$args['title'] = sanitize_text_field( $title );
				}
				if ( $first_of_month && empty( $args['dueDate'] ) ) {
					$args['dueDate'] = Neo_Pulse_App_Pulse_Assist_Action_Intent::next_first_of_month_iso();
				}
			}
			if ( isset( $args['tasks'] ) && is_array( $args['tasks'] ) ) {
				foreach ( $args['tasks'] as $j => $task ) {
					if ( ! is_array( $task ) ) {
						continue;
					}
					if ( ! empty( $task['title'] ) ) {
						$args['tasks'][ $j ]['title'] = sanitize_text_field(
							Neo_Pulse_App_Pulse_Assist_Action_Intent::normalize_display_title( (string) $task['title'] )
						);
					}
					$assignee_ids = array();
					if ( isset( $task['assigneeIds'] ) && is_array( $task['assigneeIds'] ) ) {
						foreach ( $task['assigneeIds'] as $uid ) {
							$uid = (int) $uid;
							if ( $uid > 0 ) {
								$assignee_ids[] = $uid;
							}
						}
					}
					if ( count( $assignee_ids ) === 0 && ! empty( $task['assignee'] ) ) {
						$uid = Neo_Pulse_App_Pulse_Assist_Action_Tools_Tasks::resolve_member_id( $body, (string) $task['assignee'] );
						if ( $uid > 0 ) {
							$assignee_ids = array( $uid );
						}
					}
					if ( count( $assignee_ids ) > 0 ) {
						$args['tasks'][ $j ]['assigneeIds'] = $assignee_ids;
					}
					if ( $first_of_month && empty( $args['tasks'][ $j ]['dueDate'] ) ) {
						$args['tasks'][ $j ]['dueDate'] = Neo_Pulse_App_Pulse_Assist_Action_Intent::next_first_of_month_iso();
					}
				}
			}
			$tool_calls[ $i ]['args'] = $args;
		}

		if ( $is_compound && $has_project_tool && ! $has_task_tool ) {
			$task_title = Neo_Pulse_App_Pulse_Assist_Action_Intent::build_task_title_from_hint(
				Neo_Pulse_App_Pulse_Assist_Action_Intent::extract_task_title_hint( $message ),
				$body
			);
			if ( $task_title !== '' ) {
				$task_args = array(
					'title'     => $task_title,
					'projectId' => 0,
				);
				if ( $first_of_month ) {
					$task_args['dueDate'] = Neo_Pulse_App_Pulse_Assist_Action_Intent::next_first_of_month_iso();
				}
				$tool_calls[] = array(
					'tool' => 'tasks_create',
					'args' => $task_args,
				);
				$has_task_tool = true;
			}
		}

		$execution['toolCalls']           = $tool_calls;
		$execution['compoundProjectTask'] = $is_compound;

		if ( $is_compound && $has_project_tool && $has_task_tool && $project_title !== '' ) {
			$task_title = '';
			foreach ( $tool_calls as $call ) {
				if ( ! is_array( $call ) ) {
					continue;
				}
				if ( sanitize_key( (string) ( $call['tool'] ?? '' ) ) === 'tasks_create' ) {
					$task_title = trim( (string) ( $call['args']['title'] ?? '' ) );
					break;
				}
			}
			if ( $task_title !== '' ) {
				$due_label = $first_of_month ? gmdate( 'M j, Y', strtotime( Neo_Pulse_App_Pulse_Assist_Action_Intent::next_first_of_month_iso() ) ) : '';
				$execution['previewTable'] = array(
					'columns' => array( 'Task', 'Project', 'Due' ),
					'rows'    => array( array( $task_title, $project_title, $due_label ) ),
				);
			}
		} elseif ( $project_label !== '' ) {
			$execution['previewTable'] = self::patch_table_project_column(
				isset( $execution['previewTable'] ) && is_array( $execution['previewTable'] ) ? $execution['previewTable'] : null,
				$project_label
			);
		}

		return $execution;
	}

	/**
	 * @param array<string,mixed> $exec_result
	 * @param array<string,mixed> $body
	 */
	private static function build_execution_summary_body( array $exec_result, array $body ): string {
		$parts           = array();
		$project_title   = '';
		$task_titles     = array();
		$results         = isset( $exec_result['results'] ) && is_array( $exec_result['results'] ) ? $exec_result['results'] : array();

		foreach ( $results as $row ) {
			if ( ! is_array( $row ) ) {
				continue;
			}
			$result = isset( $row['result'] ) && is_array( $row['result'] ) ? $row['result'] : array();
			if ( empty( $result['ok'] ) ) {
				continue;
			}
			$tool = sanitize_key( (string) ( $row['tool'] ?? '' ) );
			if ( $tool === 'tasks_create_project' && ! empty( $result['project']['title'] ) ) {
				$project_title = trim( (string) $result['project']['title'] );
			}
			if ( $tool === 'tasks_create' && ! empty( $result['task']['title'] ) ) {
				$task_titles[] = trim( (string) $result['task']['title'] );
			}
			if ( $tool === 'tasks_create_batch' && ! empty( $result['created'] ) && is_array( $result['created'] ) ) {
				foreach ( $result['created'] as $task ) {
					if ( is_array( $task ) && ! empty( $task['title'] ) ) {
						$task_titles[] = trim( (string) $task['title'] );
					}
				}
			}
		}

		if ( $project_title !== '' ) {
			$parts[] = 'Created project "' . $project_title . '"';
		}
		if ( count( $task_titles ) === 1 ) {
			$parts[] = 'added task "' . $task_titles[0] . '"';
		} elseif ( count( $task_titles ) > 1 ) {
			$parts[] = 'added ' . count( $task_titles ) . ' tasks';
		}

		if ( count( $parts ) === 0 ) {
			return '';
		}
		return ucfirst( implode( ' and ', $parts ) ) . '.';
	}

	/**
	 * @param array<string,mixed>|null $table
	 * @return array<string,mixed>|null
	 */
	private static function patch_table_project_column( ?array $table, string $project_label ): ?array {
		if ( $project_label === '' || ! is_array( $table ) || ! isset( $table['rows'] ) || ! is_array( $table['rows'] ) ) {
			return $table;
		}
		foreach ( $table['rows'] as $r => $row ) {
			if ( is_array( $row ) && array_key_exists( 2, $row ) ) {
				$table['rows'][ $r ][2] = $project_label;
			}
		}
		return $table;
	}

}
