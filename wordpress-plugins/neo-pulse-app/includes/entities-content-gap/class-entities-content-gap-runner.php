<?php
/**
 * Entities Content Gap Check runner: PHP count, then client package fill.
 *
 * @package Neo_Pulse_App
 */

defined( 'ABSPATH' ) || exit;

class Neo_Pulse_App_Entities_Content_Gap_Runner {

	const RECIPE_KEY = 'entities_content_gap_check';
	const AGENT_ID   = 'content.entities.gap-check';

	/**
	 * @return array<string,mixed>
	 */
	public static function run_scheduled(): array {
		$schedule = Neo_Pulse_App_Entities_Content_Gap_Schedule::load();
		if ( empty( $schedule['enabled'] ) ) {
			return array( 'ok' => true, 'skipped' => true, 'reason' => 'not_due' );
		}
		if ( ! Neo_Pulse_App_Entities_Content_Gap_Schedule::is_library_enabled() ) {
			return array( 'ok' => true, 'skipped' => true, 'reason' => 'library_disabled' );
		}
		return self::run_due_sites( self::AGENT_ID );
	}

	/**
	 * Auto: each assigned site uses its own run schedule. The skill still checks next month.
	 *
	 * @return array<string,mixed>
	 */
	private static function run_due_sites( string $agent_id ): array {
		$results = array();
		foreach ( self::sites_for_run( '' ) as $site ) {
			$due = Neo_Pulse_App_Skill_Run_Schedule::due_for_site( $site, $agent_id );
			if ( empty( $due['due'] ) ) {
				continue;
			}
			$id = (string) ( $site['id'] ?? '' );
			try {
				$results[] = self::run(
					array(
						'source' => 'scheduled',
						'siteId' => $id,
					)
				);
			} catch ( Throwable $e ) {
				$results[] = array( 'ok' => false, 'error' => $e->getMessage() );
			}
			Neo_Pulse_App_Skill_Run_Schedule::stamp( $id, $agent_id, (string) ( $due['runKey'] ?? '' ) );
		}
		if ( $results === array() ) {
			return array( 'ok' => true, 'skipped' => true, 'reason' => 'not_due' );
		}
		return array( 'ok' => true, 'results' => $results );
	}

