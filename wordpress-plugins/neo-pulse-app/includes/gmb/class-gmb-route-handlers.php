<?php
/**
 * REST route handlers for /api/gmb/* (Node-compatible JSON shapes).
 *
 * @package Neo_Pulse_App
 */

defined( 'ABSPATH' ) || exit;

class Neo_Pulse_App_Gmb_Route_Handlers {

	/**
	 * HTTP dispatch from Neo_Pulse_App_Api_Dispatcher.
	 *
	 * @param string              $subpath Route after gmb/.
	 * @param string              $method  HTTP method.
	 * @param array<string,mixed> $body    JSON body.
	 */
	public static function dispatch_http( string $subpath, string $method, array $body ): void {
		$subpath = trim( $subpath, '/' );
		$method  = strtoupper( $method );

		if ( $subpath === 'config-status' && $method === 'GET' ) {
			if ( ! headers_sent() ) {
				header( 'Cache-Control: no-store, no-cache, must-revalidate, max-age=0' );
				header( 'Pragma: no-cache' );
			}
			Neo_Pulse_App_Api_Dispatcher::send_json( Neo_Pulse_App_Gmb_Oauth::config_status() );
			return;
		}

		if ( $subpath === 'save-config' && $method === 'POST' ) {
			$result = Neo_Pulse_App_Gmb_Oauth::save_config( $body );
			Neo_Pulse_App_Api_Dispatcher::send_json( $result['body'], $result['statusCode'] );
			return;
		}

		if ( $subpath === 'test-and-save' && $method === 'POST' ) {
			$result = Neo_Pulse_App_Gmb_Oauth::test_and_save( $body );
			Neo_Pulse_App_Api_Dispatcher::send_json( $result['body'], $result['statusCode'] );
			return;
		}

		if ( $subpath === 'authorize' && $method === 'GET' ) {
			Neo_Pulse_App_Gmb_Oauth::authorize_redirect();
			return;
		}

		if ( $subpath === 'callback' && $method === 'GET' ) {
			$query = array();
			foreach ( array( 'code', 'error', 'state' ) as $key ) {
				if ( isset( $_GET[ $key ] ) ) {
					$query[ $key ] = sanitize_text_field( wp_unslash( (string) $_GET[ $key ] ) );
				}
			}
			Neo_Pulse_App_Gmb_Oauth::handle_callback( $query );
			return;
		}

		if ( $subpath === 'status' && $method === 'GET' ) {
			Neo_Pulse_App_Api_Dispatcher::send_json( Neo_Pulse_App_Gmb_Oauth::connection_status() );
			return;
		}

		if ( $subpath === 'test' && $method === 'POST' ) {
			$result = Neo_Pulse_App_Gmb_Oauth::test_connection();
			Neo_Pulse_App_Api_Dispatcher::send_json( $result['body'], $result['statusCode'] );
			return;
		}

		if ( $subpath === 'performance' && $method === 'POST' ) {
			$result = Neo_Pulse_App_Gmb_Performance::performance( $body );
			Neo_Pulse_App_Api_Dispatcher::send_json( $result['body'], $result['statusCode'] );
			return;
		}

		if ( $subpath === 'posts-inventory' && $method === 'POST' ) {
			$result = Neo_Pulse_App_Gmb_Posts::posts_inventory( $body );
			Neo_Pulse_App_Api_Dispatcher::send_json( $result['body'], $result['statusCode'] );
			return;
		}

		if ( $subpath === 'pick-blog-post' && $method === 'POST' ) {
			$result = Neo_Pulse_App_Gmb_Posts::pick_blog_post( $body );
			Neo_Pulse_App_Api_Dispatcher::send_json( $result['body'], $result['statusCode'] );
			return;
		}

		if ( $subpath === 'publish-from-harness' && $method === 'POST' ) {
			$result = Neo_Pulse_App_Gmb_Posts::publish_from_harness( $body );
			Neo_Pulse_App_Api_Dispatcher::send_json( $result['body'], $result['statusCode'] );
			return;
		}

		if ( $subpath === 'process-schedule-queue' && $method === 'POST' ) {
			$result = Neo_Pulse_App_Gmb_Posts::process_schedule_queue();
			Neo_Pulse_App_Api_Dispatcher::send_json( $result['body'], $result['statusCode'] );
			return;
		}

		if ( $subpath === 'recommend-categories' && $method === 'POST' ) {
			$result = Neo_Pulse_App_Gmb_Categories::recommend( $body );
			Neo_Pulse_App_Api_Dispatcher::send_json( $result['body'], $result['statusCode'] );
			return;
		}

		if ( $subpath === 'apply-categories' && $method === 'POST' ) {
			$result = Neo_Pulse_App_Gmb_Categories::apply( $body );
			Neo_Pulse_App_Api_Dispatcher::send_json( $result['body'], $result['statusCode'] );
			return;
		}

		if ( $subpath === 'write-categories' && $method === 'POST' ) {
			$result = Neo_Pulse_App_Gmb_Categories::write( $body );
			Neo_Pulse_App_Api_Dispatcher::send_json( $result['body'], $result['statusCode'] );
			return;
		}

		if ( $subpath === 'generate-social-copy' && $method === 'POST' ) {
			Neo_Pulse_App_Api_Dispatcher::send_json(
				array(
					'success' => false,
					'error'   => 'generate-social-copy is not implemented in neo-pulse-app yet.',
				),
				501
			);
			return;
		}

		Neo_Pulse_App_Api_Dispatcher::send_json(
			array(
				'error' => 'Not found',
				'path'  => 'gmb/' . $subpath,
			),
			404
		);
	}
}
