<?php
/**
 * Semrush safe-fix runner: one agent run per client → Neo MCP → rescan → email.
 *
 * @package Neo_Pulse_App
 */

defined( 'ABSPATH' ) || exit;

class Neo_Pulse_App_Semrush_Safe_Fix_Runner {

	const RECIPE_KEY = 'semrush_safe_fix';

	/**
	 * Morning cron entry: once per day when due and library enabled.
	 *
	 * @return array<string,mixed>
	 */
	public static function run_scheduled(): array {
		$schedule = Neo_Pulse_App_Semrush_Safe_Fix_Schedule::load();
		if ( ! Neo_Pulse_App_Semrush_Safe_Fix_Schedule::is_due_now( $schedule ) ) {
			return array( 'ok' => true, 'skipped' => true, 'reason' => 'not_due' );
		}
		if ( ! Neo_Pulse_App_Semrush_Safe_Fix_Schedule::is_library_enabled() ) {
			$schedule['lastRunKey']   = Neo_Pulse_App_Semrush_Safe_Fix_Schedule::run_key();
			$schedule['lastRunAt']    = gmdate( 'c' );
			$schedule['lastRunOk']    = true;
			$schedule['lastRunError'] = 'library_disabled';
			Neo_Pulse_App_Semrush_Safe_Fix_Schedule::save( $schedule );
			return array( 'ok' => true, 'skipped' => true, 'reason' => 'library_disabled' );
		}

		try {
			$result = self::run( array( 'source' => 'scheduled' ) );
			$schedule['lastRunKey']   = Neo_Pulse_App_Semrush_Safe_Fix_Schedule::run_key();
			$schedule['lastRunAt']    = gmdate( 'c' );
			$schedule['lastRunOk']    = ! empty( $result['ok'] );
			$schedule['lastRunError'] = empty( $result['ok'] ) ? substr( (string) ( $result['error'] ?? 'failed' ), 0, 500 ) : '';
			Neo_Pulse_App_Semrush_Safe_Fix_Schedule::save( $schedule );
			return $result;
		} catch ( Throwable $e ) {
			$schedule['lastRunKey']   = Neo_Pulse_App_Semrush_Safe_Fix_Schedule::run_key();
			$schedule['lastRunAt']    = gmdate( 'c' );
			$schedule['lastRunOk']    = false;
			$schedule['lastRunError'] = substr( $e->getMessage(), 0, 500 );
			Neo_Pulse_App_Semrush_Safe_Fix_Schedule::save( $schedule );
			return array( 'ok' => false, 'error' => $e->getMessage() );
		}
	}

	/**
	 * Create the agent run / Task Manager row only. Used so Run returns before Semrush work.
	 *
	 * @param array{source?:string,siteId?:string,teamId?:int,userId?:int,site?:array<string,mixed>} $opts
	 * @return array<string,mixed>
	 */
	public static function start( array $opts = array() ): array {
		$resolved = self::resolve_run_context( $opts );
		if ( empty( $resolved['ok'] ) ) {
			return $resolved;
		}
		$site = $resolved['site'];
		$run  = self::create_site_run(
			$site,
			array(
				'source' => (string) $resolved['source'],
				'teamId' => (int) $resolved['teamId'],
				'userId' => (int) $resolved['userId'],
			)
		);
		if ( empty( $run['ok'] ) || empty( $run['runId'] ) ) {
			return $run;
		}
		Neo_Pulse_App_Agent_Runs_Store::patch_run(
			(int) $resolved['teamId'],
			(int) $run['runId'],
			array(
				'plan' => array(
					'executionMode' => 'server',
					'safeFixSource' => (string) $resolved['source'],
					'safeFix'       => array(
						'source' => (string) $resolved['source'],
						'teamId' => (int) $resolved['teamId'],
						'userId' => (int) $resolved['userId'],
						'siteId' => (string) ( $site['id'] ?? '' ),
						'to'     => (string) $resolved['to'],
						'site'   => $site,
					),
				),
			)
		);
		return array(
			'ok'     => true,
			'runId'  => (int) $run['runId'],
			'source' => (string) $resolved['source'],
			'teamId' => (int) $resolved['teamId'],
			'userId' => (int) $resolved['userId'],
			'siteId' => (string) ( $site['id'] ?? '' ),
			'site'   => $site,
			'to'     => (string) $resolved['to'],
		);
	}

	/**
	 * Finish a run that was already created by start().
	 *
	 * @param array<string,mixed> $started Output of start().
	 * @return array<string,mixed>
	 */
	public static function resume( array $run ): void {
		$status = (string) ( $run['status'] ?? '' );
		if ( ! in_array( $status, array( 'queued', 'running' ), true ) ) {
			return;
		}
		$fresh = Neo_Pulse_App_Agent_Runs_Store::get_run( (int) ( $run['teamId'] ?? 0 ), (int) ( $run['id'] ?? 0 ), false );
		if ( is_array( $fresh ) ) {
			$run = $fresh;
		}
		if ( (string) ( $run['status'] ?? '' ) === 'cancelled' ) {
			return;
		}
		$plan  = isset( $run['plan'] ) && is_array( $run['plan'] ) ? $run['plan'] : array();
		$saved = isset( $plan['safeFix'] ) && is_array( $plan['safeFix'] ) ? $plan['safeFix'] : array();
		$site  = isset( $saved['site'] ) && is_array( $saved['site'] ) ? $saved['site'] : array();
		if ( empty( $site['siteUrl'] ) ) {
			return;
		}
		self::finish(
			array(
				'runId'  => (int) ( $run['id'] ?? 0 ),
				'teamId' => (int) ( $saved['teamId'] ?? $run['teamId'] ?? 0 ),
				'userId' => (int) ( $saved['userId'] ?? 0 ),
				'source' => (string) ( $saved['source'] ?? 'pulse_assist' ),
				'siteId' => (string) ( $saved['siteId'] ?? $site['id'] ?? '' ),
				'to'     => (string) ( $saved['to'] ?? Neo_Pulse_App_Semrush_Safe_Fix_Schedule::DEFAULT_TO ),
				'site'   => $site,
			)
		);
	}

