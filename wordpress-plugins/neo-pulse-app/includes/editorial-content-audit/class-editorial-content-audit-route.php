<?php
/**
 * POST /api/editorial-content-audit/run — property Skills Run for one site.
 *
 * @package Neo_Pulse_App
 */

defined( 'ABSPATH' ) || exit;

class Neo_Pulse_App_Editorial_Content_Audit_Route {

	/**
	 * @param string              $subpath Route after editorial-content-audit/.
	 * @param string              $method  HTTP method.
	 * @param array<string,mixed> $body    JSON body.
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
			$to      = trim( (string) ( $body['to'] ?? '' ) );
			$opts    = array(
				'source' => 'pulse_assist',
				'siteId' => $site_id,
				'teamId' => $team_id,
				'userId' => (int) ( $user['id'] ?? 0 ),
				'to'     => $to !== '' ? $to : Neo_Pulse_App_Editorial_Content_Audit_Schedule::DEFAULT_TO,
				'site'   => array(
					'id'               => $site_id,
					'name'             => trim( (string) ( $body['siteName'] ?? '' ) ),
					'siteUrl'          => trim( (string) ( $body['siteUrl'] ?? '' ) ),
					'username'         => trim( (string) ( $body['username'] ?? '' ) ),
					'appPassword'      => (string) ( $body['appPassword'] ?? '' ),
					'entitySitemapUrl' => trim( (string) ( $body['entitySitemapUrl'] ?? '' ) ),
					'manualEndpoint'   => trim( (string) ( $body['manualEndpoint'] ?? '' ) ),
					'serviceCity'      => trim( (string) ( $body['serviceCity'] ?? '' ) ),
					'serviceState'     => trim( (string) ( $body['serviceState'] ?? '' ) ),
					'serviceCountry'   => trim( (string) ( $body['serviceCountry'] ?? '' ) ),
					'locations'        => isset( $body['locations'] ) && is_array( $body['locations'] ) ? $body['locations'] : array(),
					'napInfo'          => isset( $body['napInfo'] ) && is_array( $body['napInfo'] ) ? $body['napInfo'] : array(),
				),
			);

			$started = Neo_Pulse_App_Editorial_Content_Audit_Runner::start( $opts );
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
			@set_time_limit( 900 );

			Neo_Pulse_App_Editorial_Content_Audit_Runner::finish( $started );
			return;
		}

		Neo_Pulse_App_Api_Dispatcher::send_json( array( 'error' => 'Not found' ), 404 );
	}
}
