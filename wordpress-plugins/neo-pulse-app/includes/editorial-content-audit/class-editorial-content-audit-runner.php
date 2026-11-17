<?php
/**
 * Editorial content audit runner: inventory → batched OpenRouter audit → email Sean.
 *
 * @package Neo_Pulse_App
 */

defined( 'ABSPATH' ) || exit;

class Neo_Pulse_App_Editorial_Content_Audit_Runner {

	const RECIPE_KEY = 'editorial_content_audit';
	const AGENT_ID   = 'content.editorial.audit';

	/**
	 * @return array<string,mixed>
	 */
	public static function run_scheduled(): array {
		$schedule = Neo_Pulse_App_Editorial_Content_Audit_Schedule::load();
		if ( empty( $schedule['enabled'] ) ) {
			return array( 'ok' => true, 'skipped' => true, 'reason' => 'not_due' );
		}
		if ( ! Neo_Pulse_App_Editorial_Content_Audit_Schedule::is_library_enabled() ) {
			return array( 'ok' => true, 'skipped' => true, 'reason' => 'library_disabled' );
		}
		return self::run_due_sites();
	}

	/**
	 * @return array<string,mixed>
	 */
	private static function run_due_sites(): array {
		$results = array();
		foreach ( self::sites_for_run( '' ) as $site ) {
			$due = Neo_Pulse_App_Skill_Run_Schedule::due_for_site( $site, self::AGENT_ID );
			if ( empty( $due['due'] ) ) {
				continue;
			}
			$id = (string) ( $site['id'] ?? '' );
			try {
				$results[] = self::run(
					array(
						'source' => 'scheduled',
						'siteId' => $id,
						'to'     => (string) ( Neo_Pulse_App_Editorial_Content_Audit_Schedule::load()['to'] ?? Neo_Pulse_App_Editorial_Content_Audit_Schedule::DEFAULT_TO ),
					)
				);
			} catch ( Throwable $e ) {
				$results[] = array( 'ok' => false, 'error' => $e->getMessage() );
			}
			Neo_Pulse_App_Skill_Run_Schedule::stamp( $id, self::AGENT_ID, (string) ( $due['runKey'] ?? '' ) );
		}
		if ( $results === array() ) {
			return array( 'ok' => true, 'skipped' => true, 'reason' => 'not_due' );
		}
		return array( 'ok' => true, 'results' => $results );
	}

