<?php
/**
 * Plugin Name: Neo Digital NDUS Leads Report
 * Description: Agency read API for SEO leads (Organic Performance Report). Uses NDUS lead tables.
 * Version: 1.1.0
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

add_action(
	'rest_api_init',
	static function () {
		if ( ! defined( 'NDUS_NAMESPACE' ) ) {
			return;
		}
		register_rest_route(
			NDUS_NAMESPACE,
			'/leads/report',
			array(
				'methods'             => 'POST',
				'callback'            => 'ndus_mu_rest_leads_report',
				'permission_callback' => static function () {
					return current_user_can( 'manage_options' );
				},
			)
		);
	},
	20
);

/**
 * Organic Website Leads source keys (Google search only).
 *
 * @return list<string>
 */
function ndus_mu_organic_seo_sources() {
	return array(
		'google_organic',
	);
}

/**
 * Host key: lowercase, strip leading www.
 *
 * @param string $url Site URL or host.
 */
function ndus_mu_host_key( $url ) {
	$host = strtolower( (string) wp_parse_url( (string) $url, PHP_URL_HOST ) );
	if ( '' === $host ) {
		$host = strtolower( (string) preg_replace( '#^https?://#i', '', trim( (string) $url ) ) );
		$host = (string) preg_replace( '#/.*$#', '', $host );
	}
	if ( 0 === strpos( $host, 'www.' ) ) {
		$host = substr( $host, 4 );
	}
	return $host;
}

/**
 * Collect NDUS site ids related to an Integrations siteUrl for every client.
 * Follows production↔staging mismatch links; prefers non-revoked ids with leads in range.
 *
 * @param string $site_url Property URL.
 * @param string $from     YYYY-MM-DD.
 * @param string $to       YYYY-MM-DD.
 * @return string Site id or '' when none.
 */
function ndus_mu_find_site_id_by_url( $site_url, $from = '', $to = '' ) {
	if ( ! function_exists( 'ndus_sites' ) ) {
		return '';
	}
	$want = ndus_mu_host_key( $site_url );
	if ( '' === $want ) {
		return '';
	}

	$sites = ndus_sites();
	$host_to_ids = array();
	foreach ( $sites as $id => $site ) {
		if ( ! is_array( $site ) ) {
			continue;
		}
		foreach ( array( 'site', 'mismatch' ) as $field ) {
			$host = ndus_mu_host_key( (string) ( $site[ $field ] ?? '' ) );
			if ( '' === $host ) {
				continue;
			}
			if ( ! isset( $host_to_ids[ $host ] ) ) {
				$host_to_ids[ $host ] = array();
			}
			$host_to_ids[ $host ][ (string) $id ] = true;
		}
	}

	$seed = array_keys( $host_to_ids[ $want ] ?? array() );
	if ( ! $seed ) {
		return '';
	}

	// Expand via mismatch graph so staging check-in ids are included for every brand.
	$candidate_ids = array();
	$queue         = $seed;
	while ( $queue ) {
		$id = array_shift( $queue );
		if ( isset( $candidate_ids[ $id ] ) ) {
			continue;
		}
		$candidate_ids[ $id ] = true;
		$site = isset( $sites[ $id ] ) && is_array( $sites[ $id ] ) ? $sites[ $id ] : array();
		foreach ( array( 'site', 'mismatch' ) as $field ) {
			$host = ndus_mu_host_key( (string) ( $site[ $field ] ?? '' ) );
			if ( '' === $host ) {
				continue;
			}
			foreach ( array_keys( $host_to_ids[ $host ] ?? array() ) as $related_id ) {
				if ( ! isset( $candidate_ids[ $related_id ] ) ) {
					$queue[] = $related_id;
				}
			}
		}
	}

	$scored = array();
	foreach ( array_keys( $candidate_ids ) as $id ) {
		$site     = isset( $sites[ $id ] ) && is_array( $sites[ $id ] ) ? $sites[ $id ] : array();
		$revoked  = ! empty( $site['revoked'] );
		$last     = (int) ( $site['last_seen'] ?? 0 );
		$lead_sum = 0;
		if ( '' !== $from && '' !== $to && function_exists( 'ndus_leads_rows' ) ) {
			foreach ( ndus_leads_rows( $from, $to, $id ) as $row ) {
				$lead_sum += (int) ( $row['leads'] ?? 0 );
			}
		}
		$has_report = function_exists( 'ndus_leads_report' ) && is_array( ndus_leads_report( $id ) );
		$scored[]   = array(
			'id'         => (string) $id,
			'revoked'    => $revoked ? 1 : 0,
			'lead_sum'   => $lead_sum,
			'has_report' => $has_report ? 1 : 0,
			'last_seen'  => $last,
		);
	}

	usort(
		$scored,
		static function ( $a, $b ) {
			if ( $a['revoked'] !== $b['revoked'] ) {
				return $a['revoked'] - $b['revoked'];
			}
			if ( $a['lead_sum'] !== $b['lead_sum'] ) {
				return $b['lead_sum'] - $a['lead_sum'];
			}
			if ( $a['has_report'] !== $b['has_report'] ) {
				return $b['has_report'] - $a['has_report'];
			}
			return $b['last_seen'] - $a['last_seen'];
		}
	);

	return isset( $scored[0]['id'] ) ? (string) $scored[0]['id'] : '';
}

