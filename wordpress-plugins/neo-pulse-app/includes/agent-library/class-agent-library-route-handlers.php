<?php
/**
 * /api/agent-library/* route handlers.
 *
 * Serves the Agent Library tab: the hub agent catalog and per-agent enabled
 * switches. Switches persist in agent-library.json. OpenRouter uses the app
 * secrets only (no Agent Library key override).
 *
 * @package Neo_Pulse_App
 */

defined( 'ABSPATH' ) || exit;

class Neo_Pulse_App_Agent_Library_Route_Handlers {

	/**
	 * @param string              $subpath Route after agent-library/.
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

		if ( $subpath === '' && $method === 'GET' ) {
			Neo_Pulse_App_Api_Dispatcher::send_json( self::payload() );
			return;
		}

		if ( $subpath === 'toggle' && $method === 'POST' ) {
			self::toggle( $body );
			return;
		}

		Neo_Pulse_App_Api_Dispatcher::send_json( array( 'ok' => false, 'error' => 'Not found' ), 404 );
	}

	/**
	 * The hub agent catalog. The browser merges these rows with its own
	 * registered agents and applies the stored overrides to both.
	 *
	 * @return array<int,array<string,mixed>>
	 */
	private static function hub_agents(): array {
		$source = 'neo-agent-hub/packages/core/src/agents.ts';
		return array(
			array(
				'id'             => 'meeting-notes',
				'name'           => 'Meeting Notes to Checklist',
				'description'    => 'Pick a Gemini meeting note from Gmail or use latest; OpenRouter builds a Slack task list and checklist.',
				'status'         => 'beta',
				'category'       => 'report',
				'domain'         => 'slack-hub',
				'slashCommand'   => '/meeting-notes',
				'requiresGoogle' => true,
				'sourceModule'   => $source,
				'enabled'        => true,
			),
			array(
				'id'             => 'meeting-notes-drive',
				'name'           => 'Meeting Notes to Drive',
				'description'    => 'Publish to Drive button after checklist; creates or copies a Google Doc recap (Drive + Docs API).',
				'status'         => 'beta',
				'category'       => 'report',
				'domain'         => 'slack-hub',
				'slashCommand'   => '/meeting-notes',
				'requiresGoogle' => true,
				'sourceModule'   => $source,
				'enabled'        => true,
			),
			array(
				'id'             => 'write',
				'name'           => 'Write & Proofread',
				'description'    => 'Fix or rewrite drafts: /write, composer drafts, and message shortcuts (correct, polish, shorten, adjust).',
				'status'         => 'active',
				'category'       => 'blog',
				'domain'         => 'slack-hub',
				'slashCommand'   => '/write',
				'requiresGoogle' => false,
				'sourceModule'   => $source,
				'enabled'        => true,
			),
			array(
				'id'             => 'email-desk',
				'name'           => 'Email Desk (Frontend / KWB)',
				'description'    => 'Watch Gmail for inbound client mail, draft replies, and propose site tasks; approve in Slack to send and run REMOVED via NEO Pulse.',
				'status'         => 'beta',
				'category'       => 'research',
				'domain'         => 'slack-hub',
				'slashCommand'   => '/email-desk',
				'requiresGoogle' => true,
				'sourceModule'   => $source,
				'enabled'        => true,
			),
		);
	}

	/**
	 * @param mixed $raw Decoded agent-library.json contents, if readable.
	 * @return array{overrides: array<string,bool>}
	 */
	private static function normalize_state( $raw ): array {
		$state = array(
			'overrides' => array(),
		);
		if ( ! is_array( $raw ) ) {
			return $state;
		}
		if ( isset( $raw['overrides'] ) && is_array( $raw['overrides'] ) ) {
			foreach ( $raw['overrides'] as $id => $enabled ) {
				$state['overrides'][ (string) $id ] = (bool) $enabled;
			}
		}
		return $state;
	}

	/**
	 * @return array{overrides: array<string,bool>}
	 */
	private static function read_state(): array {
		return self::normalize_state(
			Neo_Pulse_App_Json_File_Store::read( Neo_Pulse_App_Data_Paths::agent_library_path() )
		);
	}

	/**
	 * Apply a change to the stored state under the store lock, so two
	 * requests cannot read the same state and overwrite each other.
	 * Strips any legacy OpenRouter settings keys from disk.
	 *
	 * @param callable $mutator fn(array &$state): void
	 */
	private static function mutate_state( callable $mutator ): bool {
		return Neo_Pulse_App_Json_File_Store::update(
			Neo_Pulse_App_Data_Paths::agent_library_path(),
			static function ( $current ) use ( $mutator ) {
				$state = self::normalize_state( $current );
				$mutator( $state );
				return array(
					'overrides' => $state['overrides'],
				);
			}
		);
	}

	/**
	 * App OpenRouter secrets only. Never an Agent Library override key.
	 *
	 * @return array<string,mixed>
	 */
	private static function public_settings(): array {
		$key = Neo_Pulse_App_Secrets::openrouter_api_key();
		return array(
			'openRouter' => array(
				'configured' => $key !== '',
				'suffix'     => $key !== '' ? substr( $key, -4 ) : null,
			),
		);
	}

	/**
	 * @return array<string,mixed>
	 */
	private static function payload(): array {
		$state = self::read_state();
		return array(
			'ok'        => true,
			'hubAgents' => self::hub_agents(),
			'overrides' => $state['overrides'] === array() ? new stdClass() : $state['overrides'],
			'settings'  => self::public_settings(),
		);
	}

	/**
	 * @param array<string,mixed> $body JSON body.
	 */
	private static function toggle( array $body ): void {
		$agent_id = isset( $body['agentId'] ) && is_string( $body['agentId'] ) ? trim( $body['agentId'] ) : '';
		if ( $agent_id === '' ) {
			Neo_Pulse_App_Api_Dispatcher::send_json( array( 'ok' => false, 'error' => 'agentId is required' ), 400 );
			return;
		}
		if ( ! array_key_exists( 'enabled', $body ) ) {
			Neo_Pulse_App_Api_Dispatcher::send_json( array( 'ok' => false, 'error' => 'enabled is required' ), 400 );
			return;
		}
		$saved = self::mutate_state(
			static function ( array &$state ) use ( $agent_id, $body ): void {
				$state['overrides'][ $agent_id ] = (bool) $body['enabled'];
			}
		);
		if ( ! $saved ) {
			Neo_Pulse_App_Api_Dispatcher::send_json( array( 'ok' => false, 'error' => 'Agent Library save failed' ), 500 );
			return;
		}
		Neo_Pulse_App_Api_Dispatcher::send_json( self::payload() );
	}
}