	/**
	 * @param array{source?:string,siteId?:string,teamId?:int,userId?:int,site?:array<string,mixed>,to?:string} $opts
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
		$to = trim( (string) ( $opts['to'] ?? '' ) );
		if ( $to === '' || ! is_email( $to ) ) {
			$to = (string) ( Neo_Pulse_App_Editorial_Content_Audit_Schedule::load()['to'] ?? Neo_Pulse_App_Editorial_Content_Audit_Schedule::DEFAULT_TO );
		}
		Neo_Pulse_App_Agent_Runs_Store::patch_run(
			(int) $resolved['teamId'],
			(int) $run['runId'],
			array(
				'plan' => array(
					'executionMode'   => 'server',
					'editorialAudit'  => array(
						'source' => (string) $resolved['source'],
						'teamId' => (int) $resolved['teamId'],
						'userId' => (int) $resolved['userId'],
						'siteId' => (string) ( $site['id'] ?? '' ),
						'site'   => $site,
						'to'     => $to,
						'cursor' => 0,
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
			'to'     => $to,
		);
	}

	/**
	 * @param array<string,mixed> $run
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
		$saved = isset( $plan['editorialAudit'] ) && is_array( $plan['editorialAudit'] ) ? $plan['editorialAudit'] : array();
		$site  = isset( $saved['site'] ) && is_array( $saved['site'] ) ? $saved['site'] : array();
		if ( empty( $site['id'] ) && empty( $site['siteUrl'] ) ) {
			return;
		}
		self::finish(
			array(
				'runId'  => (int) ( $run['id'] ?? 0 ),
				'teamId' => (int) ( $saved['teamId'] ?? $run['teamId'] ?? 0 ),
				'userId' => (int) ( $saved['userId'] ?? 0 ),
				'source' => (string) ( $saved['source'] ?? 'pulse_assist' ),
				'siteId' => (string) ( $saved['siteId'] ?? $site['id'] ?? '' ),
				'site'   => $site,
				'to'     => (string) ( $saved['to'] ?? Neo_Pulse_App_Editorial_Content_Audit_Schedule::DEFAULT_TO ),
			)
		);
	}

	/**
	 * @param array<string,mixed> $started
	 * @return array<string,mixed>
	 */
	public static function finish( array $started ): array {
		$run_id  = (int) ( $started['runId'] ?? 0 );
		$team_id = (int) ( $started['teamId'] ?? 0 );
		$site_id = trim( (string) ( $started['siteId'] ?? '' ) );
		$site    = isset( $started['site'] ) && is_array( $started['site'] ) ? $started['site'] : array();
		$to      = (string) ( $started['to'] ?? Neo_Pulse_App_Editorial_Content_Audit_Schedule::DEFAULT_TO );
		if ( $run_id <= 0 || $team_id <= 0 || $site_id === '' ) {
			return array( 'ok' => false, 'error' => 'Missing started run context' );
		}
		$lock = 'neo_pulse_editorial_audit_finish_' . $run_id;
		if ( get_transient( $lock ) ) {
			return array( 'ok' => true, 'runId' => $run_id, 'busy' => true );
		}
		set_transient( $lock, '1', 300 );
		if ( function_exists( 'ignore_user_abort' ) ) {
			ignore_user_abort( true );
		}
		@set_time_limit( 900 );

		// Client does not poll this recipe. After the 202 response, keep ticking here
		// so progress does not stall waiting on unreliable WP-cron.
		$result   = null;
		$deadline = microtime( true ) + 600;
		try {
			do {
				$result = self::tick( $team_id, $run_id, $site_id, $site, $to );
				set_transient( $lock, '1', 300 );
				if ( empty( $result['running'] ) ) {
					return $result;
				}
			} while ( microtime( true ) < $deadline );
		} finally {
			delete_transient( $lock );
		}

		if ( ! empty( $result['running'] ) && class_exists( 'Neo_Pulse_App_Agent_Run_Worker_Cron' ) ) {
			Neo_Pulse_App_Agent_Run_Worker_Cron::kick();
		}
		return is_array( $result )
			? $result
			: array(
				'ok'      => true,
				'runId'   => $run_id,
				'running' => true,
			);
	}

	/**
	 * @param array{source?:string,siteId?:string,teamId?:int,userId?:int,site?:array<string,mixed>,to?:string} $opts
	 * @return array<string,mixed>
	 */
	public static function run( array $opts = array() ): array {
		$started = self::start( $opts );
		if ( empty( $started['ok'] ) ) {
			return $started;
		}
		return self::finish( $started );
	}