/**
 * Aggregate rows; always SEO/non-paid allowlist (paid/social/email never counted).
 * by_form is included only for days whose counted sources are all allowlisted.
 *
 * @param array<int,array<string,mixed>> $rows NDUS day rows.
 * @return array{leads:int,spam:int,by_source:array<string,int>,by_form:array<string,int>}
 */
function ndus_mu_aggregate_leads( array $rows ) {
	$allow = array_fill_keys( ndus_mu_organic_seo_sources(), true );
	$out   = array(
		'leads'     => 0,
		'spam'      => 0,
		'by_source' => array(),
		'by_form'   => array(),
	);
	foreach ( $rows as $row ) {
		$out['spam'] += (int) ( $row['spam'] ?? 0 );
		$by_source   = is_array( $row['by_source'] ?? null ) ? $row['by_source'] : array();
		$by_form     = is_array( $row['by_form'] ?? null ) ? $row['by_form'] : array();
		$day_organic = 0;
		$all_allowed = true;
		foreach ( $by_source as $key => $n ) {
			$n = (int) $n;
			if ( $n <= 0 ) {
				continue;
			}
			if ( empty( $allow[ $key ] ) ) {
				$all_allowed = false;
				continue;
			}
			$day_organic                       += $n;
			$out['by_source'][ (string) $key ] = ( $out['by_source'][ (string) $key ] ?? 0 ) + $n;
		}
		$out['leads'] += $day_organic;
		if ( $all_allowed && $day_organic > 0 ) {
			foreach ( $by_form as $key => $n ) {
				$out['by_form'][ (string) $key ] = ( $out['by_form'][ (string) $key ] ?? 0 ) + (int) $n;
			}
		}
	}
	arsort( $out['by_source'] );
	arsort( $out['by_form'] );
	return $out;
}

/**
 * @param array{leads:int,spam:int,by_source:array<string,int>,by_form:array<string,int>} $agg Aggregates.
 * @return array{leads:int,spam:int,by_source:array<string,int>,by_form:array<string,int>}
 */
function ndus_mu_period_payload( array $agg ) {
	return array(
		'leads'     => (int) $agg['leads'],
		'spam'      => (int) $agg['spam'],
		'by_source' => $agg['by_source'],
		'by_form'   => $agg['by_form'],
	);
}

/**
 * POST /leads/report — agency SEO leads for one site and date range (organic/non-paid always).
 *
 * @param WP_REST_Request $request Request.
 * @return WP_REST_Response
 */
