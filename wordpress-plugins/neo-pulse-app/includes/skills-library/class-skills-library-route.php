<?php
/**
 * /api/skills-library/* — GET skill JSON library, PUT one editable file.
 *
 * @package Neo_Pulse_App
 */

defined( 'ABSPATH' ) || exit;

class Neo_Pulse_App_Skills_Library_Route {

	/**
	 * @param string              $subpath Route after skills-library/.
	 * @param string              $method  HTTP method.
	 * @param array<string,mixed> $body    JSON body.
	 */
	public static function dispatch_http( string $subpath, string $method, array $body ): void {
		$user = Neo_Pulse_App_Auth_Session::require_user();
		if ( ! $user ) {
			Neo_Pulse_App_Api_Dispatcher::send_json( array( 'ok' => false, 'error' => 'Unauthorized' ), 401 );
			return;
		}

		$subpath = trim( $subpath, '/' );
		$method  = strtoupper( $method );
		$parts   = $subpath === '' ? array() : explode( '/', $subpath );

		if ( count( $parts ) === 1 && $method === 'GET' ) {
			$skill_id = Neo_Pulse_App_Skills_Library_Store::resolve_skill_id( $parts[0] );
			if ( is_wp_error( $skill_id ) ) {
				Neo_Pulse_App_Api_Dispatcher::send_json(
					array( 'ok' => false, 'error' => $skill_id->get_error_message() ),
					(int) ( $skill_id->get_error_data()['status'] ?? 404 )
				);
				return;
			}
			$bundle = Neo_Pulse_App_Skills_Library_Store::get_skill( $skill_id );
			if ( is_wp_error( $bundle ) ) {
				$status = is_array( $bundle->get_error_data() )
					? (int) ( $bundle->get_error_data()['status'] ?? 500 )
					: 500;
				Neo_Pulse_App_Api_Dispatcher::send_json(
					array( 'ok' => false, 'error' => $bundle->get_error_message() ),
					$status
				);
				return;
			}
			Neo_Pulse_App_Api_Dispatcher::send_json(
				array(
					'ok'      => true,
					'skillId' => $skill_id,
					'files'   => $bundle,
				)
			);
			return;
		}

		if ( count( $parts ) === 2 && $method === 'PUT' ) {
			$skill_id = Neo_Pulse_App_Skills_Library_Store::resolve_skill_id( $parts[0] );
			if ( is_wp_error( $skill_id ) ) {
				Neo_Pulse_App_Api_Dispatcher::send_json(
					array( 'ok' => false, 'error' => $skill_id->get_error_message() ),
					(int) ( $skill_id->get_error_data()['status'] ?? 404 )
				);
				return;
			}
			$document = isset( $body['document'] ) && is_array( $body['document'] ) ? $body['document'] : null;
			if ( $document === null ) {
				Neo_Pulse_App_Api_Dispatcher::send_json(
					array( 'ok' => false, 'error' => 'Body requires document object' ),
					400
				);
				return;
			}
			$result = Neo_Pulse_App_Skills_Library_Store::put_file( $skill_id, $parts[1], $document );
			if ( is_wp_error( $result ) ) {
				$status = is_array( $result->get_error_data() )
					? (int) ( $result->get_error_data()['status'] ?? 500 )
					: 500;
				Neo_Pulse_App_Api_Dispatcher::send_json(
					array( 'ok' => false, 'error' => $result->get_error_message() ),
					$status
				);
				return;
			}
			$bundle = Neo_Pulse_App_Skills_Library_Store::get_skill( $skill_id );
			if ( is_wp_error( $bundle ) ) {
				Neo_Pulse_App_Api_Dispatcher::send_json(
					array( 'ok' => false, 'error' => $bundle->get_error_message() ),
					500
				);
				return;
			}
			Neo_Pulse_App_Api_Dispatcher::send_json(
				array(
					'ok'      => true,
					'skillId' => $skill_id,
					'files'   => $bundle,
				)
			);
			return;
		}

		Neo_Pulse_App_Api_Dispatcher::send_json( array( 'ok' => false, 'error' => 'Not found' ), 404 );
	}
}