	/**
	 * Process one batch. Leaves status=running when more pages remain.
	 *
	 * @param array<string,mixed> $site
	 * @return array<string,mixed>
	 */
	private static function tick( int $team_id, int $run_id, string $site_id, array $site, string $to ): array {
		$work = self::load_work( $run_id );
		if ( $work === null ) {
			$work = array(
				'inventory' => array(
					'siteId'     => (string) ( $site['id'] ?? '' ),
					'siteName'   => Neo_Pulse_App_Editorial_Content_Audit_Worker::public_name( $site ),
					'pageCount'  => 0,
					'pages'      => array(),
					'property'   => Neo_Pulse_App_Editorial_Content_Audit_Worker::property_context( $site ),
				),
				'findings'  => array(),
				'log'       => array(),
				'cursor'    => 0,
				'fetch'     => array( 'sourceIndex' => 0, 'page' => 1, 'done' => false ),
			);
		}

		$loaded = self::ensure_loaded_page( $team_id, $run_id, $site, $work );
		if ( isset( $loaded['ok'] ) ) {
			return $loaded;
		}
		$work = $loaded;

		$work = self::ensure_drive_folder( $team_id, $run_id, $site, $work );

		$pages   = isset( $work['inventory']['pages'] ) && is_array( $work['inventory']['pages'] ) ? $work['inventory']['pages'] : array();
		$cursor  = (int) ( $work['cursor'] ?? 0 );
		$total   = count( $pages );
		$prop    = isset( $work['inventory']['property'] ) && is_array( $work['inventory']['property'] )
			? $work['inventory']['property']
			: Neo_Pulse_App_Editorial_Content_Audit_Worker::property_context( $site );
		$batch   = Neo_Pulse_App_Editorial_Content_Audit_Worker::BATCH_SIZE;
		$end     = min( $total, $cursor + $batch );
		$findings = isset( $work['findings'] ) && is_array( $work['findings'] ) ? $work['findings'] : array();

		for ( $i = $cursor; $i < $end; $i++ ) {
			$page = $pages[ $i ];
			if ( ! is_array( $page ) ) {
				return self::fail_run( $team_id, $run_id, 'Inventory page row is invalid', 4 );
			}
			$title = trim( (string) ( $page['title'] ?? 'Untitled' ) );
			self::step(
				$team_id,
				$run_id,
				'audit',
				'Auditing ' . ( $i + 1 ) . '/' . $total . ' ' . $title,
				'running'
			);
			$result = Neo_Pulse_App_Editorial_Content_Audit_Worker::audit_page( $page, $prop );
			if ( is_wp_error( $result ) ) {
				self::step( $team_id, $run_id, 'audit', 'Retrying ' . $title, 'running' );
				$result = Neo_Pulse_App_Editorial_Content_Audit_Worker::audit_page( $page, $prop );
			}
			if ( is_wp_error( $result ) ) {
				$skipped = isset( $work['skipped'] ) && is_array( $work['skipped'] ) ? $work['skipped'] : array();
				$skipped[] = (int) ( $page['id'] ?? 0 );
				$work['skipped'] = $skipped;
				self::step( $team_id, $run_id, 'audit', 'Skipped ' . $title, 'running' );
				self::keep_console_log( $work );
				continue;
			}
			foreach ( $result as $row ) {
				if ( ! is_array( $row ) || trim( (string) ( $row['problem'] ?? '' ) ) === '' ) {
					continue;
				}
				$findings[] = $row;
			}
			self::keep_console_log( $work );
		}

		$work['findings'] = $findings;
		$work['cursor']   = $end;
		self::save_work( $run_id, $work );
		self::patch_cursor( $team_id, $run_id, $end );
		self::patch_console_log( $team_id, $run_id, $work );

		// Rewrite the sheet before the next URL. A page with no errors still gets a row.
		self::publish_drive_progress( $team_id, $run_id, $site, $work, $end, $total );
		self::save_work( $run_id, $work );

		$fetch_done = ! isset( $work['fetch'] ) || ! empty( $work['fetch']['done'] );
		if ( $end < $total || ! $fetch_done ) {
			return array(
				'ok'      => true,
				'runId'   => $run_id,
				'running' => true,
				'cursor'  => $end,
				'total'   => $total,
			);
		}

		self::step( $team_id, $run_id, 'rollup', 'Building handoff summary...', 'running' );
		$rollup = Neo_Pulse_App_Editorial_Content_Audit_Worker::rollup( $findings, $work['inventory'] );
		if ( is_wp_error( $rollup ) ) {
			return self::fail_run( $team_id, $run_id, $rollup->get_error_message(), 5 );
		}

		self::step( $team_id, $run_id, 'email', 'Sending audit report...', 'running' );
		$site_name = Neo_Pulse_App_Editorial_Content_Audit_Worker::public_name( $site );
		$folder_link = trim( (string) ( $work['driveFolderLink'] ?? '' ) );
		$email     = Neo_Pulse_App_Editorial_Content_Audit_Mail::send_summary(
			$to,
			$site_name,
			$site_id,
			self::sheet_rows( $work ),
			$rollup,
			$folder_link
		);
		if ( empty( $email['ok'] ) ) {
			$mail_err = (string) ( $email['error'] ?? 'Email was not sent' );
			self::clear_work( $run_id );
			Neo_Pulse_App_Agent_Runs_Store::patch_run(
				$team_id,
				$run_id,
				array(
					'status'       => 'failed',
					'errorMessage' => $mail_err,
					'result'       => array(
						'executionMode' => 'server',
						'pageCount'     => $total,
						'findingCount'  => count( $findings ),
						'email'         => false,
						'emailError'    => $mail_err,
						'rollup'        => $rollup,
						'googleDriveFolderWebViewLink' => $folder_link,
					),
					'step'         => array(
						'label'   => $mail_err,
						'status'  => 'error',
						'stepKey' => 'email',
					),
				)
			);
			return array( 'ok' => false, 'runId' => $run_id, 'error' => $mail_err, 'email' => $email );
		}

		self::clear_work( $run_id );
		Neo_Pulse_App_Agent_Runs_Store::patch_run(
			$team_id,
			$run_id,
			array(
				'status'       => 'done',
				'errorMessage' => null,
				'result'       => array(
					'executionMode' => 'server',
					'pageCount'     => $total,
					'findingCount'  => count( $findings ),
					'email'         => true,
					'rollup'        => $rollup,
					'googleDriveFolderWebViewLink' => $folder_link,
					'googleDriveWebViewLink'       => trim( (string) ( $work['driveSheetLink'] ?? $work['driveFolderLink'] ?? '' ) ),
					'googleDriveSheetWebViewLink'  => trim( (string) ( $work['driveSheetLink'] ?? '' ) ),
				),
				'step'         => array(
					'label'   => 'Report sent',
					'status'  => 'done',
					'stepKey' => 'complete',
				),
			)
		);
		return array(
			'ok'      => true,
			'runId'   => $run_id,
			'pages'   => $total,
			'findings'=> count( $findings ),
			'email'   => $email,
		);
	}