	public static function finish( array $started ): array {
		$run_id  = (int) ( $started['runId'] ?? 0 );
		$team_id = (int) ( $started['teamId'] ?? 0 );
		$user_id = (int) ( $started['userId'] ?? 0 );
		$source  = sanitize_key( (string) ( $started['source'] ?? 'pulse_assist' ) );
		$site_id = trim( (string) ( $started['siteId'] ?? '' ) );
		$to      = (string) ( $started['to'] ?? Neo_Pulse_App_Semrush_Safe_Fix_Schedule::DEFAULT_TO );
		$site    = isset( $started['site'] ) && is_array( $started['site'] ) ? $started['site'] : array();
		if ( $run_id <= 0 || $team_id <= 0 || empty( $site ) ) {
			return array( 'ok' => false, 'error' => 'Missing started run context' );
		}
		$lock = 'neo_pulse_safe_fix_finish_' . $run_id;
		if ( get_transient( $lock ) ) {
			return array( 'ok' => true, 'runId' => $run_id, 'busy' => true );
		}
		set_transient( $lock, '1', 600 );
		if ( function_exists( 'ignore_user_abort' ) ) {
			ignore_user_abort( true );
		}
		@set_time_limit( 600 );

		try {
			$one = self::run_one_site(
				$site,
				array(
					'source' => $source,
					'teamId' => $team_id,
					'userId' => $user_id,
					'runId'  => $run_id,
				)
			);
			if ( self::is_cancelled( $team_id, $run_id ) ) {
				return array( 'ok' => true, 'runId' => $run_id, 'cancelled' => true );
			}
			return self::finalize_runs(
				$team_id,
				$to,
				$site_id,
				array( $run_id ),
				(array) ( $one['fixed'] ?? array() ),
				(array) ( $one['failed'] ?? array() ),
				(array) ( $one['listed'] ?? array() ),
				(int) ( $one['skipped'] ?? 0 ),
				isset( $one['checklist'] ) && is_array( $one['checklist'] ) ? $one['checklist'] : array()
			);
		} finally {
			delete_transient( $lock );
		}
	}

	/**
	 * Warm one Task Manager / Running Agents row per client site (sync; used by cron).
	 *
	 * @param array{source?:string,siteId?:string,teamId?:int,userId?:int,site?:array<string,mixed>} $opts
	 * @return array<string,mixed>
	 */
	public static function run( array $opts = array() ): array {
		$resolved = self::resolve_run_context( $opts );
		if ( empty( $resolved['ok'] ) ) {
			return $resolved;
		}
		$source  = (string) $resolved['source'];
		$site_id = (string) $resolved['siteId'];
		$team_id = (int) $resolved['teamId'];
		$user_id = (int) $resolved['userId'];
		$to      = (string) $resolved['to'];
		$sites   = $resolved['sites'];

		$fixed     = array();
		$failed    = array();
		$listed    = array();
		$skipped   = 0;
		$run_ids   = array();
		$checklist = array();

		foreach ( $sites as $site ) {
			$one = self::run_one_site(
				$site,
				array(
					'source' => $source,
					'teamId' => $team_id,
					'userId' => $user_id,
				)
			);
			$skipped += (int) ( $one['skipped'] ?? 0 );
			foreach ( (array) ( $one['fixed'] ?? array() ) as $row ) {
				$fixed[] = $row;
			}
			foreach ( (array) ( $one['failed'] ?? array() ) as $row ) {
				$failed[] = $row;
			}
			foreach ( (array) ( $one['listed'] ?? array() ) as $row ) {
				$listed[] = $row;
			}
			if ( ! empty( $one['runId'] ) ) {
				$run_ids[] = (int) $one['runId'];
			}
			if ( empty( $checklist ) && isset( $one['checklist'] ) && is_array( $one['checklist'] ) ) {
				$checklist = $one['checklist'];
			}
		}

		return self::finalize_runs( $team_id, $to, $site_id, $run_ids, $fixed, $failed, $listed, $skipped, $checklist );
	}

