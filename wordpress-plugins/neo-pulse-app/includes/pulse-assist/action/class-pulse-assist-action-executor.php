<?php
/**
 * Executes Pulse Assist action tool calls (Build mode writes).
 *
 * @package Neo_Pulse_App
 */

defined( 'ABSPATH' ) || exit;

class Neo_Pulse_App_Pulse_Assist_Action_Executor {

	/**
	 * @param array<int,array<string,mixed>> $tool_calls
	 * @param callable|null                  $emit
	 * @return array<string,mixed>
	 */
	public static function execute_plan( array $tool_calls, array $body, int $user_id, string $submode, ?callable $emit = null ): array {
		Neo_Pulse_App_Pulse_Assist_Action_Registry::register_defaults();

		$results            = array();
		$created_ids          = array();
		$created_project_ids  = array();
		$created_workflow_ids = array();
		$project_id           = 0;
		$errors               = array();

		$active_project_id = 0;

		foreach ( $tool_calls as $i => $call ) {
			if ( ! is_array( $call ) ) {
				continue;
			}
			$tool_id = sanitize_key( (string) ( $call['tool'] ?? '' ) );
			$args    = isset( $call['args'] ) && is_array( $call['args'] ) ? $call['args'] : array();
			$call_id = $tool_id !== '' ? $tool_id . '_' . ( $i + 1 ) : 'tool_' . ( $i + 1 );

			if ( $active_project_id > 0 && in_array( $tool_id, array( 'tasks_create', 'tasks_create_batch' ), true ) ) {
				if ( (int) ( $args['projectId'] ?? 0 ) <= 0 ) {
					$args['projectId'] = $active_project_id;
				}
			}

			if ( $tool_id === '' ) {
				$errors[] = 'Missing tool id at index ' . $i;
				continue;
			}
			if ( ! Neo_Pulse_App_Pulse_Assist_Action_Registry::allowed_for_submode( $tool_id, $submode ) ) {
				$errors[] = "Tool {$tool_id} is not allowed in {$submode} mode.";
				continue;
			}

			if ( is_callable( $emit ) ) {
				$emit(
					array(
						'status' => 'tool',
						'id'     => $call_id,
						'tool'   => $tool_id,
						'state'  => 'running',
					)
				);
			}

			$result = self::run_tool( $tool_id, $args, $body, $user_id );
			$ok     = ! empty( $result['ok'] );
			$results[] = array(
				'tool'   => $tool_id,
				'args'   => $args,
				'result' => $result,
			);

			if ( $ok && ! empty( $result['createdTaskIds'] ) && is_array( $result['createdTaskIds'] ) ) {
				foreach ( $result['createdTaskIds'] as $tid ) {
					$created_ids[] = (int) $tid;
				}
			}
			if ( $ok && ! empty( $result['task']['id'] ) ) {
				$created_ids[] = (int) $result['task']['id'];
			}
			if ( $ok && ! empty( $result['project']['id'] ) ) {
				$created_project_ids[] = (int) $result['project']['id'];
				$project_id            = (int) $result['project']['id'];
				$active_project_id     = (int) $result['project']['id'];
			}
			if ( $ok && ! empty( $result['projectId'] ) ) {
				$project_id = (int) $result['projectId'];
			}
			if ( $ok && ! empty( $result['workflowId'] ) ) {
				$created_workflow_ids[] = (int) $result['workflowId'];
			}
			if ( $ok && ! empty( $result['workflow']['id'] ) ) {
				$created_workflow_ids[] = (int) $result['workflow']['id'];
			}
			if ( ! $ok ) {
				$errors[] = (string) ( $result['error'] ?? "Tool {$tool_id} failed." );
			}

			if ( is_callable( $emit ) ) {
				$emit(
					array(
						'status' => 'tool',
						'id'     => $call_id,
						'tool'   => $tool_id,
						'state'  => $ok ? 'done' : 'error',
					)
				);
			}
		}

		return array(
			'ok'                 => count( $errors ) === 0 && count( $results ) > 0,
			'results'            => $results,
			'createdTaskIds'     => array_values( array_unique( array_filter( $created_ids ) ) ),
			'createdProjectIds'  => array_values( array_unique( array_filter( $created_project_ids ) ) ),
			'createdWorkflowIds' => array_values( array_unique( array_filter( $created_workflow_ids ) ) ),
			'projectId'          => $project_id,
			'errors'             => $errors,
		);
	}

	/**
	 * @param array<string,mixed> $args
	 * @param array<string,mixed> $body
	 * @return array<string,mixed>
	 */
	private static function run_tool( string $tool_id, array $args, array $body, int $user_id ): array {
		if ( Neo_Pulse_App_Pulse_Assist_Action_Tools_Recipes::is_recipe_tool( $tool_id ) ) {
			return Neo_Pulse_App_Pulse_Assist_Action_Tools_Recipes::run( $tool_id, $args, $body, $user_id );
		}
		if ( Neo_Pulse_App_Pulse_Assist_Action_Tools_Executions::is_execution_tool( $tool_id ) ) {
			return Neo_Pulse_App_Pulse_Assist_Action_Tools_Executions::run( $tool_id, $args, $body, $user_id );
		}
		return Neo_Pulse_App_Pulse_Assist_Action_Tools_Tasks::run( $tool_id, $args, $body, $user_id );
	}

	/**
	 * @param array<int,string> $tool_ids
	 * @return array<string,mixed>
	 */
	public static function fetch_read_tools( array $tool_ids, array $body, int $user_id ): array {
		$payload = array();
		foreach ( $tool_ids as $tool_id ) {
			$tool_id = sanitize_key( $tool_id );
			if ( $tool_id === '' || Neo_Pulse_App_Pulse_Assist_Action_Registry::is_write_tool( $tool_id ) ) {
				continue;
			}
			$payload[ $tool_id ] = self::run_tool( $tool_id, array(), $body, $user_id );
		}
		return $payload;
	}
}