	/**
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
					'entitiesGap'      => array(
						'source' => (string) $resolved['source'],
						'teamId' => (int) $resolved['teamId'],
						'userId' => (int) $resolved['userId'],
						'siteId' => (string) ( $site['id'] ?? '' ),
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
		$saved = isset( $plan['entitiesGap'] ) && is_array( $plan['entitiesGap'] ) ? $plan['entitiesGap'] : array();
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
		$user_id = (int) ( $started['userId'] ?? 0 );
		$site_id = trim( (string) ( $started['siteId'] ?? '' ) );
		$site    = isset( $started['site'] ) && is_array( $started['site'] ) ? $started['site'] : array();
		if ( $run_id <= 0 || $team_id <= 0 || $site_id === '' ) {
			return array( 'ok' => false, 'error' => 'Missing started run context' );
		}
		$lock = 'neo_pulse_entities_gap_finish_' . $run_id;
		if ( get_transient( $lock ) ) {
			return array( 'ok' => true, 'runId' => $run_id, 'busy' => true );
		}
		set_transient( $lock, '1', 900 );
		if ( function_exists( 'ignore_user_abort' ) ) {
			ignore_user_abort( true );
		}
		@set_time_limit( 900 );

		try {
			return self::run_script_sequence( $team_id, $user_id, $run_id, $site_id, $site );
		} finally {
			delete_transient( $lock );
		}
	}

	/**
	 * @param array{source?:string,siteId?:string,teamId?:int,userId?:int,site?:array<string,mixed>} $opts
	 * @return array<string,mixed>
	 */
	public static function run( array $opts = array() ): array {
		$resolved = self::resolve_run_context( $opts );
		if ( empty( $resolved['ok'] ) ) {
			return $resolved;
		}
		$results = array();
		foreach ( $resolved['sites'] as $site ) {
			$started = self::start(
				array(
					'source' => (string) $resolved['source'],
					'siteId' => (string) ( $site['id'] ?? '' ),
					'teamId' => (int) $resolved['teamId'],
					'userId' => (int) $resolved['userId'],
					'site'   => $site,
				)
			);
			if ( empty( $started['ok'] ) ) {
				$results[] = $started;
				continue;
			}
			$results[] = self::finish( $started );
		}
		$ok = true;
		foreach ( $results as $row ) {
			if ( empty( $row['ok'] ) ) {
				$ok = false;
				break;
			}
		}
		return array( 'ok' => $ok, 'results' => $results );
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
		$name    = trim( (string) ( $site['name'] ?? $site_id ) );
		$existing = Neo_Pulse_App_Agent_Runs_Store::find_active_run_for_site( $team_id, self::RECIPE_KEY, $site_id );
		if ( is_array( $existing ) && ! empty( $existing['id'] ) ) {
			return array(
				'ok'             => true,
				'runId'          => (int) $existing['id'],
				'alreadyRunning' => true,
			);
		}
		$run = Neo_Pulse_App_Agent_Runs_Store::create_run(
			$team_id,
			$user_id,
			array(
				'recipeKey' => self::RECIPE_KEY,
				'title'     => 'Entities content gap: ' . $name,
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
			return array( 'ok' => false, 'error' => 'Could not create Entities content gap run' );
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
		$sites  = ( is_array( $posted ) && trim( (string) ( $posted['id'] ?? $posted['siteUrl'] ?? '' ) ) !== '' )
			? array( self::merge_site_from_mirror( $posted ) )
			: self::sites_for_run( $site_id );
		if ( count( $sites ) === 0 ) {
			return array( 'ok' => false, 'error' => 'No site for Entities Content Gap Check' );
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
	private static function merge_site_from_mirror( array $posted ): array {
		$id = trim( (string) ( $posted['id'] ?? '' ) );
		if ( $id === '' ) {
			return $posted;
		}
		foreach ( self::sites_for_run( $id ) as $site ) {
			return array_merge( $site, $posted );
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

	/**
	 * @param array<string,mixed> $site
	 * @return array<string,mixed>
	 */
	private static function run_script_sequence( int $team_id, int $user_id, int $run_id, string $site_id, array $site ): array {
		self::step( $team_id, $run_id, 'count', 'Counting next month SAP pages...', 'running' );

		$work = self::work_dir( $run_id );
		$count = Neo_Pulse_App_Entities_Content_Gap_Pipeline::build_count( $site );
		if ( is_wp_error( $count ) ) {
			return self::fail_run( $team_id, $run_id, $count->get_error_message(), 4 );
		}
		file_put_contents( $work . '/count.json', wp_json_encode( $count ) );

		if ( ! empty( $count['goalMet'] ) || (int) ( $count['gap'] ?? 0 ) === 0 ) {
			self::step( $team_id, $run_id, 'count', 'Target met for next month', 'done' );
			Neo_Pulse_App_Agent_Runs_Store::patch_run(
				$team_id,
				$run_id,
				array(
					'status' => 'done',
					'result' => array(
						'executionMode' => 'server',
						'goalMet'       => true,
						'created'       => 0,
						'count'         => $count,
						'message'       => 'Next month already meets the SAP package quota.',
					),
					'step'   => array(
						'label'   => 'Target met',
						'status'  => 'done',
						'stepKey' => 'complete',
					),
				)
			);
			return array( 'ok' => true, 'runId' => $run_id, 'goalMet' => true, 'created' => 0 );
		}

		$gap = (int) ( $count['gap'] ?? 0 );
		self::step(
			$team_id,
			$run_id,
			'count',
			'Gap ' . $gap . ' for ' . (string) $count['month'],
			'done'
		);

		Neo_Pulse_App_Agent_Runs_Store::patch_run(
			$team_id,
			$run_id,
			array(
				'status' => 'done',
				'result' => array(
					'executionMode'   => 'server',
					'goalMet'         => false,
					'gap'             => $gap,
					'entityPageCount'       => $gap,
					'entitiesPackageFill' => true,
					'count'           => $count,
					'message'         => 'Entities package fill background',
				),
				'step'   => array(
					'label'   => 'Entities package fill background',
					'status'  => 'done',
					'stepKey' => 'complete',
				),
			)
		);
		return array(
			'ok'        => true,
			'runId'     => $run_id,
			'gap'       => $gap,
			'entityPageCount' => $gap,
		);
	}

	/**
	 * @param array<string,mixed> $count
	 * @return array<string,mixed>|WP_Error
	 */
	private static function ask_schedule_plan( array $count ) {
		$rules  = Neo_Pulse_App_Entities_Content_Gap_Pipeline::schedule_rules_text();
		$system = 'Return one JSON object only: {"publishDates":["YYYY-MM-DD"],"publishTime":"HH:MM"}. '
			. 'Follow the schedule rules in the user message. Never use an em dash.';
		$user   = $rules . "\n\nCount JSON:\n" . wp_json_encode( $count );
		$model  = Neo_Pulse_App_Openrouter_Agent_Models::resolve( Neo_Pulse_App_Openrouter_Agent_Models::CATEGORY_BLOG );
		$raw    = self::openrouter_json( $model, $system, $user );
		if ( is_wp_error( $raw ) ) {
			return $raw;
		}
		if ( ! isset( $raw['publishDates'] ) || ! isset( $raw['publishTime'] ) ) {
			return new WP_Error( 'neo-pulse_posts_gap_plan', 'Schedule model reply missing publishDates or publishTime' );
		}
		return array(
			'publishDates' => $raw['publishDates'],
			'publishTime'  => $raw['publishTime'],
		);
	}

	/**
	 * @return array<string,mixed>|WP_Error
	 */
	private static function openrouter_json( string $model, string $system, string $user ) {
		$api_key = class_exists( 'Neo_Pulse_App_Secrets' ) ? Neo_Pulse_App_Secrets::openrouter_api_key() : '';
		if ( $api_key === '' ) {
			return new WP_Error( 'neo-pulse_openrouter', 'OpenRouter API key is not configured on the server' );
		}
		$headers = class_exists( 'Neo_Pulse_App_Openrouter_Attribution' )
			? Neo_Pulse_App_Openrouter_Attribution::request_headers( $api_key )
			: array(
				'Authorization' => 'Bearer ' . $api_key,
				'Content-Type'  => 'application/json',
			);
		$res = wp_remote_post(
			'https://openrouter.ai/api/v1/chat/completions',
			array(
				'timeout' => 90,
				'headers' => $headers,
				'body'    => wp_json_encode(
					array(
						'model'           => $model,
						'temperature'     => 0.3,
						'max_tokens'      => 512,
						'response_format' => array( 'type' => 'json_object' ),
						'messages'        => array(
							array(
								'role'    => 'system',
								'content' => $system,
							),
							array(
								'role'    => 'user',
								'content' => $user,
							),
						),
					)
				),
			)
		);
		if ( is_wp_error( $res ) ) {
			return $res;
		}
		$code = (int) wp_remote_retrieve_response_code( $res );
		$body = (string) wp_remote_retrieve_body( $res );
		if ( $code < 200 || $code >= 300 ) {
			return new WP_Error( 'neo-pulse_openrouter_http', 'OpenRouter HTTP ' . $code );
		}
		$decoded = json_decode( $body, true );
		$content = is_array( $decoded ) ? (string) ( $decoded['choices'][0]['message']['content'] ?? '' ) : '';
		$parsed  = json_decode( $content, true );
		if ( ! is_array( $parsed ) ) {
			return new WP_Error( 'neo-pulse_openrouter_json', 'OpenRouter reply was not JSON' );
		}
		return $parsed;
	}

	private static function work_dir( int $run_id ): string {
		$dir = Neo_Pulse_App_Data_Paths::root() . '/entities-content-gap/' . (int) $run_id;
		if ( ! is_dir( $dir ) ) {
			wp_mkdir_p( $dir );
		}
		return $dir;
	}

	private static function step( int $team_id, int $run_id, string $key, string $label, string $status ): void {
		Neo_Pulse_App_Agent_Runs_Store::patch_run(
			$team_id,
			$run_id,
			array(
				'step' => array(
					'label'   => $label,
					'status'  => $status,
					'stepKey' => $key,
				),
			)
		);
	}

	/**
	 * @return array<string,mixed>
	 */
	private static function fail_run( int $team_id, int $run_id, string $message, int $exit_hint ): array {
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
}