	/**
	 * @param array{source?:string,siteId?:string,teamId?:int,userId?:int,site?:array<string,mixed>} $opts
	 * @return array<string,mixed>
	 */
	private static function resolve_run_context( array $opts ): array {
		$source  = sanitize_key( (string) ( $opts['source'] ?? 'pulse_assist' ) );
		$site_id = trim( (string) ( $opts['siteId'] ?? '' ) );
		$team_id = (int) ( $opts['teamId'] ?? 0 );
		$user_id = (int) ( $opts['userId'] ?? 0 );
		$schedule = Neo_Pulse_App_Semrush_Safe_Fix_Schedule::load();
		$to       = (string) ( $schedule['to'] ?? Neo_Pulse_App_Semrush_Safe_Fix_Schedule::DEFAULT_TO );

		if ( $team_id <= 0 ) {
			$ids     = Neo_Pulse_App_Teams_Store::list_all_team_ids();
			$team_id = isset( $ids[0] ) ? (int) $ids[0] : 0;
		}
		if ( $user_id <= 0 ) {
			$user_id = Neo_Pulse_App_Tasks_Store::pulse_bot_user_id();
		}
		if ( $team_id <= 0 || $user_id <= 0 ) {
			return array( 'ok' => false, 'error' => 'No team or pulse user for agent run log' );
		}

		$posted = isset( $opts['site'] ) && is_array( $opts['site'] ) ? $opts['site'] : null;
		$sites  = ( is_array( $posted ) && trim( (string) ( $posted['siteUrl'] ?? '' ) ) !== '' )
			? array( $posted )
			: self::sites_for_run( $site_id );
		if ( count( $sites ) === 0 ) {
			return array( 'ok' => false, 'error' => 'No site for Semrush safe fix' );
		}

		return array(
			'ok'     => true,
			'source' => $source,
			'siteId' => $site_id !== '' ? $site_id : (string) ( $sites[0]['id'] ?? '' ),
			'teamId' => $team_id,
			'userId' => $user_id,
			'to'     => $to,
			'sites'  => $sites,
			'site'   => $sites[0],
		);
	}

	/**
	 * @param array<int,int>                 $run_ids
	 * @param array<int,array<string,mixed>> $fixed
	 * @param array<int,array<string,mixed>> $failed
	 * @param array<int,array<string,mixed>> $listed Errors found but not auto-fixed.
	 * @return array<string,mixed>
	 */
	private static function finalize_runs( int $team_id, string $to, string $site_id, array $run_ids, array $fixed, array $failed, array $listed, int $skipped, array $checklist = array() ): array {
		$email  = array( 'ok' => false, 'error' => 'No Neo MCP handshake confirmation to email' );
		$status = 'failed';
		$error  = 'Waiting for Neo MCP to confirm a fix before email';
		$report = array_merge( $fixed, $listed );
		$handshake_ok = Neo_Pulse_App_Semrush_Safe_Fix_Checklist::has_handshake_confirmation( $checklist );
		// Email only after Neo MCP applied the fix and returned fixed:true in the checklist JSON.
		if ( count( $fixed ) > 0 && $handshake_ok ) {
			$email = Neo_Pulse_App_Semrush_Safe_Fix_Mail::send_summary( $to, $fixed, $failed, $listed, $skipped, $site_id, $checklist );
			if ( ! empty( $email['ok'] ) ) {
				$status = 'done';
				$error  = '';
			} else {
				$error = (string) ( $email['error'] ?? 'Email was not sent' );
			}
		} elseif ( count( $fixed ) === 0 && count( $failed ) === 0 && count( $listed ) === 0 ) {
			$status = 'done';
			$error  = '';
			$email  = array( 'ok' => true, 'skipped' => true, 'reason' => 'nothing_to_fix' );
		} else {
			$status = 'failed';
			$error  = 'Neo MCP did not confirm a site fix; email withheld until handshake.bothConfirmed';
		}
		foreach ( $run_ids as $run_id ) {
			Neo_Pulse_App_Agent_Runs_Store::patch_run(
				$team_id,
				(int) $run_id,
				array(
					'status'       => $status,
					'errorMessage' => $error,
					'result'       => array(
						'ok'      => $status === 'done',
						'fixed'   => count( $fixed ),
						'failed'  => count( $failed ),
						'listed'  => count( $listed ),
						'skipped' => $skipped,
						'email'   => ! empty( $email['ok'] ) && empty( $email['skipped'] ),
					),
				)
			);
			if ( $status === 'done' && ! empty( $email['ok'] ) && empty( $email['skipped'] ) ) {
				$checklist_n = isset( $checklist['items'] ) && is_array( $checklist['items'] ) ? count( $checklist['items'] ) : 0;
				Neo_Pulse_App_Agent_Runs_Store::append_step(
					(int) $run_id,
					array(
						'stepIndex' => 99,
						'stepKey'   => 'emailed',
						'label'     => $checklist_n > 0
							? ( 'Emailed CSV + Neo MCP checklist JSON (' . $checklist_n . ' AI instruction' . ( $checklist_n === 1 ? '' : 's' ) . ') to ' . $to )
							: ( 'Emailed CSV to ' . $to ),
						'status'    => 'done',
					)
				);
			} elseif ( $status === 'failed' ) {
				Neo_Pulse_App_Agent_Runs_Store::append_step(
					(int) $run_id,
					array(
						'stepIndex' => 99,
						'stepKey'   => 'awaiting_neo_mcp',
						'label'     => 'Email withheld: waiting for Neo MCP fixed confirmation in checklist JSON',
						'status'    => 'error',
					)
				);
			} elseif ( $status === 'done' && ! empty( $email['skipped'] ) ) {
				Neo_Pulse_App_Agent_Runs_Store::append_step(
					(int) $run_id,
					array(
						'stepIndex' => 99,
						'stepKey'   => 'nothing_to_fix',
						'label'     => 'No Semrush Errors to fix',
						'status'    => 'done',
					)
				);
			}
		}
		return array(
			'ok'        => $status === 'done',
			'runIds'    => $run_ids,
			'runId'     => isset( $run_ids[0] ) ? $run_ids[0] : 0,
			'fixed'     => count( $fixed ),
			'failed'    => count( $failed ),
			'listed'    => count( $listed ),
			'skipped'   => $skipped,
			'rows'      => $report,
			'email'     => $email,
			'error'     => $error,
			'checklist' => $checklist,
		);
	}

