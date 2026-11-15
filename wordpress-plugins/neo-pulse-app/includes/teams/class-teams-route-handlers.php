<?php
/**
 * /api/teams/* route handlers.
 *
 * @package Neo_Pulse_App
 */

defined( 'ABSPATH' ) || exit;

class Neo_Pulse_App_Teams_Route_Handlers {

	/**
	 * @param string              $route  Route after teams/.
	 * @param string              $method HTTP method.
	 * @param array<string,mixed> $body   JSON body.
	 */
	public static function dispatch( string $route, string $method, array $body ): void {
		$route  = trim( $route, '/' );
		$method = strtoupper( $method );

		if ( preg_match( '#^invites/accept$#', $route ) && $method === 'GET' ) {
			$token = isset( $_GET['token'] ) ? (string) wp_unslash( $_GET['token'] ) : '';
			Neo_Pulse_App_Api_Dispatcher::send_json( Neo_Pulse_App_Teams_Invites::validate_token( $token ) );
			return;
		}

		$user = Neo_Pulse_App_Auth_Session::require_user();
		if ( ! $user ) {
			Neo_Pulse_App_Api_Dispatcher::send_json( array( 'ok' => false, 'error' => 'Unauthorized' ), 401 );
			return;
		}
		$user_id = (int) $user['id'];

		if ( $route === '' && $method === 'GET' ) {
			$teams = Neo_Pulse_App_Teams_Store::list_teams_for_user( $user_id );
			$out   = array();
			foreach ( $teams as $row ) {
				$team = Neo_Pulse_App_Teams_Store::get_team( (int) $row['id'] );
				$mem  = Neo_Pulse_App_Teams_Store::get_membership( (int) $row['id'], $user_id );
				if ( $team && $mem ) {
					$out[] = Neo_Pulse_App_Teams_Store::format_team_payload( $team, $mem );
				}
			}
			Neo_Pulse_App_Api_Dispatcher::send_json( array( 'ok' => true, 'teams' => $out ) );
			return;
		}

		if ( $route === '' && $method === 'POST' ) {
			self::create_team( $user_id, $body );
			return;
		}

		if ( preg_match( '#^(\d+)$#', $route, $m ) ) {
			self::dispatch_team( (int) $m[1], '', $method, $body, $user_id );
			return;
		}

		if ( preg_match( '#^(\d+)/(.+)$#', $route, $m ) ) {
			self::dispatch_team( (int) $m[1], $m[2], $method, $body, $user_id );
			return;
		}

		Neo_Pulse_App_Api_Dispatcher::send_json( array( 'ok' => false, 'error' => 'Not found' ), 404 );
	}

	/**
	 * @param array<string,mixed> $body
	 */
	private static function create_team( int $user_id, array $body ): void {
		$name       = isset( $body['name'] ) ? sanitize_text_field( (string) $body['name'] ) : 'Neo Digital Inc.';
		$job_title  = isset( $body['jobTitle'] ) ? sanitize_text_field( (string) $body['jobTitle'] ) : 'Lead SEO/AI Developer';
		$team       = Neo_Pulse_App_Teams_Store::create_team( $user_id, $name, $job_title );
		Neo_Pulse_App_Auth_Session::set_active_team( (int) $team['id'] );
		Neo_Pulse_App_Api_Dispatcher::send_json( array( 'ok' => true, 'team' => $team ) );
	}