function ndus_mu_rest_leads_report( WP_REST_Request $request ) {
	if ( ! function_exists( 'ndus_leads_rows' ) || ! function_exists( 'ndus_sites' ) || ! function_exists( 'ndus_leads_report' ) ) {
		return new WP_REST_Response(
			array(
				'success' => false,
				'skipped' => true,
				'reason'  => 'ndus_unavailable',
				'error'   => 'NDUS leads functions are not loaded.',
			),
			503
		);
	}

	$body = $request->get_json_params();
	if ( null === $body ) {
		$body = json_decode( (string) $request->get_body(), true );
	}
	if ( ! is_array( $body ) ) {
		return new WP_REST_Response(
			array(
				'success' => false,
				'error'   => 'Body must be a JSON object.',
			),
			400
		);
	}

	$site_url = isset( $body['siteUrl'] ) ? esc_url_raw( (string) $body['siteUrl'] ) : '';
	$from     = function_exists( 'ndus_leads_date' ) ? ndus_leads_date( isset( $body['from'] ) ? (string) $body['from'] : '' ) : '';
	$to       = function_exists( 'ndus_leads_date' ) ? ndus_leads_date( isset( $body['to'] ) ? (string) $body['to'] : '' ) : '';
	if ( '' === $site_url || '' === $from || '' === $to || $from > $to ) {
		return new WP_REST_Response(
			array(
				'success' => false,
				'error'   => 'siteUrl, from, and to (YYYY-MM-DD) are required.',
			),
			400
		);
	}

	$id = ndus_mu_find_site_id_by_url( $site_url, $from, $to );
	if ( '' === $id ) {
		return new WP_REST_Response(
			array(
				'success' => false,
				'skipped' => true,
				'reason'  => 'ndus_site_not_found',
				'error'   => 'No NDUS site matches this URL.',
			),
			404
		);
	}

	$report = ndus_leads_report( $id );
	if ( ! $report ) {
		return new WP_REST_Response(
			array(
				'success' => false,
				'skipped' => true,
				'reason'  => 'ndus_empty',
				'error'   => 'This site is not sending lead counts to Neo Digital.',
			),
			404
		);
	}

	$sites = ndus_sites();
	$site  = isset( $sites[ $id ] ) && is_array( $sites[ $id ] ) ? $sites[ $id ] : array();
	$name  = function_exists( 'ndus_site_name' ) ? ndus_site_name( $site ) : (string) ( $site['site'] ?? $id );

	$primary_rows = ndus_leads_rows( $from, $to, $id );
	$primary      = ndus_mu_aggregate_leads( $primary_rows );

	$payload = array(
		'success'     => true,
		'siteId'      => $id,
		'siteName'    => html_entity_decode( $name, ENT_QUOTES | ENT_HTML5, 'UTF-8' ),
		'siteUrl'     => (string) ( $site['site'] ?? $site_url ),
		'organicOnly' => true,
		'primary'     => ndus_mu_period_payload( $primary ),
		'labels'      => function_exists( 'ndus_lead_sources' ) ? ndus_lead_sources() : array(),
		'from'        => $from,
		'to'          => $to,
	);

	$c_from = function_exists( 'ndus_leads_date' ) ? ndus_leads_date( isset( $body['compareFrom'] ) ? (string) $body['compareFrom'] : '' ) : '';
	$c_to   = function_exists( 'ndus_leads_date' ) ? ndus_leads_date( isset( $body['compareTo'] ) ? (string) $body['compareTo'] : '' ) : '';
	if ( '' !== $c_from && '' !== $c_to && $c_from <= $c_to ) {
		$compare_rows           = ndus_leads_rows( $c_from, $c_to, $id );
		$payload['compare']     = ndus_mu_period_payload( ndus_mu_aggregate_leads( $compare_rows ) );
		$payload['compareFrom'] = $c_from;
		$payload['compareTo']   = $c_to;
	}

	$response = new WP_REST_Response( $payload, 200 );
	$response->header( 'Cache-Control', 'no-store, private' );
	return $response;
}