	/**
	 * @param array<string,mixed>                        $site
	 * @param array{source:string,teamId:int,userId:int} $opts
	 * @return array<string,mixed>
	 */
	private static function create_site_run( array $site, array $opts ): array {
		$team_id = (int) $opts['teamId'];
		$user_id = (int) $opts['userId'];
		$source  = (string) $opts['source'];
		$site_id = (string) ( $site['id'] ?? '' );
		$label   = (string) ( $site['name'] ?? $site_id );
		$title   = 'Semrush safe fix: ' . ( $label !== '' ? $label : $site_id );

		$run = Neo_Pulse_App_Agent_Runs_Store::create_run(
			$team_id,
			$user_id,
			array(
				'recipeKey' => self::RECIPE_KEY,
				'title'     => $title,
				'source'    => in_array( $source, array( 'pulse_assist', 'task_manager', 'workflow' ), true ) ? $source : 'pulse_assist',
				'context'   => array(
					'siteId'     => $site_id,
					'managerTab' => 'dashboard',
					'taskTitle'  => $title,
				),
				'plan'      => array(
					'executionMode' => 'server',
					'safeFixSource' => $source,
				),
			)
		);
		if ( ! is_array( $run ) || empty( $run['id'] ) ) {
			return array(
				'ok'    => false,
				'error' => 'Could not create agent run',
				'runId' => 0,
			);
		}
		$run_id = (int) $run['id'];
		Neo_Pulse_App_Agent_Runs_Store::patch_run( $team_id, $run_id, array( 'status' => 'running' ) );
		Neo_Pulse_App_Agent_Runs_Store::append_step(
			$run_id,
			array(
				'stepIndex' => 0,
				'stepKey'   => 'started',
				'label'     => $title . ' started',
				'status'    => 'running',
			)
		);
		return array(
			'ok'    => true,
			'runId' => $run_id,
		);
	}

