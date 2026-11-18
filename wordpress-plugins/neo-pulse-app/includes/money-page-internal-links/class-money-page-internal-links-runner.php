<?php
/**
 * Money-page internal links runner: inventory → GSC → plan → Neo MCP → email Sean.
 *
 * @package Neo_Pulse_App
 */

defined( 'ABSPATH' ) || exit;

class Neo_Pulse_App_Money_Page_Internal_Links_Runner {

	const RECIPE_KEY = 'money_page_internal_links';
	const AGENT_ID   = 'content.internal-links.money-pages';

	/**
	 * @return array<string,mixed>
	 */
	public static function run_scheduled(): array {
		$schedule = Neo_Pulse_App_Money_Page_Internal_Links_Schedule::load();
		if ( empty( $schedule['enabled'] ) ) {
			return array( 'ok' => true, 'skipped' => true, 'reason' => 'not_due' );
		}
		if ( ! Neo_Pulse_App_Money_Page_Internal_Links_Schedule::is_library_enabled() ) {
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
						'to'     => (string) ( Neo_Pulse_App_Money_Page_Internal_Links_Schedule::load()['to'] ?? Neo_Pulse_App_Money_Page_Internal_Links_Schedule::DEFAULT_TO ),
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
			$to = (string) ( Neo_Pulse_App_Money_Page_Internal_Links_Schedule::load()['to'] ?? Neo_Pulse_App_Money_Page_Internal_Links_Schedule::DEFAULT_TO );
		}
		Neo_Pulse_App_Agent_Runs_Store::patch_run(
			(int) $resolved['teamId'],
			(int) $run['runId'],
			array(
				'plan' => array(
					'executionMode' => 'server',
					'moneyPageLinks' => array(
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
	 * @param array<string,mixed> $started
	 * @return array<string,mixed>
	 */
	public static function finish( array $started ): array {
		$run_id  = (int) ( $started['runId'] ?? 0 );
		$team_id = (int) ( $started['teamId'] ?? 0 );
		$site_id = trim( (string) ( $started['siteId'] ?? '' ) );
		$site    = isset( $started['site'] ) && is_array( $started['site'] ) ? $started['site'] : array();
		$to      = (string) ( $started['to'] ?? Neo_Pulse_App_Money_Page_Internal_Links_Schedule::DEFAULT_TO );
		if ( $run_id <= 0 || $team_id <= 0 || $site_id === '' ) {
			return array( 'ok' => false, 'error' => 'Missing started run context' );
		}
		$lock = 'neo_pulse_mplinks_finish_' . $run_id;
		if ( get_transient( $lock ) ) {
			return array( 'ok' => true, 'runId' => $run_id, 'busy' => true );
		}
		set_transient( $lock, '1', 900 );
		if ( function_exists( 'ignore_user_abort' ) ) {
			ignore_user_abort( true );
		}
		@set_time_limit( 900 );

		try {
			return self::run_sequence( $team_id, $run_id, $site_id, $site, $to );
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
				'title'     => 'Money page links: ' . $name,
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
			return array( 'ok' => false, 'error' => 'Could not create money page links run' );
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

		// Same as Safe Fix: profile Run posts the open profile record; use it when siteUrl is present.
		$posted = isset( $opts['site'] ) && is_array( $opts['site'] ) ? $opts['site'] : null;
		$sites  = ( is_array( $posted ) && trim( (string) ( $posted['siteUrl'] ?? '' ) ) !== '' )
			? array( $posted )
			: self::sites_for_run( $site_id );
		if ( count( $sites ) === 0 ) {
			return array( 'ok' => false, 'error' => 'No site for Money Page Internal Links' );
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
	private static function run_sequence( int $team_id, int $run_id, string $site_id, array $site, string $to ): array {
		self::step( $team_id, $run_id, 'inventory', 'Loading money and blog sitemaps...', 'running' );
		$inventory = Neo_Pulse_App_Money_Page_Internal_Links_Pipeline::build_inventory( $site );
		if ( is_wp_error( $inventory ) ) {
			return self::fail_run( $team_id, $run_id, $inventory->get_error_message(), 3 );
		}
		if ( ! empty( $inventory['goalMet'] ) ) {
			$msg = (string) ( $inventory['message'] ?? 'Nothing to link' );
			self::step( $team_id, $run_id, 'inventory', $msg, 'done' );
			Neo_Pulse_App_Agent_Runs_Store::patch_run(
				$team_id,
				$run_id,
				array(
					'status' => 'done',
					'result' => array(
						'executionMode' => 'server',
						'goalMet'       => true,
						'inventory'     => $inventory,
						'email'         => false,
						'message'       => $msg,
					),
					'step'   => array(
						'label'   => 'Done',
						'status'  => 'done',
						'stepKey' => 'complete',
					),
				)
			);
			return array( 'ok' => true, 'runId' => $run_id, 'goalMet' => true );
		}

		self::step( $team_id, $run_id, 'gsc', 'Fetching GSC queries for money pages...', 'running' );
		$inventory = Neo_Pulse_App_Money_Page_Internal_Links_Pipeline::attach_gsc_queries( $site, $inventory );
		if ( is_wp_error( $inventory ) ) {
			return self::fail_run( $team_id, $run_id, $inventory->get_error_message(), 4 );
		}

		self::step( $team_id, $run_id, 'plan', 'Planning money → support links...', 'running' );
		$plan = Neo_Pulse_App_Money_Page_Internal_Links_Pipeline::plan_links( $inventory );
		if ( is_wp_error( $plan ) ) {
			return self::fail_run( $team_id, $run_id, $plan->get_error_message(), 5 );
		}
		$links = isset( $plan['links'] ) && is_array( $plan['links'] ) ? $plan['links'] : array();

		$applied = array();
		$failed  = array();
		$skipped = array();
		$min     = Neo_Pulse_App_Money_Page_Internal_Links_Pipeline::MIN_APPLIED_LINKS;
		$target  = Neo_Pulse_App_Money_Page_Internal_Links_Pipeline::TARGET_APPLIED_LINKS;
		if ( count( $links ) > 0 ) {
			if ( Neo_Pulse_App_Agent_Runs_Store::is_cancelled( $team_id, $run_id ) ) {
				return array(
					'ok'        => true,
					'runId'     => $run_id,
					'cancelled' => true,
				);
			}
			self::step(
				$team_id,
				$run_id,
				'apply',
				'Writing links via Neo MCP (need ' . $min . '-' . $target . ' applied)...',
				'running'
			);
			$write = Neo_Pulse_App_Money_Page_Internal_Links_Pipeline::apply_links( $site, $links );
			if ( is_wp_error( $write ) ) {
				return self::fail_run( $team_id, $run_id, $write->get_error_message(), 6 );
			}
			$applied = $write['applied'];
			$failed  = $write['failed'];
			$skipped = $write['skipped'];
		}

		// Require a full batch of confirmed Neo MCP writes before emailing.
		if ( count( $applied ) < $min ) {
			$reason = self::no_apply_reason( $failed, $skipped, count( $links ) );
			if ( count( $applied ) > 0 ) {
				$reason = 'Only ' . count( $applied ) . ' links applied; need at least ' . $min . '. ' . $reason;
			}
			return self::fail_run( $team_id, $run_id, $reason, 7 );
		}

		self::step( $team_id, $run_id, 'email', 'Sending follow-up report...', 'running' );
		$email = Neo_Pulse_App_Money_Page_Internal_Links_Mail::send_summary(
			$to,
			(string) ( $site['name'] ?? $site_id ),
			$site_id,
			$applied,
			$failed,
			$skipped,
			(int) ( $inventory['moneyCount'] ?? 0 ),
			count( $links )
		);
		if ( empty( $email['ok'] ) ) {
			$mail_err = (string) ( $email['error'] ?? 'Email was not sent' );
			Neo_Pulse_App_Agent_Runs_Store::patch_run(
				$team_id,
				$run_id,
				array(
					'status'       => 'failed',
					'errorMessage' => $mail_err,
					'result'       => array(
						'executionMode' => 'server',
						'planned'       => count( $links ),
						'applied'       => count( $applied ),
						'failed'        => count( $failed ),
						'skipped'       => count( $skipped ),
						'rows'          => array_merge( $applied, $skipped, $failed ),
						'email'         => false,
						'emailError'    => $mail_err,
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

		Neo_Pulse_App_Agent_Runs_Store::patch_run(
			$team_id,
			$run_id,
			array(
				'status'       => 'done',
				'errorMessage' => null,
				'result'       => array(
					'executionMode' => 'server',
					'planned'       => count( $links ),
					'applied'       => count( $applied ),
					'failed'        => count( $failed ),
					'skipped'       => count( $skipped ),
					'links'         => $links,
					'rows'          => array_merge( $applied, $skipped, $failed ),
					'email'         => true,
					'inventory'     => array(
						'moneyCount' => (int) ( $inventory['moneyCount'] ?? 0 ),
						'blogCount'  => (int) ( $inventory['blogCount'] ?? 0 ),
					),
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
			'applied' => count( $applied ),
			'failed'  => count( $failed ),
			'email'   => $email,
		);
	}

	/**
	 * @param array<int,array<string,mixed>> $failed
	 * @param array<int,array<string,mixed>> $skipped
	 */
	private static function no_apply_reason( array $failed, array $skipped, int $planned ): string {
		if ( $planned === 0 ) {
			return 'OpenRouter returned no valid links against the inventory';
		}
		if ( count( $failed ) > 0 ) {
			$first = $failed[0];
			$err   = trim( (string) ( is_array( $first ) ? ( $first['error'] ?? '' ) : '' ) );
			return $err !== ''
				? $err
				: ( count( $failed ) . ' link writes failed' );
		}
		if ( count( $skipped ) > 0 ) {
			$first = $skipped[0];
			$err   = trim( (string) ( is_array( $first ) ? ( $first['error'] ?? '' ) : '' ) );
			return $err !== ''
				? $err
				: ( count( $skipped ) . ' links skipped; none applied' );
		}
		return 'Neo MCP did not confirm a link write; email withheld';
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