	/**
	 * @param array<string,mixed> $site
	 * @param array{source:string,teamId:int,userId:int} $ctx
	 * @return array<string,mixed>
	 */
	private static function create_site_run( array $site, array $ctx ): array {
		$team_id = (int) $ctx['teamId'];
		$user_id = (int) $ctx['userId'];
		$site_id = trim( (string) ( $site['id'] ?? '' ) );
		$name    = Neo_Pulse_App_Editorial_Content_Audit_Worker::public_name( $site );
		$run = Neo_Pulse_App_Agent_Runs_Store::create_run(
			$team_id,
			$user_id,
			array(
				'recipeKey' => self::RECIPE_KEY,
				'title'     => 'Editorial content audit: ' . $name,
				'source'    => (string) $ctx['source'],
				'context'   => array(
					'siteId'     => $site_id,
					'managerTab' => 'dashboard',
				),
				'plan'      => array(
					'executionMode' => 'server',
				),
			)
		);
		if ( ! $run || empty( $run['id'] ) ) {
			return array( 'ok' => false, 'error' => 'Could not create editorial content audit run' );
		}
		return array( 'ok' => true, 'runId' => (int) $run['id'] );
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
			? array( self::merge_posted_site( $posted ) )
			: self::sites_for_run( $site_id );
		if ( count( $sites ) === 0 ) {
			return array( 'ok' => false, 'error' => 'No site for Editorial Content Audit' );
		}

		return array(
			'ok'     => true,
			'source' => $source,
			'siteId' => $site_id !== '' ? $site_id : (string) ( $sites[0]['id'] ?? '' ),
			'teamId' => $team_id,
			'userId' => $user_id,
			'sites'  => $sites,
			'site'   => $sites[0],
		);
	}