	/**
	 * One client = one agent run (shows in Task Manager via syncActiveAgentRunsToTasks).
	 *
	 * @param array<string,mixed>                                    $site Site row.
	 * @param array{source:string,teamId:int,userId:int,runId?:int} $opts Options.
	 * @return array<string,mixed>
	 */
	private static function run_one_site( array $site, array $opts ): array {
		$team_id = (int) $opts['teamId'];
		$user_id = (int) $opts['userId'];
		$source  = (string) $opts['source'];
		$site_id = (string) ( $site['id'] ?? '' );
		$label   = (string) ( $site['name'] ?? $site_id );
		$run_id  = (int) ( $opts['runId'] ?? 0 );

		if ( $run_id <= 0 ) {
			$created = self::create_site_run(
				$site,
				array(
					'source' => $source,
					'teamId' => $team_id,
					'userId' => $user_id,
				)
			);
			if ( empty( $created['ok'] ) || empty( $created['runId'] ) ) {
				return array(
					'ok'      => false,
					'error'   => (string) ( $created['error'] ?? 'Could not create agent run' ),
					'fixed'   => array(),
					'failed'  => array(
						array(
							'siteId' => $site_id,
							'error'  => 'Could not create agent run',
						),
					),
					'listed'  => array(),
					'skipped' => 0,
				);
			}
			$run_id = (int) $created['runId'];
		} else {
			Neo_Pulse_App_Agent_Runs_Store::patch_run( $team_id, $run_id, array( 'status' => 'running' ) );
		}

		$fixed   = array();
		$failed  = array();
		$listed  = array();
		$skipped = 0;
		$step_i  = 0;
		$project = (int) ( $site['semrushSiteAuditProjectId'] ?? 0 );

		if ( $project <= 0 ) {
			$skipped = 1;
			Neo_Pulse_App_Agent_Runs_Store::append_step(
				$run_id,
				array(
					'stepIndex' => 1,
					'stepKey'   => 'skip_no_project',
					'label'     => $label . ': no Semrush Site Audit project',
					'status'    => 'done',
					'payload'   => array( 'siteId' => $site_id ),
				)
			);
			Neo_Pulse_App_Agent_Runs_Store::patch_run(
				$team_id,
				$run_id,
				array(
					'status' => 'done',
					'result' => array(
						'ok'      => true,
						'skipped' => 1,
						'reason'  => 'no_project',
					),
				)
			);
			return array(
				'ok'     => true,
				'runId'  => $run_id,
				'fixed'  => array(),
				'failed' => array(),
				'listed' => array(),
				'skipped'=> 1,
			);
		}

		$step_i += 1;
		Neo_Pulse_App_Agent_Runs_Store::append_step(
			$run_id,
			array(
				'stepIndex' => $step_i,
				'stepKey'   => 'semrush_list',
				'label'     => $label . ': calling Semrush Errors list (project ' . $project . ')',
				'status'    => 'running',
				'payload'   => array( 'projectId' => $project ),
			)
		);

		$issues = Neo_Pulse_App_Semrush_Safe_Fix_Audit::fetch_safe_issues( $project );
		if ( is_wp_error( $issues ) ) {
			$err = $issues->get_error_message();
			Neo_Pulse_App_Agent_Runs_Store::append_step(
				$run_id,
				array(
					'stepIndex' => $step_i,
					'stepKey'   => 'semrush_error',
					'label'     => $label . ': Semrush list failed: ' . $err,
					'status'    => 'error',
				)
			);
			Neo_Pulse_App_Agent_Runs_Store::patch_run(
				$team_id,
				$run_id,
				array(
					'status'       => 'failed',
					'errorMessage' => $err,
				)
			);
			return array(
				'ok'     => false,
				'runId'  => $run_id,
				'fixed'  => array(),
				'failed' => array(
					array(
						'siteId'   => $site_id,
						'siteName' => $label,
						'error'    => $err,
					),
				),
				'listed' => array(),
				'skipped'=> 0,
			);
		}

		$issue_n = count( $issues );
		Neo_Pulse_App_Agent_Runs_Store::append_step(
			$run_id,
			array(
				'stepIndex' => $step_i,
				'stepKey'   => 'semrush_list',
				'label'     => $label . ': Semrush Errors list returned ' . $issue_n . ( $issue_n === 1 ? ' row' : ' rows' ),
				'status'    => 'done',
				'payload'   => array(
					'projectId' => $project,
					'count'     => $issue_n,
				),
			)
		);

		if ( $issue_n === 0 ) {
			Neo_Pulse_App_Agent_Runs_Store::patch_run(
				$team_id,
				$run_id,
				array(
					'status'       => 'done',
					'errorMessage' => '',
					'result'       => array(
						'ok'     => true,
						'fixed'  => 0,
						'failed' => 0,
						'reason' => 'nothing_to_fix',
					),
				)
			);
			return array(
				'ok'      => true,
				'runId'   => $run_id,
				'fixed'   => array(),
				'failed'  => array(),
				'listed'  => array(),
				'skipped' => 0,
			);
		}

		$step_i += 1;
		Neo_Pulse_App_Agent_Runs_Store::append_step(
			$run_id,
			array(
				'stepIndex' => $step_i,
				'stepKey'   => 'fixing',
				'label'     => $label . ': fixing ' . $issue_n . ' Semrush Error' . ( $issue_n === 1 ? '' : 's' ),
				'status'    => 'running',
			)
		);

		$sheet    = Neo_Pulse_App_Semrush_Safe_Fix_Sheet::build( $site, $issues );
		$skipped += (int) ( $sheet['skipped'] ?? 0 );
		foreach ( (array) ( $sheet['failedBuild'] ?? array() ) as $fb ) {
			$failed[] = $fb;
			$step_i  += 1;
			Neo_Pulse_App_Agent_Runs_Store::append_step(
				$run_id,
				array(
					'stepIndex' => $step_i,
					'stepKey'   => 'sheet_build_failed',
					'label'     => $label . ': sheet build failed',
					'status'    => 'error',
					'payload'   => $fb,
				)
			);
		}

		$rows = (array) ( $sheet['rows'] ?? array() );
		$mcp  = new Neo_Pulse_App_Neo_Mcp_Client(
			(string) ( $site['siteUrl'] ?? '' ),
			(string) ( $site['username'] ?? '' ),
			(string) ( $site['appPassword'] ?? '' )
		);

		$checklist = array();
		if ( count( $rows ) > 0 ) {
			$step_i += 1;
			Neo_Pulse_App_Agent_Runs_Store::append_step(
				$run_id,
				array(
					'stepIndex' => $step_i,
					'stepKey'   => 'checklist_ai',
					'label'     => $label . ': AI writing Neo MCP fix instructions for ' . count( $rows ) . ' Error' . ( count( $rows ) === 1 ? '' : 's' ),
					'status'    => 'running',
				)
			);
			$built = Neo_Pulse_App_Semrush_Safe_Fix_Checklist::build( $site, $rows, $project );
			if ( is_wp_error( $built ) ) {
				$err = $built->get_error_message();
				Neo_Pulse_App_Agent_Runs_Store::append_step(
					$run_id,
					array(
						'stepIndex' => $step_i,
						'stepKey'   => 'checklist_ai',
						'label'     => $label . ': Skills Library prompts failed: ' . $err,
						'status'    => 'error',
					)
				);
				Neo_Pulse_App_Agent_Runs_Store::patch_run(
					$team_id,
					$run_id,
					array(
						'status'       => 'failed',
						'errorMessage' => $err,
					)
				);
				return array( 'ok' => false, 'error' => $err, 'runId' => $run_id );
			}
			$checklist = is_array( $built ) ? $built : array();
			$push      = Neo_Pulse_App_Semrush_Safe_Fix_Checklist::push_to_neo_mcp( $mcp, $checklist );
			if ( empty( $push['ok'] ) ) {
				$err = (string) ( $push['error'] ?? 'Neo MCP checklist push failed' );
				Neo_Pulse_App_Agent_Runs_Store::append_step(
					$run_id,
					array(
						'stepIndex' => $step_i,
						'stepKey'   => 'checklist_mcp',
						'label'     => $label . ': Neo MCP checklist push failed: ' . $err,
						'status'    => 'error',
						'payload'   => $checklist,
					)
				);
				Neo_Pulse_App_Agent_Runs_Store::patch_run(
					$team_id,
					$run_id,
					array(
						'status'       => 'failed',
						'errorMessage' => $err,
					)
				);
				return array(
					'ok'        => false,
					'runId'     => $run_id,
					'fixed'     => array(),
					'failed'    => array(
						array(
							'siteId'   => $site_id,
							'siteName' => $label,
							'error'    => $err,
						),
					),
					'listed'    => array(),
					'skipped'   => $skipped,
					'checklist' => $checklist,
				);
			}
			Neo_Pulse_App_Agent_Runs_Store::append_step(
				$run_id,
				array(
					'stepIndex' => $step_i,
					'stepKey'   => 'checklist_mcp',
					'label'     => $label . ': sent Neo MCP checklist (' . (int) ( $push['itemCount'] ?? count( $rows ) ) . ' items with AI instructions)',
					'status'    => 'done',
					'payload'   => array(
						'itemCount' => (int) ( $push['itemCount'] ?? count( $rows ) ),
					),
				)
			);
			$rows = self::merge_checklist_into_rows( $rows, $checklist );
		}

		foreach ( $rows as $row_i => $row ) {
			if ( self::is_cancelled( $team_id, $run_id ) ) {
				return array(
					'ok'        => true,
					'runId'     => $run_id,
					'fixed'     => $fixed,
					'failed'    => $failed,
					'listed'    => $listed,
					'skipped'   => $skipped,
					'checklist' => $checklist,
					'cancelled' => true,
				);
			}
			$step_i += 1;
			if ( ! is_array( $row ) ) {
				continue;
			}
			$name  = (string) ( $row['issueName'] ?? $row['kind'] ?? 'Semrush error' );
			$instr = trim( (string) ( $row['neoMcpInstructions'] ?? '' ) );
			Neo_Pulse_App_Agent_Runs_Store::append_step(
				$run_id,
				array(
					'stepIndex' => $step_i,
					'stepKey'   => 'neo_mcp_apply',
					'label'     => $label . ': Neo MCP applying fix for ' . $name . ' on ' . (string) ( $row['pageUrl'] ?? '' ),
					'status'    => 'running',
					'payload'   => array(
						'row'                => $row,
						'neoMcpInstructions' => $instr,
					),
				)
			);

			$applied = Neo_Pulse_App_Semrush_Safe_Fix_Checklist::apply_and_confirm( $mcp, $row );
			$proof   = isset( $applied['response']['proof'] ) && is_array( $applied['response']['proof'] ) ? $applied['response']['proof'] : array();
			if ( empty( $applied['fixed'] ) ) {
				$err      = (string) ( $applied['error'] ?? $applied['message'] ?? 'Neo MCP did not confirm the fix' );
				$failed[] = array_merge(
					$row,
					array(
						'status' => 'failed',
						'error'  => $err,
						'before' => (string) ( $applied['before'] ?? '' ),
						'after'  => (string) ( $applied['after'] ?? '' ),
					)
				);
				$checklist = Neo_Pulse_App_Semrush_Safe_Fix_Checklist::record_neo_mcp_response(
					$checklist,
					(int) $row_i,
					isset( $applied['response'] ) && is_array( $applied['response'] ) ? $applied['response'] : array(),
					false,
					$err
				);
				Neo_Pulse_App_Agent_Runs_Store::append_step(
					$run_id,
					array(
						'stepIndex' => $step_i,
						'stepKey'   => 'proof_failed',
						'label'     => $label . ': proof failed for ' . $name . ' (' . $err . ')',
						'status'    => 'error',
						'payload'   => $applied,
					)
				);
				continue;
			}

			$row['before']    = (string) ( $applied['before'] ?? '' );
			$row['after']     = (string) ( $applied['after'] ?? $row['value'] ?? $row['toUrl'] ?? '' );
			$row['neoMcp']    = array();
			$row['handshake'] = array();
			$msg              = (string) ( $applied['message'] ?? ( 'Neo MCP + Pulse proof for ' . $name ) );
			$checklist        = Neo_Pulse_App_Semrush_Safe_Fix_Checklist::record_neo_mcp_response(
				$checklist,
				(int) $row_i,
				isset( $applied['response'] ) && is_array( $applied['response'] ) ? $applied['response'] : array( 'ok' => true, 'fixed' => true ),
				true,
				$msg
			);
			$row['neoMcp']    = isset( $checklist['items'][ $row_i ]['neoMcp'] ) ? $checklist['items'][ $row_i ]['neoMcp'] : array();
			$row['handshake'] = isset( $checklist['items'][ $row_i ]['handshake'] ) ? $checklist['items'][ $row_i ]['handshake'] : array();
			if ( empty( $row['handshake']['bothConfirmed'] ) ) {
				$err      = 'Handshake incomplete: Neo MCP and Pulse did not both verify';
				$failed[] = array_merge( $row, array( 'status' => 'failed', 'error' => $err ) );
				Neo_Pulse_App_Agent_Runs_Store::append_step(
					$run_id,
					array(
						'stepIndex' => $step_i,
						'stepKey'   => 'handshake_incomplete',
						'label'     => $label . ': ' . $err . ' for ' . $name,
						'status'    => 'error',
						'payload'   => array( 'applied' => $applied, 'handshake' => $row['handshake'] ),
					)
				);
				continue;
			}
			$fixed[] = $row;
			Neo_Pulse_App_Agent_Runs_Store::append_step(
				$run_id,
				array(
					'stepIndex' => $step_i,
					'stepKey'   => 'both_confirmed',
					'label'     => $msg,
					'status'    => 'done',
					'payload'   => array(
						'row'       => $row,
						'neoMcp'    => $row['neoMcp'],
						'handshake' => $row['handshake'],
						'proof'     => $proof,
					),
				)
			);
		}

		if ( count( (array) ( $checklist['items'] ?? array() ) ) > 0 ) {
			$step_i += 1;
			$checklist['handshakeSummary'] = Neo_Pulse_App_Semrush_Safe_Fix_Checklist::handshake_summary( $checklist );
			$final_push = Neo_Pulse_App_Semrush_Safe_Fix_Checklist::push_to_neo_mcp( $mcp, $checklist );
			Neo_Pulse_App_Agent_Runs_Store::append_step(
				$run_id,
				array(
					'stepIndex' => $step_i,
					'stepKey'   => 'handshake_json',
					'label'     => ! empty( $final_push['ok'] )
						? ( $label . ': stored handshake checklist on Neo MCP (' . (int) ( $checklist['handshakeSummary']['bothConfirmed'] ?? 0 ) . ' both-confirmed)' )
						: ( $label . ': Neo MCP handshake store failed: ' . (string) ( $final_push['error'] ?? 'unknown' ) ),
					'status'    => ! empty( $final_push['ok'] ) ? 'done' : 'error',
					'payload'   => array(
						'handshakeSummary' => $checklist['handshakeSummary'],
						'push'             => $final_push,
					),
				)
			);
		}

		Neo_Pulse_App_Agent_Runs_Store::patch_run(
			$team_id,
			$run_id,
			array(
				'status' => 'running',
				'result' => array(
					'confirmed'        => count( $fixed ),
					'failed'           => count( $failed ),
					'listed'           => count( $listed ),
					'skipped'          => $skipped,
					'handshakeSummary' => isset( $checklist['handshakeSummary'] ) ? $checklist['handshakeSummary'] : array(),
				),
			)
		);

		return array(
			'ok'        => true,
			'runId'     => $run_id,
			'fixed'     => $fixed,
			'failed'    => $failed,
			'listed'    => $listed,
			'skipped'   => $skipped,
			'checklist' => $checklist,
		);
	}

