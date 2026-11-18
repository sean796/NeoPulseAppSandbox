<?php
/**
 * Cannibalization Audit runner: inventory + GSC map + sheet/email (suggest only).
 *
 * @package Neo_Pulse_App
 */

defined( 'ABSPATH' ) || exit;

class Neo_Pulse_App_Cannibalization_Audit_Runner {

	const RECIPE_KEY = 'cannibalization_audit';
	const AGENT_ID   = 'content.blog.cannibalization-audit';

	/**
	 * @return array<string,mixed>
	 */
	public static function run_scheduled(): array {
		$schedule = Neo_Pulse_App_Cannibalization_Audit_Schedule::load();
		if ( empty( $schedule['enabled'] ) ) {
			return array( 'ok' => true, 'skipped' => true, 'reason' => 'not_due' );
		}
		if ( ! Neo_Pulse_App_Cannibalization_Audit_Schedule::is_library_enabled() ) {
			return array( 'ok' => true, 'skipped' => true, 'reason' => 'library_disabled' );
		}
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
						'to'     => (string) ( $schedule['to'] ?? Neo_Pulse_App_Cannibalization_Audit_Schedule::DEFAULT_TO ),
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
			$to = (string) ( Neo_Pulse_App_Cannibalization_Audit_Schedule::load()['to'] ?? Neo_Pulse_App_Cannibalization_Audit_Schedule::DEFAULT_TO );
		}
		Neo_Pulse_App_Agent_Runs_Store::patch_run(
			(int) $resolved['teamId'],
			(int) $run['runId'],
			array(
				'plan' => array(
					'executionMode'         => 'server',
					'cannibalizationAudit'  => array(
						'source' => (string) $resolved['source'],
						'teamId' => (int) $resolved['teamId'],
						'userId' => (int) $resolved['userId'],
						'siteId' => (string) ( $site['id'] ?? '' ),
						'site'   => $site,
						'to'     => $to,
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
		$saved = isset( $plan['cannibalizationAudit'] ) && is_array( $plan['cannibalizationAudit'] ) ? $plan['cannibalizationAudit'] : array();
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
				'to'     => (string) ( $saved['to'] ?? Neo_Pulse_App_Cannibalization_Audit_Schedule::DEFAULT_TO ),
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
		$to      = (string) ( $started['to'] ?? Neo_Pulse_App_Cannibalization_Audit_Schedule::DEFAULT_TO );
		if ( $run_id <= 0 || $team_id <= 0 || $site_id === '' ) {
			return array( 'ok' => false, 'error' => 'Missing started run context' );
		}
		$lock = 'neo_pulse_cannibalization_audit_finish_' . $run_id;
		if ( get_transient( $lock ) ) {
			return array( 'ok' => true, 'runId' => $run_id, 'busy' => true );
		}
		set_transient( $lock, '1', 600 );
		if ( function_exists( 'ignore_user_abort' ) ) {
			ignore_user_abort( true );
		}
		@set_time_limit( 900 );

		try {
			if ( Neo_Pulse_App_Agent_Runs_Store::is_cancelled( $team_id, $run_id ) ) {
				return array( 'ok' => true, 'runId' => $run_id, 'cancelled' => true );
			}

			self::step( $team_id, $run_id, 'neo_mcp', 'Asking Neo MCP...', 'running' );
			$map = Neo_Pulse_App_Cannibalization_Audit_Pipeline::build_map( $site );
			if ( is_wp_error( $map ) ) {
				return self::fail_run( $team_id, $run_id, $map->get_error_message(), 4 );
			}

			$page_count = (int) ( $map['pageCount'] ?? 0 );
			$answer     = trim( (string) ( $map['answer'] ?? '' ) );
			if ( $page_count < 1 || $answer === '' ) {
				Neo_Pulse_App_Agent_Runs_Store::patch_run(
					$team_id,
					$run_id,
					array(
						'status' => 'done',
						'result' => array(
							'goalMet'       => true,
							'pageCount'     => $page_count,
							'redirectCount' => 0,
							'leaveCount'    => (int) ( $map['leaveCount'] ?? 0 ),
							'summary'       => $page_count < 1 ? 'Neo MCP found no published /blog/ posts.' : 'Neo MCP returned no redirects.',
						),
						'step'   => array(
							'label'   => 'No redirects',
							'status'  => 'done',
							'stepKey' => 'complete',
						),
					)
				);
				return array( 'ok' => true, 'runId' => $run_id, 'pageCount' => $page_count, 'redirectCount' => 0 );
			}

			self::step( $team_id, $run_id, 'sheet', 'Writing Pulse Redirect workbook...', 'running' );

			$name   = (string) ( $map['siteName'] ?? Neo_Pulse_App_Editorial_Content_Audit_Worker::public_name( $site ) );
			$folder = Neo_Pulse_App_Cannibalization_Audit_Mail::ensure_folder( $name, $run_id );
			$folder_link = '';
			$sheet_link  = '';
			if ( ! empty( $folder['ok'] ) ) {
				$folder_link = (string) ( $folder['folderLink'] ?? '' );
				$wrote       = Neo_Pulse_App_Cannibalization_Audit_Mail::write_sheet( (string) $folder['folderId'], $map );
				if ( ! empty( $wrote['ok'] ) ) {
					$sheet_link = (string) ( $wrote['sheetLink'] ?? '' );
				}
			}

			self::step( $team_id, $run_id, 'email', 'Emailing redirect map...', 'running' );
			$email = Neo_Pulse_App_Cannibalization_Audit_Mail::send_summary( $to, $map, $folder_link );

			Neo_Pulse_App_Agent_Runs_Store::patch_run(
				$team_id,
				$run_id,
				array(
					'status' => 'done',
					'result' => array(
						'goalMet'                     => true,
						'pageCount'                   => $page_count,
						'redirectCount'               => (int) ( $map['redirectCount'] ?? 0 ),
						'leaveCount'                  => (int) ( $map['leaveCount'] ?? 0 ),
						'email'                       => $email,
						'suggestOnly'                 => true,
						'googleDriveFolderWebViewLink'=> $folder_link,
						'googleDriveWebViewLink'      => $sheet_link !== '' ? $sheet_link : $folder_link,
						'googleDriveSheetWebViewLink' => $sheet_link,
						'map'                         => array(
							'redirects' => $map['redirects'] ?? array(),
							'leave'     => $map['leave'] ?? array(),
						),
					),
					'step'   => array(
						'label'   => 'Redirect map ready',
						'status'  => 'done',
						'stepKey' => 'complete',
					),
				)
			);

			self::save_work(
				$run_id,
				array(
					'map'        => $map,
					'folderLink' => $folder_link,
					'sheetLink'  => $sheet_link,
					'email'      => $email,
				)
			);

			return array(
				'ok'            => true,
				'runId'         => $run_id,
				'pageCount'     => $page_count,
				'redirectCount' => (int) ( $map['redirectCount'] ?? 0 ),
				'email'         => $email,
			);
		} finally {
			delete_transient( $lock );
		}
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
	 * @param array<string,mixed> $site
	 * @param array{source:string,teamId:int,userId:int} $ctx
	 * @return array<string,mixed>
	 */
	private static function create_site_run( array $site, array $ctx ): array {
		$team_id = (int) $ctx['teamId'];
		$user_id = (int) $ctx['userId'];
		$site_id = trim( (string) ( $site['id'] ?? '' ) );
		$name    = Neo_Pulse_App_Editorial_Content_Audit_Worker::public_name( $site );
		$run     = Neo_Pulse_App_Agent_Runs_Store::create_run(
			$team_id,
			$user_id,
			array(
				'recipeKey' => self::RECIPE_KEY,
				'title'     => 'Cannibalization Audit: ' . $name,
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
			return array( 'ok' => false, 'error' => 'Could not create Cannibalization Audit run' );
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
			return array( 'ok' => false, 'error' => 'No site for Cannibalization Audit' );
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

	private static function step( int $team_id, int $run_id, string $key, string $label, string $status ): void {
		Neo_Pulse_App_Agent_Runs_Store::patch_run(
			$team_id,
			$run_id,
			array(
				'status' => 'running',
				'step'   => array(
					'label'   => $label,
					'status'  => $status === 'error' ? 'error' : 'running',
					'stepKey' => $key,
				),
			)
		);
	}

	/**
	 * @return array<string,mixed>
	 */
	private static function fail_run( int $team_id, int $run_id, string $message, int $code ): array {
		Neo_Pulse_App_Agent_Runs_Store::patch_run(
			$team_id,
			$run_id,
			array(
				'status'       => 'failed',
				'errorMessage' => $message,
				'result'       => array(
					'goalMet' => false,
					'error'   => $message,
					'code'    => $code,
				),
				'step'         => array(
					'label'   => $message,
					'status'  => 'error',
					'stepKey' => 'error',
				),
			)
		);
		return array( 'ok' => false, 'runId' => $run_id, 'error' => $message, 'code' => $code );
	}

	/**
	 * @param array<string,mixed> $work
	 */
	private static function save_work( int $run_id, array $work ): void {
		$path = Neo_Pulse_App_Data_Paths::cannibalization_audit_work_path( $run_id );
		Neo_Pulse_App_Json_File_Store::write( $path, $work );
	}
}