	/**
	 * Posted Run body often omits NAP / locations; merge mirror when available.
	 *
	 * @param array<string,mixed> $posted
	 * @return array<string,mixed>
	 */
	private static function merge_posted_site( array $posted ): array {
		$id = trim( (string) ( $posted['id'] ?? '' ) );
		if ( $id === '' ) {
			return $posted;
		}
		$mirror_sites = self::sites_for_run( $id );
		if ( count( $mirror_sites ) === 0 ) {
			return $posted;
		}
		$mirror = $mirror_sites[0];
		foreach ( array( 'entitySitemapUrl', 'manualEndpoint', 'serviceCity', 'serviceState', 'serviceCountry', 'locations', 'napInfo', 'name' ) as $key ) {
			if ( empty( $posted[ $key ] ) && ! empty( $mirror[ $key ] ) ) {
				$posted[ $key ] = $mirror[ $key ];
			}
		}
		// Posted appPassword must win.
		return $posted;
	}

	/**
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
			if ( ! self::site_has_skill_assigned( $site ) ) {
				continue;
			}
			$out[] = $site;
		}
		return $out;
	}

	/**
	 * @param array<string,mixed> $site
	 */
	public static function site_has_skill_assigned( array $site ): bool {
		$ids = $site['assignedAgentIds'] ?? null;
		if ( ! is_array( $ids ) || $ids === array() ) {
			return false;
		}
		foreach ( $ids as $id ) {
			if ( (string) $id === self::AGENT_ID ) {
				return true;
			}
		}
		return false;
	}

	/**
	 * @param array<string,mixed> $site
	 * @param array<string,mixed> $work
	 * @return array<string,mixed>
	 */
	private static function ensure_drive_folder( int $team_id, int $run_id, array $site, array $work ): array {
		if ( trim( (string) ( $work['driveFolderId'] ?? '' ) ) !== '' ) {
			return $work;
		}
		$name   = Neo_Pulse_App_Editorial_Content_Audit_Worker::public_name( $site );
		$folder = Neo_Pulse_App_Editorial_Content_Audit_Mail::ensure_folder( $name, $run_id );
		if ( empty( $folder['ok'] ) ) {
			$err = (string) ( $folder['error'] ?? 'Drive folder was not created' );
			self::step( $team_id, $run_id, 'drive-error', 'Drive folder failed: ' . $err, 'error' );
			$work['driveError'] = $err;
			self::save_work( $run_id, $work );
			return $work;
		}
		$work['driveFolderId']   = (string) $folder['folderId'];
		$work['driveFolderLink'] = (string) $folder['folderLink'];
		self::save_work( $run_id, $work );
		self::log_line( $run_id, 'drive', 'Drive folder: ' . $work['driveFolderLink'] );
		self::patch_drive_result( $team_id, $run_id, $work, (int) ( $work['cursor'] ?? 0 ), 0 );
		return $work;
	}

	/**
	 * @param array<string,mixed> $site
	 * @param array<string,mixed> $work
	 */
	private static function publish_drive_progress( int $team_id, int $run_id, array $site, array &$work, int $done, int $total ): void {
		$folder_id = trim( (string) ( $work['driveFolderId'] ?? '' ) );
		if ( $folder_id === '' ) {
			self::patch_drive_result( $team_id, $run_id, $work, $done, $total );
			return;
		}
		$rows  = self::sheet_rows( $work );
		$wrote = Neo_Pulse_App_Editorial_Content_Audit_Mail::write_progress( $folder_id, $rows );
		if ( empty( $wrote['ok'] ) ) {
			$err = (string) ( $wrote['error'] ?? 'Findings CSV was not updated' );
			$work['driveError'] = $err;
			self::step( $team_id, $run_id, 'drive-write', 'Drive update failed: ' . $err, 'error' );
		} else {
			$work['driveSheetLink'] = (string) ( $wrote['sheetLink'] ?? '' );
			$work['driveError']     = '';
		}
		self::patch_drive_result( $team_id, $run_id, $work, $done, $total );
	}

