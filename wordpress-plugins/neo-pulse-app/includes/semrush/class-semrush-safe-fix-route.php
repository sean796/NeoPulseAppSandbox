<?php
/**
 * POST /api/semrush-safe-fix/run — wrench / manual start for one site or all.
 *
 * @package Neo_Pulse_App
 */

defined( 'ABSPATH' ) || exit;

class Neo_Pulse_App_Semrush_Safe_Fix_Route {

	/**
	 * @param string               $subpath Route after semrush-safe-fix/.
	 * @param string               $method  HTTP method.
	 * @param array<string,mixed>  $body    JSON body.
	 */
	public static function dispatch_http( string $subpath, string $method, array $body ): void {
		$user = Neo_Pulse_App_Auth_Session::require_user();
		if ( ! $user ) {
			Neo_Pulse_App_Api_Dispatcher::send_json( array( 'error' => 'Unauthorized' ), 401 );
			return;
		}

		$subpath = trim( $subpath, '/' );
		if ( $subpath === 'run' && strtoupper( $method ) === 'POST' ) {
			$site_id = trim( (string) ( $body['siteId'] ?? '' ) );
			$team_id = (int) ( $body['teamId'] ?? 0 );
			$opts    = array(
				'source' => 'pulse_assist',
				'siteId' => $site_id,
				'teamId' => $team_id,
				'userId' => (int) ( $user['id'] ?? 0 ),
				'site'   => array(
					'id'                        => $site_id,
					'name'                      => trim( (string) ( $body['siteName'] ?? '' ) ),
					'siteUrl'                   => trim( (string) ( $body['siteUrl'] ?? '' ) ),
					'username'                  => trim( (string) ( $body['username'] ?? '' ) ),
					'appPassword'               => (string) ( $body['appPassword'] ?? '' ),
					'semrushSiteAuditProjectId' => trim( (string) ( $body['semrushSiteAuditProjectId'] ?? '' ) ),
				),
			);

			// Create the Task Manager row first, answer immediately, then finish the work.
			$started = Neo_Pulse_App_Semrush_Safe_Fix_Runner::start( $opts );
			if ( empty( $started['ok'] ) || empty( $started['runId'] ) ) {
				Neo_Pulse_App_Api_Dispatcher::send_json( $started, 500 );
				return;
			}

			Neo_Pulse_App_Api_Dispatcher::send_json(
				array(
					'ok'      => true,
					'started' => true,
					'runId'   => (int) $started['runId'],
					'runIds'  => array( (int) $started['runId'] ),
				),
				202
			);

			if ( function_exists( 'fastcgi_finish_request' ) ) {
				fastcgi_finish_request();
			}
			if ( function_exists( 'ignore_user_abort' ) ) {
				ignore_user_abort( true );
			}
			@set_time_limit( 600 );

			Neo_Pulse_App_Semrush_Safe_Fix_Runner::finish( $started );
			return;
		}

		Neo_Pulse_App_Api_Dispatcher::send_json( array( 'error' => 'Not found' ), 404 );
	}
}
