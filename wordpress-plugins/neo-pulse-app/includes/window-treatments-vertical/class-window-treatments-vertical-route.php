<?php
/**
 * /api/window-treatments-vertical/* — live-prompt for Details drawer.
 *
 * @package Neo_Pulse_App
 */

defined( 'ABSPATH' ) || exit;

class Neo_Pulse_App_Window_Treatments_Vertical_Route {

	/**
	 * @param string              $subpath Route after window-treatments-vertical/.
	 * @param string              $method  HTTP method.
	 * @param array<string,mixed> $body    JSON body.
	 */
	public static function dispatch_http( string $subpath, string $method, array $body ): void {
		$user = Neo_Pulse_App_Auth_Session::require_user();
		if ( ! $user ) {
			return;
		}
		unset( $body );
		$subpath = trim( $subpath, '/' );
		if ( $method === 'GET' && ( $subpath === 'live-prompt' || $subpath === '' ) ) {
			$live = '';
			if ( class_exists( 'Neo_Pulse_App_Window_Treatments_Vertical_Inject' ) ) {
				$live = Neo_Pulse_App_Window_Treatments_Vertical_Inject::live_prompt_text();
			}
			Neo_Pulse_App_Api_Dispatcher::send_json(
				array(
					'ok'         => true,
					'livePrompt' => $live,
					'updatedAt'  => '',
				)
			);
			return;
		}
		Neo_Pulse_App_Api_Dispatcher::send_json(
			array(
				'ok'    => false,
				'error' => 'Unknown window-treatments-vertical route',
				'path'  => 'window-treatments-vertical/' . $subpath,
			),
			404
		);
	}
}