	/**
	 * @param array<string,mixed> $work
	 */
	/**
	 * @param array<string,mixed> $work
	 */
	/**
	 * One row per error, or one "no errors" row for a page that has none.
	 *
	 * @param array<string,mixed> $work
	 * @return array<int,array<string,mixed>>
	 */
	private static function sheet_rows( array $work ): array {
		$findings = isset( $work['findings'] ) && is_array( $work['findings'] ) ? $work['findings'] : array();
		$errors_by_page = array();
		foreach ( $findings as $row ) {
			if ( ! is_array( $row ) ) {
				continue;
			}
			$problem = strtolower( trim( (string) ( $row['problem'] ?? '' ) ) );
			if ( $problem === '' || $problem === 'no errors' ) {
				continue;
			}
			$prop = isset( $work['inventory']['property'] ) && is_array( $work['inventory']['property'] )
				? $work['inventory']['property']
				: array();
			$kept = Neo_Pulse_App_Editorial_Content_Audit_Worker::accept_stored_finding( $row, $prop );
			if ( ! is_array( $kept ) ) {
				continue;
			}
			$row = $kept;
			$pid = (int) ( $row['pageId'] ?? 0 );
			if ( ! isset( $errors_by_page[ $pid ] ) ) {
				$errors_by_page[ $pid ] = array();
			}
			$errors_by_page[ $pid ][] = $row;
		}
		$pages  = isset( $work['inventory']['pages'] ) && is_array( $work['inventory']['pages'] ) ? $work['inventory']['pages'] : array();
		$cursor = (int) ( $work['cursor'] ?? 0 );
		$limit  = min( $cursor, count( $pages ) );
		$out    = array();
		for ( $i = 0; $i < $limit; $i++ ) {
			$page = $pages[ $i ];
			if ( ! is_array( $page ) ) {
				continue;
			}
			$pid = (int) ( $page['id'] ?? 0 );
			$skipped_ids = isset( $work['skipped'] ) && is_array( $work['skipped'] ) ? $work['skipped'] : array();
			$was_skipped = in_array( $pid, array_map( 'intval', $skipped_ids ), true );
			if ( isset( $errors_by_page[ $pid ] ) && $errors_by_page[ $pid ] !== array() ) {
				foreach ( $errors_by_page[ $pid ] as $row ) {
					$out[] = $row;
				}
				continue;
			}
			$out[] = array(
				'pageId'    => $pid,
				'url'       => (string) ( $page['url'] ?? '' ),
				'title'     => (string) ( $page['title'] ?? '' ),
				'status'    => (string) ( $page['status'] ?? '' ),
				'type'      => (string) ( $page['type'] ?? '' ),
				'severity'  => '',
				'certainty' => '',
				'quote'     => '',
				'problem'   => $was_skipped ? 'skipped' : 'no errors',
				'fix'       => '',
			);
		}
		return $out;
	}

