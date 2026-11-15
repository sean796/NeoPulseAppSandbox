<?php
/**
 * /api/teams/{id}/tasks/* route handlers.
 *
 * @package Neo_Pulse_App
 */

defined( 'ABSPATH' ) || exit;

class Neo_Pulse_App_Tasks_Route_Handlers {

	/**
	 * @param array<string,mixed> $team
	 * @param array<string,mixed> $member
	 * @param string              $sub    Route after tasks/.
	 * @param string              $method HTTP method.
	 * @param array<string,mixed> $body   JSON body.
	 * @param int                 $user_id
	 */
	public static function dispatch( array $team, array $member, string $sub, string $method, array $body, int $user_id ): void {
		Neo_Pulse_App_Tasks_Store::install_tables();
		Neo_Pulse_App_Task_Execution_Store::install_tables();
		$team_id = (int) $team['id'];
		$sub     = trim( $sub, '/' );
		$method  = strtoupper( $method );

		if ( ! Neo_Pulse_App_Tasks_Store::is_active_member( $member ) ) {
			Neo_Pulse_App_Api_Dispatcher::send_json( array( 'ok' => false, 'error' => 'Forbidden' ), 403 );
			return;
		}

		if ( $sub === 'tags' && $method === 'GET' ) {
			Neo_Pulse_App_Api_Dispatcher::send_json(
				array(
					'ok'   => true,
					'tags' => Neo_Pulse_App_Tasks_Store::list_tags( $team_id ),
				)
			);
			return;
		}

		if ( $sub === 'tags' && $method === 'POST' ) {
			$tags = isset( $body['tags'] ) && is_array( $body['tags'] ) ? $body['tags'] : array();
			$saved = Neo_Pulse_App_Tasks_Store::save_tags( $team_id, $tags );
			if ( ! $saved ) {
				Neo_Pulse_App_Api_Dispatcher::send_json( array( 'ok' => false, 'error' => 'Could not save tags' ), 500 );
				return;
			}
			Neo_Pulse_App_Api_Dispatcher::send_json(
				array(
					'ok'   => true,
					'tags' => Neo_Pulse_App_Tasks_Store::list_tags( $team_id ),
				)
			);
			return;
		}

		if ( $sub === 'my' && $method === 'GET' ) {
			Neo_Pulse_App_Api_Dispatcher::send_json(
				array(
					'ok'              => true,
					'tasks'           => Neo_Pulse_App_Tasks_Store::list_my_tasks( $team_id, $user_id ),
					'completedToday'  => Neo_Pulse_App_Tasks_Store::count_completed_today( $team_id ),
				)
			);
			return;
		}

		if ( $sub === 'pulse-assigned' && $method === 'GET' ) {
			Neo_Pulse_App_Api_Dispatcher::send_json(
				array(
					'ok'    => true,
					'tasks' => Neo_Pulse_App_Tasks_Store::list_pulse_assigned_tasks( $team_id ),
				)
			);
			return;
		}

		if ( $sub === 'calendar-automations' && $method === 'GET' ) {
			Neo_Pulse_App_Api_Dispatcher::send_json(
				array(
					'ok'    => true,
					'tasks' => Neo_Pulse_App_Tasks_Store::list_calendar_automation_tasks( $team_id ),
				)
			);
			return;
		}

		if ( $sub === 'search' && $method === 'GET' ) {
			$q = isset( $_GET['q'] ) ? sanitize_text_field( (string) wp_unslash( $_GET['q'] ) ) : '';
			Neo_Pulse_App_Api_Dispatcher::send_json(
				array(
					'ok'    => true,
					'tasks' => Neo_Pulse_App_Tasks_Store::search_tasks( $team_id, $q ),
				)
			);
			return;
		}

		if ( $sub === 'automation-blocks/triggers' && $method === 'GET' ) {
			Neo_Pulse_App_Api_Dispatcher::send_json(
				array(
					'ok'     => true,
					'blocks' => Neo_Pulse_App_Automation_Trigger_Registry::list_for_api(),
				)
			);
			return;
		}

		if ( $sub === 'automation-blocks/actions' && $method === 'GET' ) {
			Neo_Pulse_App_Api_Dispatcher::send_json(
				array(
					'ok'     => true,
					'blocks' => Neo_Pulse_App_Automation_Action_Registry::list_for_api(),
				)
			);
			return;
		}

		if ( $sub === 'automation-recipes' && $method === 'GET' ) {
			$query = array(
				'category'      => isset( $_GET['category'] ) ? sanitize_key( (string) wp_unslash( $_GET['category'] ) ) : '',
				'bucket'        => isset( $_GET['bucket'] ) ? sanitize_key( (string) wp_unslash( $_GET['bucket'] ) ) : '',
				'execution'     => isset( $_GET['execution'] ) ? sanitize_key( (string) wp_unslash( $_GET['execution'] ) ) : '',
				'signal'        => isset( $_GET['signal'] ) ? sanitize_key( (string) wp_unslash( $_GET['signal'] ) ) : '',
				'vertical'      => isset( $_GET['vertical'] ) ? sanitize_key( (string) wp_unslash( $_GET['vertical'] ) ) : '',
				'q'             => isset( $_GET['q'] ) ? sanitize_text_field( (string) wp_unslash( $_GET['q'] ) ) : '',
				'includeTasks'  => ! empty( $_GET['includeTasks'] ),
			);
			Neo_Pulse_App_Api_Dispatcher::send_json(
				array(
					'ok'      => true,
					'recipes' => Neo_Pulse_App_Automation_Recipe_Registry::list_for_api( $query ),
					'filters' => Neo_Pulse_App_Automation_Recipe_Registry::filter_options_for_api(),
				)
			);
			return;
		}

		if ( preg_match( '#^automation-recipes/([^/]+)$#', $sub, $m ) && $method === 'GET' ) {
			$keyword = sanitize_title( (string) ( $m[1] ?? '' ) );
			$recipe  = Neo_Pulse_App_Automation_Recipe_Registry::get_by_keyword( $keyword );
			if ( ! is_array( $recipe ) ) {
				Neo_Pulse_App_Api_Dispatcher::send_json( array( 'ok' => false, 'error' => 'Recipe not found' ), 404 );
				return;
			}
			Neo_Pulse_App_Api_Dispatcher::send_json(
				array(
					'ok'     => true,
					'recipe' => Neo_Pulse_App_Automation_Recipe_Registry::catalog_item_from_recipe( $recipe, true ),
				)
			);
			return;
		}

		if ( $sub === 'templates' && $method === 'GET' ) {
			Neo_Pulse_App_Api_Dispatcher::send_json(
				array(
					'ok'        => true,
					'templates' => Neo_Pulse_App_Tasks_Store::list_templates( $team_id ),
				)
			);
			return;
		}

		if ( $sub === 'templates' && $method === 'POST' ) {
			$templates = isset( $body['templates'] ) && is_array( $body['templates'] ) ? $body['templates'] : array();
			$saved     = Neo_Pulse_App_Tasks_Store::save_templates( $team_id, $templates );
			if ( ! $saved ) {
				Neo_Pulse_App_Api_Dispatcher::send_json( array( 'ok' => false, 'error' => 'Could not save templates' ), 500 );
				return;
			}
			Neo_Pulse_App_Api_Dispatcher::send_json(
				array(
					'ok'        => true,
					'templates' => Neo_Pulse_App_Tasks_Store::list_templates( $team_id ),
				)
			);
			return;
		}

		if ( $sub === 'templates/upsert' && $method === 'POST' ) {
			$template = isset( $body['template'] ) && is_array( $body['template'] ) ? $body['template'] : array();
			$saved    = Neo_Pulse_App_Tasks_Store::upsert_template( $team_id, $template );
			if ( ! $saved ) {
				Neo_Pulse_App_Api_Dispatcher::send_json( array( 'ok' => false, 'error' => 'Could not save template' ), 400 );
				return;
			}
			$keyword = sanitize_title( (string) ( $template['keyword'] ?? '' ) );
			Neo_Pulse_App_Api_Dispatcher::send_json(
				array(
					'ok'       => true,
					'template' => Neo_Pulse_App_Tasks_Store::get_template_by_keyword( $team_id, $keyword ),
					'templates' => Neo_Pulse_App_Tasks_Store::list_templates( $team_id ),
				)
			);
			return;
		}

		if ( preg_match( '#^templates/([^/]+)$#', $sub, $m ) && $method === 'DELETE' ) {
			$keyword = sanitize_title( rawurldecode( (string) $m[1] ) );
			$deleted = Neo_Pulse_App_Tasks_Store::delete_template( $team_id, $keyword );
			if ( ! $deleted ) {
				Neo_Pulse_App_Api_Dispatcher::send_json( array( 'ok' => false, 'error' => 'Template not found' ), 404 );
				return;
			}
			Neo_Pulse_App_Api_Dispatcher::send_json(
				array(
					'ok'        => true,
					'templates' => Neo_Pulse_App_Tasks_Store::list_templates( $team_id ),
				)
			);
			return;
		}

		if ( $sub === 'templates/from-project' && $method === 'POST' ) {
			$project_id = (int) ( $body['projectId'] ?? 0 );
			$name       = sanitize_text_field( (string) ( $body['name'] ?? '' ) );
			$keyword    = sanitize_title( (string) ( $body['keyword'] ?? $name ) );
			$template   = Neo_Pulse_App_Tasks_Store::project_tasks_as_template( $team_id, $project_id, $name, $keyword );
			if ( ! $template ) {
				Neo_Pulse_App_Api_Dispatcher::send_json( array( 'ok' => false, 'error' => 'Could not save template from project' ), 400 );
				return;
			}
			Neo_Pulse_App_Api_Dispatcher::send_json(
				array(
					'ok'        => true,
					'template'  => $template,
					'templates' => Neo_Pulse_App_Tasks_Store::list_templates( $team_id ),
				)
			);
			return;
		}

		if ( $sub === 'projects' && $method === 'GET' ) {
			$include_archived = ! empty( $_GET['archived'] );
			Neo_Pulse_App_Api_Dispatcher::send_json(
				array(
					'ok'       => true,
					'projects' => Neo_Pulse_App_Tasks_Store::list_projects( $team_id, $include_archived, $user_id ),
				)
			);
			return;
		}

		if ( $sub === 'projects' && $method === 'POST' ) {
			$project = Neo_Pulse_App_Tasks_Store::create_project( $team_id, $user_id, $body );
			if ( ! $project ) {
				Neo_Pulse_App_Api_Dispatcher::send_json( array( 'ok' => false, 'error' => 'Could not create project' ), 400 );
				return;
			}
			Neo_Pulse_App_Api_Dispatcher::send_json( array( 'ok' => true, 'project' => $project ) );
			return;
		}

		if ( preg_match( '#^projects/(\d+)$#', $sub, $m ) ) {
			self::dispatch_project( $team_id, (int) $m[1], $method, $body );
			return;
		}

		if ( preg_match( '#^projects/(\d+)/sections$#', $sub, $m ) ) {
			$project_id = (int) $m[1];
			if ( $method === 'GET' ) {
				Neo_Pulse_App_Api_Dispatcher::send_json(
					array(
						'ok'       => true,
						'sections' => Neo_Pulse_App_Tasks_Store::list_sections( $team_id, $project_id ),
					)
				);
				return;
			}
			if ( $method === 'POST' ) {
				$section = Neo_Pulse_App_Tasks_Store::create_section( $team_id, $project_id, $body );
				if ( ! $section ) {
					Neo_Pulse_App_Api_Dispatcher::send_json( array( 'ok' => false, 'error' => 'Could not create section' ), 400 );
					return;
				}
				Neo_Pulse_App_Api_Dispatcher::send_json( array( 'ok' => true, 'section' => $section ) );
				return;
			}
		}

		if ( preg_match( '#^projects/(\d+)/sections/(\d+)$#', $sub, $m ) ) {
			$section_id = (int) $m[2];
			if ( $method === 'PATCH' ) {
				$section = Neo_Pulse_App_Tasks_Store::update_section( $team_id, $section_id, $body );
				if ( ! $section ) {
					Neo_Pulse_App_Api_Dispatcher::send_json( array( 'ok' => false, 'error' => 'Not found' ), 404 );
					return;
				}
				Neo_Pulse_App_Api_Dispatcher::send_json( array( 'ok' => true, 'section' => $section ) );
				return;
			}
			if ( $method === 'DELETE' ) {
				$ok = Neo_Pulse_App_Tasks_Store::delete_section( $team_id, $section_id );
				if ( ! $ok ) {
					Neo_Pulse_App_Api_Dispatcher::send_json( array( 'ok' => false, 'error' => 'Not found' ), 404 );
					return;
				}
				Neo_Pulse_App_Api_Dispatcher::send_json( array( 'ok' => true ) );
				return;
			}
		}

		if ( preg_match( '#^projects/(\d+)/files$#', $sub, $m ) && $method === 'GET' ) {
			$project_id = (int) $m[1];
			Neo_Pulse_App_Api_Dispatcher::send_json(
				array(
					'ok'    => true,
					'files' => Neo_Pulse_App_Tasks_Store::list_project_files( $team_id, $project_id ),
				)
			);
			return;
		}

		if ( preg_match( '#^projects/(\d+)/tasks$#', $sub, $m ) ) {
			$project_id = (int) $m[1];
			if ( $method === 'GET' ) {
				Neo_Pulse_App_Api_Dispatcher::send_json(
					array(
						'ok'    => true,
						'tasks' => Neo_Pulse_App_Tasks_Store::list_tasks( $team_id, $project_id ),
					)
				);
				return;
			}
			if ( $method === 'POST' ) {
				$task = Neo_Pulse_App_Tasks_Store::create_task( $team_id, $project_id, $user_id, $body );
				if ( ! $task ) {
					Neo_Pulse_App_Api_Dispatcher::send_json( array( 'ok' => false, 'error' => 'Could not create task' ), 400 );
					return;
				}
				Neo_Pulse_App_Api_Dispatcher::send_json( array( 'ok' => true, 'task' => $task ) );
				return;
			}
		}

		if ( preg_match( '#^tasks/(\d+)$#', $sub, $m ) ) {
			self::dispatch_task( $team_id, (int) $m[1], $method, $body, $user_id );
			return;
		}

		if ( preg_match( '#^tasks/(\d+)/subtasks$#', $sub, $m ) ) {
			$task_id = (int) $m[1];
			if ( $method === 'GET' ) {
				Neo_Pulse_App_Api_Dispatcher::send_json(
					array(
						'ok'       => true,
						'subtasks' => Neo_Pulse_App_Tasks_Store::list_subtasks( $team_id, $task_id ),
					)
				);
				return;
			}
			if ( $method === 'POST' ) {
				$parent = Neo_Pulse_App_Tasks_Store::get_task( $team_id, $task_id );
				if ( ! $parent ) {
					Neo_Pulse_App_Api_Dispatcher::send_json( array( 'ok' => false, 'error' => 'Not found' ), 404 );
					return;
				}
				$task = Neo_Pulse_App_Tasks_Store::create_task(
					$team_id,
					(int) $parent['projectId'],
					$user_id,
					array_merge( $body, array( 'parentTaskId' => $task_id ) )
				);
				if ( ! $task ) {
					Neo_Pulse_App_Api_Dispatcher::send_json( array( 'ok' => false, 'error' => 'Could not create subtask' ), 400 );
					return;
				}
				Neo_Pulse_App_Api_Dispatcher::send_json( array( 'ok' => true, 'task' => $task ) );
				return;
			}
		}

		if ( preg_match( '#^tasks/(\d+)/notes$#', $sub, $m ) ) {
			$task_id = (int) $m[1];
			if ( $method === 'GET' ) {
				Neo_Pulse_App_Api_Dispatcher::send_json(
					array(
						'ok'    => true,
						'notes' => Neo_Pulse_App_Tasks_Store::list_notes( $team_id, $task_id ),
					)
				);
				return;
			}
			if ( $method === 'POST' ) {
				$note = Neo_Pulse_App_Tasks_Store::add_note( $team_id, $task_id, $user_id, $body );
				if ( ! $note ) {
					Neo_Pulse_App_Api_Dispatcher::send_json( array( 'ok' => false, 'error' => 'Could not add note' ), 400 );
					return;
				}
				Neo_Pulse_App_Api_Dispatcher::send_json( array( 'ok' => true, 'note' => $note ) );
				return;
			}
		}

		if ( preg_match( '#^tasks/(\d+)/files$#', $sub, $m ) && $method === 'POST' ) {
			$task_id = (int) $m[1];
			self::upload_file( $team_id, $task_id, $user_id, $body );
			return;
		}

		if ( $sub === 'trigger-pending' && $method === 'GET' ) {
			Neo_Pulse_App_Api_Dispatcher::send_json(
				array(
					'ok'      => true,
					'pending' => Neo_Pulse_App_Task_Trigger_Pending_Store::list( $team_id ),
				)
			);
			return;
		}

		if ( preg_match( '#^trigger-pending/(\d+)/ack$#', $sub, $m ) && $method === 'POST' ) {
			$task_id = (int) $m[1];
			Neo_Pulse_App_Task_Trigger_Pending_Store::dequeue( $team_id, $task_id );
			Neo_Pulse_App_Api_Dispatcher::send_json( array( 'ok' => true ) );
			return;
		}

		if ( preg_match( '#^tasks/(\d+)/trigger/evaluate$#', $sub, $m ) && $method === 'POST' ) {
			$task_id = (int) $m[1];
			$task    = Neo_Pulse_App_Tasks_Store::get_task( $team_id, $task_id );
			if ( ! $task ) {
				Neo_Pulse_App_Api_Dispatcher::send_json( array( 'ok' => false, 'error' => 'Task not found.' ), 404 );
				return;
			}
			$result = Neo_Pulse_App_Task_Trigger_Evaluator::evaluate_task(
				$team_id,
				$task,
				array( 'simulate' => ! empty( $body['simulate'] ) )
			);
			Neo_Pulse_App_Api_Dispatcher::send_json( $result, ! empty( $result['ok'] ) ? 200 : 400 );
			return;
		}

		if ( preg_match( '#^tasks/(\d+)/trigger/test-fire$#', $sub, $m ) && $method === 'POST' ) {
			$task_id = (int) $m[1];
			$task    = Neo_Pulse_App_Tasks_Store::get_task( $team_id, $task_id );
			if ( ! $task ) {
				Neo_Pulse_App_Api_Dispatcher::send_json( array( 'ok' => false, 'error' => 'Task not found.' ), 404 );
				return;
			}
			if ( ! Neo_Pulse_App_Tasks_Store::task_has_pulse_assignee( $task ) ) {
				Neo_Pulse_App_Api_Dispatcher::send_json( array( 'ok' => false, 'error' => 'Task must be assigned to Pulse AI.' ), 400 );
				return;
			}
			$result = Neo_Pulse_App_Task_Trigger_Evaluator::test_fire( $team_id, $task );
			Neo_Pulse_App_Api_Dispatcher::send_json( $result, ! empty( $result['ok'] ) ? 200 : 400 );
			return;
		}

		if ( preg_match( '#^tasks/(\d+)/execute$#', $sub, $m ) && $method === 'POST' ) {
			$task_id = (int) $m[1];
			$result  = Neo_Pulse_App_Task_Execution_Coordinator::start( $team_id, $task_id, $user_id, $body );
			$code    = ! empty( $result['ok'] ) ? 200 : 400;
			if ( ! empty( $result['error'] ) && empty( $result['execution'] ) ) {
				$code = 400;
			}
			Neo_Pulse_App_Api_Dispatcher::send_json( $result, $code );
			return;
		}

		if ( preg_match( '#^tasks/(\d+)/executions$#', $sub, $m ) && $method === 'GET' ) {
			$task_id = (int) $m[1];
			Neo_Pulse_App_Api_Dispatcher::send_json(
				Neo_Pulse_App_Task_Execution_Coordinator::list_for_task( $team_id, $task_id )
			);
			return;
		}

		if ( preg_match( '#^executions/(\d+)$#', $sub, $m ) && $method === 'GET' ) {
			$execution_id = (int) $m[1];
			$result       = Neo_Pulse_App_Task_Execution_Coordinator::get( $team_id, $execution_id );
			Neo_Pulse_App_Api_Dispatcher::send_json( $result, ! empty( $result['ok'] ) ? 200 : 404 );
			return;
		}

		if ( preg_match( '#^executions/(\d+)/progress$#', $sub, $m ) && $method === 'PATCH' ) {
			$execution_id = (int) $m[1];
			$result       = Neo_Pulse_App_Task_Execution_Coordinator::patch_progress( $team_id, $execution_id, $body );
			Neo_Pulse_App_Api_Dispatcher::send_json( $result, ! empty( $result['ok'] ) ? 200 : 400 );
			return;
		}

		if ( preg_match( '#^executions/(\d+)/complete$#', $sub, $m ) && $method === 'POST' ) {
			$execution_id = (int) $m[1];
			$result       = Neo_Pulse_App_Task_Execution_Coordinator::complete( $team_id, $execution_id, $body );
			Neo_Pulse_App_Api_Dispatcher::send_json( $result, ! empty( $result['ok'] ) ? 200 : 400 );
			return;
		}

		if ( preg_match( '#^executions/(\d+)/cancel$#', $sub, $m ) && $method === 'POST' ) {
			$execution_id = (int) $m[1];
			$result       = Neo_Pulse_App_Task_Execution_Coordinator::cancel( $team_id, $execution_id );
			Neo_Pulse_App_Api_Dispatcher::send_json( $result, ! empty( $result['ok'] ) ? 200 : 400 );
			return;
		}

		if ( preg_match( '#^executions/(\d+)/reopen$#', $sub, $m ) && $method === 'POST' ) {
			$execution_id = (int) $m[1];
			$result       = Neo_Pulse_App_Task_Execution_Coordinator::reopen_for_resume( $team_id, $execution_id );
			Neo_Pulse_App_Api_Dispatcher::send_json( $result, ! empty( $result['ok'] ) ? 200 : 400 );
			return;
		}

		if ( preg_match( '#^tasks/(\d+)/files/(\d+)$#', $sub, $m ) ) {
			$task_id  = (int) $m[1];
			$asset_id = (int) $m[2];
			if ( $method === 'GET' ) {
				$inline = isset( $_GET['inline'] ) && (string) wp_unslash( $_GET['inline'] ) === '1';
				Neo_Pulse_App_Tasks_Assets::serve( $team_id, $task_id, $asset_id, $inline );
				return;
			}
			if ( $method === 'DELETE' ) {
				$ok = Neo_Pulse_App_Tasks_Assets::delete( $team_id, $task_id, $asset_id );
				if ( ! $ok ) {
					Neo_Pulse_App_Api_Dispatcher::send_json( array( 'ok' => false, 'error' => 'Not found' ), 404 );
					return;
				}
				Neo_Pulse_App_Api_Dispatcher::send_json( array( 'ok' => true ) );
				return;
			}
		}

		Neo_Pulse_App_Api_Dispatcher::send_json( array( 'ok' => false, 'error' => 'Not found' ), 404 );
	}

