<?php
/**
 * NDUS SEO leads for the Organic Performance Report (organic/non-paid sources only).
 *
 * @package Neo_Pulse_App
 */

defined( 'ABSPATH' ) || exit;

class Neo_Pulse_App_Organic_Dashboard_Ndus_Leads {

	/** @var list<string> Google search only (Organic Website Leads). */
	public const ORGANIC_SEO_SOURCES = array(
		'google_organic',
	);

	/**
	 * @param array<string,mixed> $context Bundle fetch context.
	 * @return array{status:string,payload:array<string,mixed>}
	 */
	public static function resolve( array $context ): array {
		$site_url        = (string) ( $context['site_url'] ?? '' );
		$primary         = is_array( $context['primary'] ?? null ) ? $context['primary'] : array();
		$compare         = is_array( $context['compare'] ?? null ) ? $context['compare'] : array();
		$include_compare = ! empty( $context['include_compare'] );

		if ( $site_url === '' ) {
			return array(
				'status'  => 'skipped',
				'payload' => array(
					'skipped' => true,
					'reason'  => 'missing_site_url',
					'error'   => 'Site URL is required for SEO leads.',
				),
			);
		}

		$from = (string) ( $primary['startDate'] ?? '' );
		$to   = (string) ( $primary['endDate'] ?? '' );
		if ( $from === '' || $to === '' ) {
			return array(
				'status'  => 'skipped',
				'payload' => array(
					'skipped' => true,
					'reason'  => 'missing_dates',
					'error'   => 'Primary date range is required for SEO leads.',
				),
			);
		}

		$request = array(
			'siteUrl' => $site_url,
			'from'    => $from,
			'to'      => $to,
		);
		if ( $include_compare ) {
			$request['compareFrom'] = (string) ( $compare['startDate'] ?? '' );
			$request['compareTo']   = (string) ( $compare['endDate'] ?? '' );
		}

		if ( self::can_resolve_in_process() ) {
			return self::resolve_in_process( $request );
		}

		return self::resolve_remote( $request );
	}

	private static function can_resolve_in_process(): bool {
		return function_exists( 'ndus_leads_rows' )
			&& function_exists( 'ndus_sites' )
			&& function_exists( 'ndus_leads_report' );
	}

	/**
	 * @param array<string,mixed> $request Report body.
	 * @return array{status:string,payload:array<string,mixed>}
	 */
	private static function resolve_in_process( array $request ): array {
		$site_url = (string) ( $request['siteUrl'] ?? '' );
		$from     = (string) $request['from'];
		$to       = (string) $request['to'];
		$id       = self::find_site_id_by_url( $site_url, $from, $to );
		if ( $id === '' ) {
			return array(
				'status'  => 'skipped',
				'payload' => array(
					'skipped' => true,
					'reason'  => 'ndus_site_not_found',
					'error'   => 'No NDUS site matches this URL.',
				),
			);
		}

		$report = ndus_leads_report( $id );
		if ( ! $report ) {
			return array(
				'status'  => 'skipped',
				'payload' => array(
					'skipped' => true,
					'reason'  => 'ndus_empty',
					'error'   => 'This site is not sending lead counts to Neo Digital.',
				),
			);
		}

		$sites = ndus_sites();
		$site  = isset( $sites[ $id ] ) && is_array( $sites[ $id ] ) ? $sites[ $id ] : array();
		$name  = function_exists( 'ndus_site_name' ) ? ndus_site_name( $site ) : (string) ( $site['site'] ?? $id );

		$primary = self::aggregate_leads( ndus_leads_rows( $from, $to, $id ) );

		$payload = array(
			'success'     => true,
			'siteId'      => $id,
			'siteName'    => html_entity_decode( (string) $name, ENT_QUOTES | ENT_HTML5, 'UTF-8' ),
			'siteUrl'     => (string) ( $site['site'] ?? $site_url ),
			'organicOnly' => true,
			'primary'     => $primary,
			'labels'      => function_exists( 'ndus_lead_sources' ) ? ndus_lead_sources() : array(),
			'from'        => $from,
			'to'          => $to,
		);

		$c_from = (string) ( $request['compareFrom'] ?? '' );
		$c_to   = (string) ( $request['compareTo'] ?? '' );
		if ( $c_from !== '' && $c_to !== '' && $c_from <= $c_to ) {
			$payload['compare']     = self::aggregate_leads( ndus_leads_rows( $c_from, $c_to, $id ) );
			$payload['compareFrom'] = $c_from;
			$payload['compareTo']   = $c_to;
		}

		return array(
			'status'  => 'ok',
			'payload' => $payload,
		);
	}