	/**
	 * Copy AI Neo MCP instructions from checklist items onto matching sheet rows.
	 *
	 * @param array<int,array<string,mixed>> $rows
	 * @param array<string,mixed>            $checklist
	 * @return array<int,array<string,mixed>>
	 */
	private static function merge_checklist_into_rows( array $rows, array $checklist ): array {
		$items = isset( $checklist['items'] ) && is_array( $checklist['items'] ) ? $checklist['items'] : array();
		foreach ( $rows as $i => $row ) {
			if ( ! is_array( $row ) ) {
				continue;
			}
			$item = isset( $items[ $i ] ) && is_array( $items[ $i ] ) ? $items[ $i ] : array();
			if ( ! empty( $item['neoMcpInstructions'] ) ) {
				$rows[ $i ]['neoMcpInstructions'] = (string) $item['neoMcpInstructions'];
			}
			if ( ! empty( $item['mcpTool'] ) ) {
				$rows[ $i ]['mcpTool'] = (string) $item['mcpTool'];
			}
			if ( ! empty( $item['mcpOperation'] ) ) {
				$rows[ $i ]['mcpOperation'] = (string) $item['mcpOperation'];
			}
			if ( isset( $item['mcpArguments'] ) && is_array( $item['mcpArguments'] ) ) {
				$rows[ $i ]['mcpArguments'] = $item['mcpArguments'];
			}
		}
		return $rows;
	}