	/**
	 * @param array<string,mixed> $body
	 */
	private static function dispatch_project( int $team_id, int $project_id, string $method, array $body ): void {
		if ( $method === 'GET' ) {
			$project = Neo_Pulse_App_Tasks_Store::get_project( $team_id, $project_id );
			if ( ! $project ) {
				Neo_Pulse_App_Api_Dispatcher::send_json( array( 'ok' => false, 'error' => 'Not found' ), 404 );
				return;
			}
			Neo_Pulse_App_Api_Dispatcher::send_json( array( 'ok' => true, 'project' => $project ) );
			return;
		}

		if ( $method === 'PATCH' ) {
			$project = Neo_Pulse_App_Tasks_Store::update_project( $team_id, $project_id, $body );
			if ( ! $project ) {
				Neo_Pulse_App_Api_Dispatcher::send_json( array( 'ok' => false, 'error' => 'Not found' ), 404 );
				return;
			}
			Neo_Pulse_App_Api_Dispatcher::send_json( array( 'ok' => true, 'project' => $project ) );
			return;
		}

		if ( $method === 'DELETE' ) {
			$ok = Neo_Pulse_App_Tasks_Store::archive_project( $team_id, $project_id );
			if ( ! $ok ) {
				Neo_Pulse_App_Api_Dispatcher::send_json( array( 'ok' => false, 'error' => 'Not found' ), 404 );
				return;
			}
			Neo_Pulse_App_Api_Dispatcher::send_json( array( 'ok' => true ) );
			return;
		}

		Neo_Pulse_App_Api_Dispatcher::send_json( array( 'ok' => false, 'error' => 'Method not allowed' ), 405 );
	}