	/**
	 * @param array<string,mixed> $body
	 */
	private static function dispatch_team( int $team_id, string $sub, string $method, array $body, int $user_id ): void {
		$sub    = trim( $sub, '/' );
		$team   = Neo_Pulse_App_Teams_Store::get_team( $team_id );
		$member = Neo_Pulse_App_Teams_Store::get_membership( $team_id, $user_id );
		if ( ! $team || ! $member ) {
			Neo_Pulse_App_Api_Dispatcher::send_json( array( 'ok' => false, 'error' => 'Forbidden' ), 403 );
			return;
		}

		if ( $sub === '' && $method === 'GET' ) {
			Neo_Pulse_App_Api_Dispatcher::send_json(
				array( 'ok' => true, 'team' => Neo_Pulse_App_Teams_Store::format_team_payload( $team, $member ) )
			);
			return;
		}

		if ( $sub === '' && $method === 'PATCH' ) {
			self::patch_team( $team, $member, $body );
			return;
		}

		if ( $sub === '' && $method === 'DELETE' ) {
			if ( (string) $member['access_role'] !== 'owner' ) {
				Neo_Pulse_App_Api_Dispatcher::send_json( array( 'ok' => false, 'error' => 'Forbidden' ), 403 );
				return;
			}
			global $wpdb;
			$wpdb->delete( $wpdb->prefix . 'neo_pulse_team_members', array( 'team_id' => $team_id ), array( '%d' ) );
			$wpdb->delete( $wpdb->prefix . 'neo_pulse_team_invites', array( 'team_id' => $team_id ), array( '%d' ) );
			$wpdb->delete( $wpdb->prefix . 'neo_pulse_team_job_title_presets', array( 'team_id' => $team_id ), array( '%d' ) );
			$wpdb->delete( $wpdb->prefix . 'neo_pulse_teams', array( 'id' => $team_id ), array( '%d' ) );
			Neo_Pulse_App_Api_Dispatcher::send_json( array( 'ok' => true ) );
			return;
		}

		if ( $sub === 'switch' && $method === 'POST' ) {
			Neo_Pulse_App_Auth_Session::set_active_team( $team_id );
			Neo_Pulse_App_Api_Dispatcher::send_json(
				array( 'ok' => true, 'team' => Neo_Pulse_App_Teams_Store::format_team_payload( $team, $member ) )
			);
			return;
		}

		if ( $sub === 'members' && $method === 'GET' ) {
			Neo_Pulse_App_Api_Dispatcher::send_json(
				array( 'ok' => true, 'members' => Neo_Pulse_App_Teams_Store::list_members( $team_id ) )
			);
			return;
		}

		if ( $sub === 'members' && $method === 'POST' ) {
			if ( ! Neo_Pulse_App_Teams_Store::can_write( $member, 'teams' ) ) {
				Neo_Pulse_App_Api_Dispatcher::send_json( array( 'ok' => false, 'error' => 'Forbidden' ), 403 );
				return;
			}
			$result = Neo_Pulse_App_Teams_Store::provision_member( $team_id, $body );
			Neo_Pulse_App_Api_Dispatcher::send_json( $result, ! empty( $result['ok'] ) ? 200 : 400 );
			return;
		}

		if ( preg_match( '#^members/(\d+)$#', $sub, $mm ) ) {
			self::dispatch_member( $team_id, (int) $mm[1], $method, $body, $member, $user_id );
			return;
		}

		if ( $sub === 'job-titles' && $method === 'GET' ) {
			Neo_Pulse_App_Teams_Store::ensure_job_title_presets( $team_id );
			global $wpdb;
			$rows = $wpdb->get_results(
				$wpdb->prepare(
					'SELECT title, sort_order FROM ' . $wpdb->prefix . 'neo_pulse_team_job_title_presets WHERE team_id = %d ORDER BY sort_order ASC',
					$team_id
				),
				ARRAY_A
			);
			Neo_Pulse_App_Api_Dispatcher::send_json(
				array(
					'ok'     => true,
					'presets'=> is_array( $rows ) ? array_map(
						static function ( $r ) {
							return array(
								'title'     => (string) $r['title'],
								'sortOrder' => (int) $r['sort_order'],
							);
						},
						$rows
					) : array(),
				)
			);
			return;
		}

		if ( $sub === 'job-titles' && $method === 'POST' ) {
			if ( ! Neo_Pulse_App_Teams_Store::can_write( $member, 'teams' ) ) {
				Neo_Pulse_App_Api_Dispatcher::send_json( array( 'ok' => false, 'error' => 'Forbidden' ), 403 );
				return;
			}
			$result = Neo_Pulse_App_Teams_Store::add_job_title_preset(
				$team_id,
				isset( $body['title'] ) ? (string) $body['title'] : ''
			);
			Neo_Pulse_App_Api_Dispatcher::send_json( $result, ! empty( $result['ok'] ) ? 200 : 400 );
			return;
		}

		if ( $sub === 'invites' && $method === 'GET' ) {
			Neo_Pulse_App_Api_Dispatcher::send_json(
				array( 'ok' => true, 'invites' => Neo_Pulse_App_Teams_Invites::list_pending( $team_id ) )
			);
			return;
		}

		if ( $sub === 'invites' && $method === 'POST' ) {
			if ( ! Neo_Pulse_App_Teams_Store::can_write( $member, 'teams' ) ) {
				Neo_Pulse_App_Api_Dispatcher::send_json( array( 'ok' => false, 'error' => 'Forbidden' ), 403 );
				return;
			}
			$result = Neo_Pulse_App_Teams_Invites::create( $team_id, $user_id, $body );
			Neo_Pulse_App_Api_Dispatcher::send_json( $result, ! empty( $result['ok'] ) ? 200 : 502 );
			return;
		}

		if ( preg_match( '#^agentmail-inbound/(.+)$#', $sub, $am ) && $method === 'GET' ) {
			if ( ! Neo_Pulse_App_Teams_Store::is_active_member( $member ) ) {
				Neo_Pulse_App_Api_Dispatcher::send_json( array( 'ok' => false, 'error' => 'Forbidden' ), 403 );
				return;
			}
			$message_id = rawurldecode( (string) ( $am[1] ?? '' ) );
			$inbound    = Neo_Pulse_App_Agentmail_Inbound_Store::get_inbound( $team_id, $message_id );
			if ( ! is_array( $inbound ) ) {
				Neo_Pulse_App_Api_Dispatcher::send_json( array( 'ok' => false, 'error' => 'Not found' ), 404 );
				return;
			}
			Neo_Pulse_App_Api_Dispatcher::send_json(
				array(
					'ok'      => true,
					'inbound' => $inbound,
				)
			);
			return;
		}

		if ( $sub === 'mail-test' && $method === 'POST' ) {
			if ( (string) $member['access_role'] !== 'owner' ) {
				Neo_Pulse_App_Api_Dispatcher::send_json( array( 'ok' => false, 'error' => 'Forbidden' ), 403 );
				return;
			}
			$email  = isset( $body['email'] ) ? (string) $body['email'] : '';
			$result = Neo_Pulse_App_Teams_Invites::send_admin_test( $team_id, $email );
			Neo_Pulse_App_Api_Dispatcher::send_json( $result, ! empty( $result['ok'] ) ? 200 : 502 );
			return;
		}

		if ( $sub === 'mail/send' && $method === 'POST' ) {
			if ( ! Neo_Pulse_App_Teams_Store::can_write( $member, 'communication' ) ) {
				Neo_Pulse_App_Api_Dispatcher::send_json( array( 'ok' => false, 'error' => 'Forbidden' ), 403 );
				return;
			}
			$to          = isset( $body['to'] ) ? (string) $body['to'] : '';
			$subject     = isset( $body['subject'] ) ? (string) $body['subject'] : '';
			$message     = isset( $body['message'] ) ? (string) $body['message'] : '';
			$attachments = Neo_Pulse_App_Mail::normalize_attachments( $body['attachments'] ?? null );
			$result      = Neo_Pulse_App_Mail::send( $to, $subject, $message, $attachments );
			Neo_Pulse_App_Api_Dispatcher::send_json( $result, ! empty( $result['ok'] ) ? 200 : 502 );
			return;
		}

		if ( preg_match( '#^invites/(\d+)/revoke$#', $sub, $im ) && $method === 'POST' ) {
			if ( ! Neo_Pulse_App_Teams_Store::can_write( $member, 'teams' ) ) {
				Neo_Pulse_App_Api_Dispatcher::send_json( array( 'ok' => false, 'error' => 'Forbidden' ), 403 );
				return;
			}
			Neo_Pulse_App_Api_Dispatcher::send_json(
				array( 'ok' => Neo_Pulse_App_Teams_Invites::revoke( $team_id, (int) $im[1] ) )
			);
			return;
		}

		if ( preg_match( '#^invites/(\d+)/copy-link$#', $sub, $im ) && $method === 'POST' ) {
			if ( ! Neo_Pulse_App_Teams_Store::can_write( $member, 'teams' ) ) {
				Neo_Pulse_App_Api_Dispatcher::send_json( array( 'ok' => false, 'error' => 'Forbidden' ), 403 );
				return;
			}
			$result = Neo_Pulse_App_Teams_Invites::copy_link( $team_id, (int) $im[1] );
			Neo_Pulse_App_Api_Dispatcher::send_json( $result, ! empty( $result['ok'] ) ? 200 : 404 );
			return;
		}

		if ( preg_match( '#^invites/(\d+)/resend$#', $sub, $im ) && $method === 'POST' ) {
			if ( ! Neo_Pulse_App_Teams_Store::can_write( $member, 'teams' ) ) {
				Neo_Pulse_App_Api_Dispatcher::send_json( array( 'ok' => false, 'error' => 'Forbidden' ), 403 );
				return;
			}
			$result = Neo_Pulse_App_Teams_Invites::resend( $team_id, (int) $im[1] );
			Neo_Pulse_App_Api_Dispatcher::send_json( $result, ! empty( $result['ok'] ) ? 200 : 502 );
			return;
		}

		if ( $sub === 'workspace' && $method === 'GET' ) {
			$path = Neo_Pulse_App_Teams_Store::team_workspace_path( $team_id );
			$data = Neo_Pulse_App_Json_File_Store::read( $path );
			Neo_Pulse_App_Api_Dispatcher::send_json(
				array(
					'ok'       => true,
					'snapshot' => is_array( $data ) && isset( $data['snapshot'] ) ? $data['snapshot'] : null,
					'updatedAt'=> is_array( $data ) && isset( $data['updatedAt'] ) ? $data['updatedAt'] : null,
				)
			);
			return;
		}

		if ( $sub === 'workspace' && $method === 'POST' ) {
			if ( ! Neo_Pulse_App_Teams_Store::can_write( $member, 'properties' ) && ! Neo_Pulse_App_Teams_Store::can_write( $member, 'api-keys' ) ) {
				Neo_Pulse_App_Api_Dispatcher::send_json( array( 'ok' => false, 'error' => 'Forbidden' ), 403 );
				return;
			}
			$snapshot = isset( $body['snapshot'] ) ? $body['snapshot'] : null;
			$updated  = gmdate( 'c' );
			$path     = Neo_Pulse_App_Teams_Store::team_workspace_path( $team_id );
			Neo_Pulse_App_Json_File_Store::write(
				$path,
				array(
					'snapshot'  => $snapshot,
					'updatedAt' => $updated,
				)
			);
			Neo_Pulse_App_Api_Dispatcher::send_json( array( 'ok' => true, 'updatedAt' => $updated ) );
			return;
		}

		if ( $sub === 'chat' || str_starts_with( $sub, 'chat/' ) ) {
			$chat_sub = $sub === 'chat' ? '' : substr( $sub, 5 );
			Neo_Pulse_App_Chat_Route_Handlers::dispatch( $team, $member, $chat_sub, $method, $body, $user_id );
			return;
		}

		if ( $sub === 'tasks' || str_starts_with( $sub, 'tasks/' ) ) {
			$tasks_sub = $sub === 'tasks' ? '' : substr( $sub, 6 );
			Neo_Pulse_App_Tasks_Route_Handlers::dispatch( $team, $member, $tasks_sub, $method, $body, $user_id );
			return;
		}

		if ( $sub === 'support' || str_starts_with( $sub, 'support/' ) ) {
			$support_sub = $sub === 'support' ? '' : substr( $sub, 8 );
			Neo_Pulse_App_Support_Route_Handlers::dispatch( $team, $member, $support_sub, $method, $body, $user_id );
			return;
		}

		Neo_Pulse_App_Api_Dispatcher::send_json( array( 'ok' => false, 'error' => 'Not found' ), 404 );
	}