	/**
	 * Sites for a run.
	 * Cron / all-sites: only rows with Semrush Safe Fix assigned (Auto).
	 * Explicit siteId (Run / wrench): that site only, assignment not required.
	 *
	 * @return array<int,array<string,mixed>>
	 */
	private static function sites_for_run( string $site_id ): array {
		$mirror = Neo_Pulse_App_Sites_Sync::load_mirror();
		$sites  = is_array( $mirror ) && isset( $mirror['sites'] ) && is_array( $mirror['sites'] )
			? $mirror['sites']
			: array();
		$out = array();
		foreach ( $sites as $site ) {
			if ( ! is_array( $site ) ) {
				continue;
			}
			$id = (string) ( $site['id'] ?? '' );
			if ( $site_id !== '' ) {
				if ( $id !== $site_id ) {
					continue;
				}
				$out[] = $site;
				continue;
			}
			if ( ! self::site_has_safe_fix_assigned( $site ) ) {
				continue;
			}
			$out[] = $site;
		}
		return $out;
	}

	/**
	 * @param array<string,mixed> $site
	 */
	public static function site_has_safe_fix_assigned( array $site ): bool {
		$ids = $site['assignedAgentIds'] ?? null;
		if ( ! is_array( $ids ) || $ids === array() ) {
			return false;
		}
		$needle = Neo_Pulse_App_Semrush_Safe_Fix_Schedule::AGENT_ID;
		foreach ( $ids as $id ) {
			if ( (string) $id === $needle ) {
				return true;
			}
		}
		return false;
	}