	/**
	 * @param array<string,mixed> $body
	 */
	private static function dispatch_task( int $team_id, int $task_id, string $method, array $body, int $user_id ): void {
		if ( $method === 'GET' ) {
			$task = Neo_Pulse_App_Tasks_Store::get_task( $team_id, $task_id );
			if ( ! $task ) {
				Neo_Pulse_App_Api_Dispatcher::send_json( array( 'ok' => false, 'error' => 'Not found' ), 404 );
				return;
			}
			Neo_Pulse_App_Api_Dispatcher::send_json(
				array(
					'ok'       => true,
					'task'     => $task,
					'notes'    => Neo_Pulse_App_Tasks_Store::list_notes( $team_id, $task_id ),
					'files'    => Neo_Pulse_App_Tasks_Assets::list_for_task( $team_id, $task_id ),
					'subtasks' => Neo_Pulse_App_Tasks_Store::list_subtasks( $team_id, $task_id ),
				)
			);
			return;
		}

		if ( $method === 'PATCH' ) {
			$task = Neo_Pulse_App_Tasks_Store::update_task( $team_id, $task_id, $body, $user_id );
			if ( ! $task ) {
				Neo_Pulse_App_Api_Dispatcher::send_json( array( 'ok' => false, 'error' => 'Not found' ), 404 );
				return;
			}
			Neo_Pulse_App_Api_Dispatcher::send_json( array( 'ok' => true, 'task' => $task ) );
			return;
		}

		if ( $method === 'DELETE' ) {
			$ok = Neo_Pulse_App_Tasks_Store::delete_task( $team_id, $task_id );
			if ( ! $ok ) {
				Neo_Pulse_App_Api_Dispatcher::send_json( array( 'ok' => false, 'error' => 'Not found' ), 404 );
				return;
			}
			Neo_Pulse_App_Api_Dispatcher::send_json( array( 'ok' => true ) );
			return;
		}

		Neo_Pulse_App_Api_Dispatcher::send_json( array( 'ok' => false, 'error' => 'Method not allowed' ), 405 );
	}

