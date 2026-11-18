<?php
/**
 * /api/google-seo-updates/* — archive, live-prompt, generate.
 *
 * @package Neo_Pulse_App
 */

defined( 'ABSPATH' ) || exit;

class Neo_Pulse_App_Google_Seo_Updates_Route {

	/**
	 * @param string               $subpath Route after google-seo-updates/.
	 * @param string               $method  HTTP method.
	 * @param array<string,mixed>  $body    JSON body.
	 */
	public static function dispatch_http( string $subpath, string $method, array $body ): void {
		$user = Neo_Pulse_App_Auth_Session::require_user();
		if ( ! $user ) {
			return;
		}
		$subpath = trim( $subpath, '/' );
		if ( $method === 'GET' && ( $subpath === 'archive' || $subpath === '' ) ) {
			$state = Neo_Pulse_App_Google_Seo_Updates_Runner::load_state();
			Neo_Pulse_App_Api_Dispatcher::send_json(
				array(
					'ok'    => true,
					'state' => Neo_Pulse_App_Google_Seo_Updates_Runner::public_state( $state ),
				)
			);
			return;
		}
		if ( $method === 'GET' && $subpath === 'live-prompt' ) {
			$state = Neo_Pulse_App_Google_Seo_Updates_Runner::load_state();
			Neo_Pulse_App_Api_Dispatcher::send_json(
				array(
					'ok'         => true,
					'livePrompt' => (string) ( $state['livePrompt'] ?? '' ),
					'updatedAt'  => (string) ( $state['updatedAt'] ?? '' ),
				)
			);
			return;
		}
		if ( $method === 'POST' && $subpath === 'generate' ) {
			@set_time_limit( 300 );
			$result = Neo_Pulse_App_Google_Seo_Updates_Runner::run(
				array(
					'force'    => true,
					'fromCron' => false,
				)
			);
			if ( is_wp_error( $result ) ) {
				Neo_Pulse_App_Api_Dispatcher::send_json(
					array(
						'ok'    => false,
						'error' => $result->get_error_message(),
					),
					is_array( $result->get_error_data() ) && isset( $result->get_error_data()['status'] )
						? (int) $result->get_error_data()['status']
						: 500
				);
				return;
			}
			Neo_Pulse_App_Api_Dispatcher::send_json( $result );
			return;
		}
		Neo_Pulse_App_Api_Dispatcher::send_json(
			array(
				'ok'    => false,
				'error' => 'Unknown google-seo-updates route',
				'path'  => 'google-seo-updates/' . $subpath,
			),
			404
		);
	}
}