	/**
	 * @param array<string,mixed> $team
	 * @param array<string,mixed> $member
	 * @param array<string,mixed> $body
	 */
	private static function patch_team( array $team, array $member, array $body ): void {
		if ( ! Neo_Pulse_App_Teams_Store::can_write( $member, 'teams' ) ) {
			Neo_Pulse_App_Api_Dispatcher::send_json( array( 'ok' => false, 'error' => 'Forbidden' ), 403 );
			return;
		}
		global $wpdb;
		$updates = array();
		$formats = array();
		if ( isset( $body['name'] ) ) {
			$updates['name'] = sanitize_text_field( (string) $body['name'] );
			$formats[]       = '%s';
		}
		if ( count( $updates ) > 0 ) {
			$wpdb->update(
				$wpdb->prefix . 'neo_pulse_teams',
				$updates,
				array( 'id' => (int) $team['id'] ),
				$formats,
				array( '%d' )
			);
		}
		$team = Neo_Pulse_App_Teams_Store::get_team( (int) $team['id'] );
		Neo_Pulse_App_Api_Dispatcher::send_json(
			array(
				'ok'   => true,
				'team' => Neo_Pulse_App_Teams_Store::format_team_payload( $team ?: array(), $member ),
			)
		);
	}

	/**
	 * @param array<string,mixed> $actor
	 * @param array<string,mixed> $body
	 */
	private static function dispatch_member( int $team_id, int $target_user_id, string $method, array $body, array $actor, int $actor_user_id ): void {
		global $wpdb;
		$target = Neo_Pulse_App_Teams_Store::get_membership( $team_id, $target_user_id );
		if ( ! $target ) {
			Neo_Pulse_App_Api_Dispatcher::send_json( array( 'ok' => false, 'error' => 'Member not found' ), 404 );
			return;
		}

		if ( $method === 'GET' ) {
			$members = Neo_Pulse_App_Teams_Store::list_members( $team_id );
			$found   = null;
			foreach ( $members as $m ) {
				if ( (int) $m['userId'] === $target_user_id ) {
					$found = $m;
					break;
				}
			}
			Neo_Pulse_App_Api_Dispatcher::send_json( array( 'ok' => true, 'member' => $found ) );
			return;
		}

		if ( $method === 'PATCH' ) {
			$can_edit = Neo_Pulse_App_Teams_Store::can_write( $actor, 'teams' ) || $actor_user_id === $target_user_id;
			if ( ! $can_edit ) {
				Neo_Pulse_App_Api_Dispatcher::send_json( array( 'ok' => false, 'error' => 'Forbidden' ), 403 );
				return;
			}

			$updates = array();
			$formats = array();

			if ( isset( $body['displayName'] ) && $actor_user_id === $target_user_id ) {
				$wpdb->update(
					Neo_Pulse_App_Teams_Store::users_table(),
					array( 'display_name' => sanitize_text_field( (string) $body['displayName'] ) ),
					array( 'id' => $target_user_id ),
					array( '%s' ),
					array( '%d' )
				);
			}

			if ( isset( $body['password'] ) ) {
				$password = (string) $body['password'];
				$can_set_password = $actor_user_id === $target_user_id || Neo_Pulse_App_Teams_Store::can_write( $actor, 'teams' );
				if ( ! $can_set_password ) {
					Neo_Pulse_App_Api_Dispatcher::send_json( array( 'ok' => false, 'error' => 'Forbidden' ), 403 );
					return;
				}
				if ( class_exists( 'Neo_Pulse_App_Chat_Flo' ) && Neo_Pulse_App_Chat_Flo::is_flo( $target_user_id ) ) {
					Neo_Pulse_App_Api_Dispatcher::send_json( array( 'ok' => false, 'error' => 'Cannot change bot password' ), 400 );
					return;
				}
				if ( $password === '' ) {
					Neo_Pulse_App_Api_Dispatcher::send_json( array( 'ok' => false, 'error' => 'Password required' ), 400 );
					return;
				}
				if ( ! Neo_Pulse_App_Teams_Store::update_user_password( $target_user_id, $password ) ) {
					Neo_Pulse_App_Api_Dispatcher::send_json( array( 'ok' => false, 'error' => 'Could not update password' ), 500 );
					return;
				}
			}

			if ( isset( $body['jobTitle'] ) ) {
				$updates['job_title'] = sanitize_text_field( (string) $body['jobTitle'] );
				$formats[]            = '%s';
			}

			if ( isset( $body['profile'] ) && is_array( $body['profile'] ) ) {
				$updates['profile_json'] = wp_json_encode( $body['profile'] );
				$formats[]               = '%s';
			}

			if ( Neo_Pulse_App_Teams_Store::can_write( $actor, 'teams' ) ) {
				if ( isset( $body['accessRole'] ) ) {
					$role = sanitize_text_field( (string) $body['accessRole'] );
					if ( (string) $target['access_role'] === 'owner' && $role !== 'owner' ) {
						Neo_Pulse_App_Api_Dispatcher::send_json( array( 'ok' => false, 'error' => 'Cannot change owner role' ), 400 );
						return;
					}
					$updates['access_role']      = $role;
					$updates['permissions_json'] = wp_json_encode( Neo_Pulse_App_Teams_Store::permissions_for_role( $role ) );
					$formats[]                   = '%s';
					$formats[]                   = '%s';
				}
				if ( ! empty( $body['remove'] ) ) {
					if ( (string) $target['access_role'] === 'owner' ) {
						Neo_Pulse_App_Api_Dispatcher::send_json( array( 'ok' => false, 'error' => 'Cannot remove owner' ), 400 );
						return;
					}
					$wpdb->update(
						$wpdb->prefix . 'neo_pulse_team_members',
						array( 'status' => 'removed' ),
						array(
							'team_id' => $team_id,
							'user_id' => $target_user_id,
						),
						array( '%s' ),
						array( '%d', '%d' )
					);
					Neo_Pulse_App_Api_Dispatcher::send_json( array( 'ok' => true ) );
					return;
				}
			}

			if ( count( $updates ) > 0 ) {
				$wpdb->update(
					$wpdb->prefix . 'neo_pulse_team_members',
					$updates,
					array(
						'team_id' => $team_id,
						'user_id' => $target_user_id,
					),
					$formats,
					array( '%d', '%d' )
				);
			}

			$members = Neo_Pulse_App_Teams_Store::list_members( $team_id );
			$found   = null;
			foreach ( $members as $m ) {
				if ( (int) $m['userId'] === $target_user_id ) {
					$found = $m;
					break;
				}
			}
			Neo_Pulse_App_Api_Dispatcher::send_json( array( 'ok' => true, 'member' => $found ) );
			return;
		}

		Neo_Pulse_App_Api_Dispatcher::send_json( array( 'ok' => false, 'error' => 'Not found' ), 404 );
	}
}
