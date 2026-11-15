<?php
/**
 * Pulse Assist route decision: product help vs site data.
 *
 * @package Neo_Pulse_App
 */

defined( 'ABSPATH' ) || exit;

class Neo_Pulse_App_Pulse_Assist_Route_Decision {

	/**
	 * @param array<string,mixed> $pulse
	 * @return array{ok:bool,route?:string,targetIds?:array<int,string>,reason?:string,error?:string}
	 */
	public static function decide( string $message, array $pulse ): array {
		$module_ids  = array();
		$feature_ids = array();

		foreach ( Neo_Pulse_App_Pulse_Assist_Module_Catalog::all_modules() as $mod ) {
			if ( ! empty( $mod['id'] ) ) {
				$module_ids[] = (string) $mod['id'];
			}
		}
		foreach ( Neo_Pulse_App_Pulse_Assist_Module_Catalog::all_feature_playbooks() as $feat ) {
			if ( ! empty( $feat['id'] ) ) {
				$feature_ids[] = (string) $feat['id'];
			}
		}

		if ( count( $module_ids ) === 0 ) {
			return array(
				'ok'    => false,
				'error' => 'Assist module catalog is empty.',
			);
		}

		$location = ! empty( $pulse['locationSummary'] ) ? sanitize_text_field( (string) $pulse['locationSummary'] ) : '';
		$system   = 'Return JSON only: {"route":"product_help|site_data","targetIds":["id1"],"reason":"brief"}. '
			. 'route=product_help when the user asks what a screen, studio, skill, agent, or feature does, or how to use NEO Pulse UI. '
			. 'route=site_data when the user asks about live WordPress inventory, GSC, GA, page SEO fields, or site content data. '
			. 'For product_help, targetIds must be 1-4 ids from the Module ids and Feature/skill ids lists. Prefer skill ids when the user names a skill or agent such as Semrush Safe Fix. '
			. 'For site_data, leave targetIds empty.';
		$user     = 'Module ids: ' . implode( ', ', $module_ids )
			. "\nFeature/skill ids: " . implode( ', ', $feature_ids )
			. "\nCurrent location: " . $location
			. "\nUser message: " . $message;

		try {
			$parsed = Neo_Pulse_App_Chat_Openrouter::json_completion(
				array(
					array(
						'role'    => 'system',
						'content' => $system,
					),
					array(
						'role'    => 'user',
						'content' => $user,
					),
				),
				array(
					'temperature' => 0.1,
					'maxTokens'   => 320,
				)
			);
		} catch ( Exception $e ) {
			return array(
				'ok'    => false,
				'error' => 'Assist route decision failed: ' . $e->getMessage(),
			);
		}

		if ( ! is_array( $parsed ) || $parsed === array() ) {
			return array(
				'ok'    => false,
				'error' => 'Assist route decision returned invalid JSON.',
			);
		}

		$route = isset( $parsed['route'] ) ? sanitize_key( (string) $parsed['route'] ) : '';
		if ( $route !== 'product_help' && $route !== 'site_data' ) {
			return array(
				'ok'    => false,
				'error' => 'Assist route decision missing route product_help or site_data.',
			);
		}

		$allowed = array_fill_keys( array_merge( $module_ids, $feature_ids ), true );
		$targets = array();
		if ( ! empty( $parsed['targetIds'] ) && is_array( $parsed['targetIds'] ) ) {
			foreach ( $parsed['targetIds'] as $id ) {
				if ( ! is_scalar( $id ) ) {
					continue;
				}
				$key = sanitize_text_field( (string) $id );
				if ( $key === '' || ! isset( $allowed[ $key ] ) ) {
					continue;
				}
				$targets[] = $key;
				if ( count( $targets ) >= 4 ) {
					break;
				}
			}
		}

		if ( $route === 'product_help' && count( $targets ) === 0 ) {
			$current = Neo_Pulse_App_Pulse_Assist_Module_Catalog::current_module_id_from_context( $pulse );
			if ( is_string( $current ) && $current !== '' && isset( $allowed[ $current ] ) ) {
				$targets[] = $current;
			}
		}

		if ( $route === 'product_help' && count( $targets ) === 0 ) {
			return array(
				'ok'    => false,
				'error' => 'Assist route decision returned product_help with no valid target ids.',
			);
		}

		return array(
			'ok'        => true,
			'route'     => $route,
			'targetIds' => $targets,
			'reason'    => isset( $parsed['reason'] ) ? sanitize_text_field( (string) $parsed['reason'] ) : '',
		);
	}
}