	/**
	 * Load one REST page when the audited cursor has caught the pages already in memory.
	 *
	 * @param array<string,mixed> $site
	 * @param array<string,mixed> $work
	 * @return array<string,mixed>
	 */
	private static function ensure_loaded_page( int $team_id, int $run_id, array $site, array $work ): array {
		$guard = 0;
		while ( $guard < 8 ) {
			$pages  = isset( $work['inventory']['pages'] ) && is_array( $work['inventory']['pages'] ) ? $work['inventory']['pages'] : array();
			$cursor = (int) ( $work['cursor'] ?? 0 );
			$fetch  = isset( $work['fetch'] ) && is_array( $work['fetch'] ) ? $work['fetch'] : array( 'done' => true );
			if ( $cursor < count( $pages ) || ! empty( $fetch['done'] ) ) {
				break;
			}
			++$guard;
			self::step( $team_id, $run_id, 'inventory', 'Loading next posts...', 'running' );
			$batch = Neo_Pulse_App_Editorial_Content_Audit_Worker::load_next_batch( $site, $fetch );
			self::keep_console_log( $work );
			self::patch_console_log( $team_id, $run_id, $work );
			if ( is_wp_error( $batch ) ) {
				return self::fail_run( $team_id, $run_id, $batch->get_error_message(), 3 );
			}
			$known = array();
			foreach ( $pages as $page ) {
				if ( is_array( $page ) ) {
					$known[ (string) ( $page['type'] ?? '' ) . ':' . (int) ( $page['id'] ?? 0 ) ] = true;
				}
			}
			foreach ( (array) ( $batch['pages'] ?? array() ) as $page ) {
				if ( ! is_array( $page ) ) {
					continue;
				}
				$key = (string) ( $page['type'] ?? '' ) . ':' . (int) ( $page['id'] ?? 0 );
				if ( isset( $known[ $key ] ) ) {
					continue;
				}
				$known[ $key ] = true;
				$pages[]       = $page;
			}
			$work['fetch'] = isset( $batch['fetch'] ) && is_array( $batch['fetch'] ) ? $batch['fetch'] : array( 'done' => true );
			$work['inventory']['pages']     = $pages;
			$work['inventory']['pageCount'] = count( $pages );
			self::save_work( $run_id, $work );
			if ( count( (array) ( $batch['pages'] ?? array() ) ) > 0 ) {
				break;
			}
		}

		$pages = isset( $work['inventory']['pages'] ) && is_array( $work['inventory']['pages'] ) ? $work['inventory']['pages'] : array();
		$fetch = isset( $work['fetch'] ) && is_array( $work['fetch'] ) ? $work['fetch'] : array( 'done' => true );
		if ( count( $pages ) < 1 && ! empty( $fetch['done'] ) ) {
			self::clear_work( $run_id );
			Neo_Pulse_App_Agent_Runs_Store::patch_run(
				$team_id,
				$run_id,
				array(
					'status' => 'done',
					'result' => array(
						'executionMode' => 'server',
						'goalMet'       => true,
						'pageCount'     => 0,
						'email'         => false,
						'message'       => 'No posts or service-area pages to audit.',
					),
					'step'   => array(
						'label'   => 'Zero pages',
						'status'  => 'done',
						'stepKey' => 'complete',
					),
				)
			);
			return array( 'ok' => true, 'runId' => $run_id, 'goalMet' => true );
		}
		return $work;
	}

	private static function keep_console_log( array &$work ): void {
		$prev = isset( $work['consoleLog'] ) && is_array( $work['consoleLog'] ) ? $work['consoleLog'] : array();
		foreach ( Neo_Pulse_App_Editorial_Content_Audit_Worker::drain_api_notes() as $line ) {
			$prev[] = $line;
		}
		$work['consoleLog'] = $prev;
	}

	/**
	 * @param array<string,mixed> $work
	 */
	private static function patch_console_log( int $team_id, int $run_id, array $work ): void {
		$lines = isset( $work['consoleLog'] ) && is_array( $work['consoleLog'] ) ? $work['consoleLog'] : array();
		Neo_Pulse_App_Agent_Runs_Store::patch_run(
			$team_id,
			$run_id,
			array(
				'result' => array(
					'consoleLog' => array_values( $lines ),
				),
			)
		);
	}

	private static function patch_drive_result( int $team_id, int $run_id, array &$work, int $done, int $total ): void {
		self::keep_console_log( $work );
		$lines = isset( $work['consoleLog'] ) && is_array( $work['consoleLog'] ) ? $work['consoleLog'] : array();
		Neo_Pulse_App_Agent_Runs_Store::patch_run(
			$team_id,
			$run_id,
			array(
				'result' => array(
					'executionMode'                => 'server',
					'consoleLog'                   => array_values( $lines ),
					'googleDriveFolderWebViewLink' => (string) ( $work['driveFolderLink'] ?? '' ),
					'googleDriveWebViewLink'       => (string) ( $work['driveSheetLink'] ?? $work['driveFolderLink'] ?? '' ),
					'googleDriveSheetWebViewLink'  => (string) ( $work['driveSheetLink'] ?? '' ),
					'googleDriveError'             => (string) ( $work['driveError'] ?? '' ),
					'checkpoint'                   => array(
						'currentIndex' => $done,
						'totalCount'   => $total,
						'currentUrl'   => (string) ( $work['driveFolderLink'] ?? '' ),
						'lastMessage'  => $done . '/' . $total . ' pages',
					),
				),
			)
		);
	}