	/**
	 * @param array<string,mixed> $body
	 */
	private static function upload_file( int $team_id, int $task_id, int $user_id, array $body ): void {
		$file_name   = isset( $body['fileName'] ) ? (string) $body['fileName'] : '';
		$mime        = isset( $body['mime'] ) ? (string) $body['mime'] : '';
		$data_base64 = isset( $body['dataBase64'] ) ? (string) $body['dataBase64'] : '';
		if ( $file_name === '' || $data_base64 === '' ) {
			Neo_Pulse_App_Api_Dispatcher::send_json( array( 'ok' => false, 'error' => 'fileName and dataBase64 required' ), 400 );
			return;
		}

		$binary = base64_decode( $data_base64, true );
		if ( ! is_string( $binary ) ) {
			Neo_Pulse_App_Api_Dispatcher::send_json( array( 'ok' => false, 'error' => 'Invalid base64' ), 400 );
			return;
		}

		$file = Neo_Pulse_App_Tasks_Assets::upload( $team_id, $task_id, $user_id, $file_name, $mime, $binary );
		if ( ! $file ) {
			Neo_Pulse_App_Api_Dispatcher::send_json( array( 'ok' => false, 'error' => 'Upload failed' ), 400 );
			return;
		}
		Neo_Pulse_App_Api_Dispatcher::send_json( array( 'ok' => true, 'file' => $file ) );
	}
}