	/**
	 * @param array<string,mixed> $request Report body.
	 * @return array{status:string,payload:array<string,mixed>}
	 */
	private static function resolve_remote( array $request ): array {
		$url  = Neo_Pulse_App_Secrets::ndus_leads_report_url();
		$user = Neo_Pulse_App_Secrets::ndus_leads_user();
		$pass = Neo_Pulse_App_Secrets::ndus_leads_app_password();

		if ( $url === '' || $user === '' || $pass === '' ) {
			return array(
				'status'  => 'skipped',
				'payload' => array(
					'skipped' => true,
					'reason'  => 'ndus_unavailable',
					'error'   => 'NDUS leads hub is not configured (set NEO_PULSE_APP_NDUS_LEADS_* secrets).',
				),
			);
		}

		$response = wp_remote_post(
			$url,
			array(
				'timeout' => 30,
				'headers' => array(
					'Content-Type'  => 'application/json',
					'Authorization' => 'Basic ' . base64_encode( $user . ':' . $pass ),
				),
				'body'    => wp_json_encode( $request ),
			)
		);

		if ( is_wp_error( $response ) ) {
			return array(
				'status'  => 'error',
				'payload' => array(
					'skipped' => true,
					'reason'  => 'ndus_unavailable',
					'error'   => $response->get_error_message(),
				),
			);
		}

		$code = (int) wp_remote_retrieve_response_code( $response );
		$data = json_decode( (string) wp_remote_retrieve_body( $response ), true );
		if ( ! is_array( $data ) ) {
			return array(
				'status'  => 'error',
				'payload' => array(
					'skipped' => true,
					'reason'  => 'ndus_unavailable',
					'error'   => 'NDUS leads report returned invalid JSON.',
				),
			);
		}

		if ( 401 === $code || 403 === $code ) {
			return array(
				'status'  => 'error',
				'payload' => array(
					'skipped' => true,
					'reason'  => 'ndus_auth_failed',
					'error'   => (string) ( $data['error'] ?? $data['message'] ?? 'NDUS leads auth failed.' ),
				),
			);
		}

		if ( ! empty( $data['skipped'] ) || empty( $data['success'] ) ) {
			$reason = (string) ( $data['reason'] ?? 'ndus_empty' );
			return array(
				'status'  => 'skipped',
				'payload' => array(
					'skipped' => true,
					'reason'  => $reason,
					'error'   => (string) ( $data['error'] ?? $data['message'] ?? 'SEO leads unavailable.' ),
				),
			);
		}

		if ( $code < 200 || $code >= 300 ) {
			return array(
				'status'  => 'error',
				'payload' => array(
					'skipped' => true,
					'reason'  => 'ndus_unavailable',
					'error'   => (string) ( $data['error'] ?? $data['message'] ?? ( 'NDUS HTTP ' . $code ) ),
				),
			);
		}

		return array(
			'status'  => 'ok',
			'payload' => $data,
		);
	}

	/**
	 * @param string $site_url Property URL.
	 * @param string $from     YYYY-MM-DD.
	 * @param string $to       YYYY-MM-DD.
	 */
	private static function find_site_id_by_url( string $site_url, string $from = '', string $to = '' ): string {
		if ( function_exists( 'ndus_mu_find_site_id_by_url' ) ) {
			return (string) ndus_mu_find_site_id_by_url( $site_url, $from, $to );
		}
		$want = self::host_key( $site_url );
		if ( $want === '' || ! function_exists( 'ndus_sites' ) ) {
			return '';
		}
		foreach ( ndus_sites() as $id => $site ) {
			if ( ! is_array( $site ) || ! empty( $site['revoked'] ) ) {
				continue;
			}
			$url = (string) ( $site['site'] ?? '' );
			if ( $url !== '' && self::host_key( $url ) === $want ) {
				return (string) $id;
			}
		}
		return '';
	}

	private static function host_key( string $url ): string {
		$host = strtolower( (string) wp_parse_url( $url, PHP_URL_HOST ) );
		if ( $host === '' ) {
			$host = strtolower( (string) preg_replace( '#^https?://#i', '', trim( $url ) ) );
			$host = (string) preg_replace( '#/.*$#', '', $host );
		}
		if ( 0 === strpos( $host, 'www.' ) ) {
			$host = substr( $host, 4 );
		}
		return $host;
	}

	/**
	 * @param array<int,array<string,mixed>> $rows Day rows.
	 * @return array{leads:int,spam:int,by_source:array<string,int>,by_form:array<string,int>}
	 */
	public static function aggregate_leads( array $rows ): array {
		if ( function_exists( 'ndus_mu_aggregate_leads' ) ) {
			$agg = ndus_mu_aggregate_leads( $rows );
			return array(
				'leads'     => (int) ( $agg['leads'] ?? 0 ),
				'spam'      => (int) ( $agg['spam'] ?? 0 ),
				'by_source' => is_array( $agg['by_source'] ?? null ) ? $agg['by_source'] : array(),
				'by_form'   => is_array( $agg['by_form'] ?? null ) ? $agg['by_form'] : array(),
			);
		}

		$allow = array_fill_keys( self::ORGANIC_SEO_SOURCES, true );
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
}