	private static function log_line( int $run_id, string $key, string $label ): void {
		$label = trim( preg_replace( '/\s+/', ' ', $label ) ?? $label );
		if ( function_exists( 'mb_substr' ) ) {
			$label = mb_substr( $label, 0, 240 );
		} else {
			$label = substr( $label, 0, 240 );
		}
		Neo_Pulse_App_Agent_Runs_Store::append_step(
			$run_id,
			array(
				'stepKey' => $key,
				'label'   => $label,
				'status'  => 'done',
			)
		);
	}

	private static function step( int $team_id, int $run_id, string $key, string $label, string $status ): void {
		Neo_Pulse_App_Agent_Runs_Store::patch_run(
			$team_id,
			$run_id,
			array(
				'status' => 'running',
				'step'   => array(
					'label'   => $label,
					'status'  => $status,
					'stepKey' => $key,
				),
			)
		);
	}

	private static function patch_cursor( int $team_id, int $run_id, int $cursor ): void {
		$run  = Neo_Pulse_App_Agent_Runs_Store::get_run( $team_id, $run_id, false );
		$plan = is_array( $run ) && isset( $run['plan'] ) && is_array( $run['plan'] ) ? $run['plan'] : array();
		$ea   = isset( $plan['editorialAudit'] ) && is_array( $plan['editorialAudit'] ) ? $plan['editorialAudit'] : array();
		$ea['cursor'] = $cursor;
		$plan['editorialAudit'] = $ea;
		$plan['executionMode']  = 'server';
		Neo_Pulse_App_Agent_Runs_Store::patch_run(
			$team_id,
			$run_id,
			array( 'plan' => $plan )
		);
	}

	/**
	 * @return array<string,mixed>
	 */
	private static function fail_run( int $team_id, int $run_id, string $message, int $exit_hint ): array {
		self::clear_work( $run_id );
		Neo_Pulse_App_Agent_Runs_Store::patch_run(
			$team_id,
			$run_id,
			array(
				'status'       => 'failed',
				'errorMessage' => $message,
				'step'         => array(
					'label'   => $message,
					'status'  => 'error',
					'stepKey' => 'error',
				),
				'result'       => array(
					'executionMode' => 'server',
					'exitHint'      => $exit_hint,
				),
			)
		);
		return array( 'ok' => false, 'runId' => $run_id, 'error' => $message );
	}

	/**
	 * @return array<string,mixed>|null
	 */
	private static function load_work( int $run_id ): ?array {
		$path = Neo_Pulse_App_Data_Paths::editorial_content_audit_work_path( $run_id );
		$raw  = class_exists( 'Neo_Pulse_App_Json_File_Store' )
			? Neo_Pulse_App_Json_File_Store::read( $path )
			: null;
		return is_array( $raw ) ? $raw : null;
	}

	/**
	 * @param array<string,mixed> $work
	 */
	private static function save_work( int $run_id, array $work ): void {
		$path = Neo_Pulse_App_Data_Paths::editorial_content_audit_work_path( $run_id );
		Neo_Pulse_App_Json_File_Store::write( $path, $work );
	}

	private static function clear_work( int $run_id ): void {
		$path = Neo_Pulse_App_Data_Paths::editorial_content_audit_work_path( $run_id );
		if ( is_string( $path ) && $path !== '' && file_exists( $path ) ) {
			@unlink( $path );
		}
	}
}