	/**
	 * @param array<string,mixed> $row
	 * @return array<string,mixed>
	 */
	private static function mcp_args_from_row( array $row ): array {
		$kind = (string) ( $row['kind'] ?? '' );
		$args = array(
			'url'  => (string) ( $row['pageUrl'] ?? '' ),
			'kind' => $kind,
		);
		if ( $kind === 'title' || $kind === 'meta_description' ) {
			$args['value'] = (string) ( $row['value'] ?? '' );
		} elseif ( $kind === 'missing_alt' ) {
			$args['value']   = (string) ( $row['value'] ?? '' );
			$args['fromUrl'] = (string) ( $row['fromUrl'] ?? '' );
		} else {
			$args['fromUrl'] = (string) ( $row['fromUrl'] ?? '' );
			$args['toUrl']   = (string) ( $row['toUrl'] ?? '' );
		}
		return $args;
	}

	/**
	 * @param array<string,mixed> $row
	 * @return array{ok:bool,error?:string,httpStatus?:int}
	 */
	public static function rescan_row( array $row ): array {
		return Neo_Pulse_App_Semrush_Safe_Fix_Rescan::rescan_row( $row );
	}

	private static function read_live_title( Neo_Pulse_App_Neo_Mcp_Client $mcp, string $url ): string {
		$read = $mcp->call_tool( 'neo-pulse_read', 'get-page-schema', array( 'url' => $url ) );
		$data = self::tool_data( $read );
		return trim( (string) ( $data['title'] ?? '' ) );
	}

	/**
	 * Write the public title, then read it back through Neo MCP.
	 *
	 * @param array<string,mixed> $row
	 * @return array{ok:bool,title?:string,error?:string}
	 */
	private static function confirm_title( Neo_Pulse_App_Neo_Mcp_Client $mcp, array $row ): array {
		$url      = (string) ( $row['pageUrl'] ?? '' );
		$expected = trim( (string) ( $row['value'] ?? '' ) );
		$kind     = (string) ( $row['kind'] ?? '' );
		if ( $kind !== 'title' || $url === '' || $expected === '' ) {
			return array( 'ok' => false, 'error' => 'Nothing to confirm' );
		}
		$url_js = wp_json_encode( $url );
		$b64    = wp_json_encode( base64_encode( $expected ) );
		$code   = 'return (function(){ $url = ' . $url_js . '; $title = base64_decode(' . $b64 . '); $id = url_to_postid($url); if (!$id) { $path = (string) parse_url($url, PHP_URL_PATH); $slug = trim(basename($path)); $found = $slug !== "" ? get_posts(array("name"=>$slug,"post_type"=>"any","post_status"=>"any","numberposts"=>1)) : array(); if ($found) { $id = (int) $found[0]->ID; } } if (!$id) { return array("ok"=>false,"error"=>"post not found"); } $updated = wp_update_post(array("ID"=>$id,"post_title"=>$title), true); if (is_wp_error($updated)) { return array("ok"=>false,"error"=>$updated->get_error_message()); } update_post_meta($id,"neo_pulse_seo_title",$title); clean_post_cache($id); return array("ok"=>true,"id"=>$id,"title"=>get_the_title($id)); })();';
		$wrote = $mcp->call_tool( 'neo-mcp_php', 'run', array( 'code' => $code ) );
		$saved = self::tool_data( $wrote );
		if ( empty( $saved['ok'] ) ) {
			return array(
				'ok'    => false,
				'error' => (string) ( $saved['error'] ?? 'Neo MCP could not save the title' ),
			);
		}
		$live = trim( (string) ( $saved['title'] ?? '' ) );
		if ( $live === '' || strcasecmp( $live, $expected ) !== 0 ) {
			$live = self::read_live_title( $mcp, $url );
		}
		if ( $live === '' || strcasecmp( $live, $expected ) !== 0 ) {
			return array(
				'ok'    => false,
				'title' => $live,
				'error' => 'Live title is "' . $live . '"',
			);
		}
		return array( 'ok' => true, 'title' => $live );
	}

	/**
	 * @param array<string,mixed> $call
	 * @return array<string,mixed>
	 */
	private static function is_cancelled( int $team_id, int $run_id ): bool {
		$run = Neo_Pulse_App_Agent_Runs_Store::get_run( $team_id, $run_id, false );
		return ! is_array( $run ) || (string) ( $run['status'] ?? '' ) === 'cancelled';
	}

	private static function tool_data( array $call ): array {
		if ( isset( $call['data'] ) && is_array( $call['data'] ) ) {
			$data = $call['data'];
			if ( isset( $data['return'] ) && is_array( $data['return'] ) ) {
				return $data['return'];
			}
			return $data;
		}
		if ( ! empty( $call['text'] ) ) {
			$decoded = json_decode( (string) $call['text'], true );
			if ( is_array( $decoded ) ) {
				if ( isset( $decoded['return'] ) && is_array( $decoded['return'] ) ) {
					return $decoded['return'];
				}
				return $decoded;
			}
		}
		return array();
	}
}
