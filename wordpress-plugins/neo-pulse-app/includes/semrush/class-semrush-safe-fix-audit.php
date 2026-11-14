<?php
/**
 * Semrush Site Audit fetch for live Errors (same tab as the Semrush UI).
 *
 * @package Neo_Pulse_App
 */

defined( 'ABSPATH' ) || exit;

class Neo_Pulse_App_Semrush_Safe_Fix_Audit {

	/**
	 * Map Semrush Error issue ids to safe-fix kinds.
	 * Unknown Error ids still come through as "listed" (report only).
	 */
	const ISSUE_KIND = array(
		1   => 'listed',
		2   => 'listed',
		3   => 'title',
		6   => 'title',
		7   => 'listed',
		8   => 'broken_internal_link',
		9   => 'listed',
		10  => 'listed',
		11  => 'listed',
		13  => 'broken_internal_image',
		14  => 'broken_internal_image',
		111 => 'slow_load',
	);

	const REPORTS_BASE = 'https://api.semrush.com/reports/v1/projects/';

	/**
	 * Pull every issue Semrush currently puts under Errors for the latest snapshot.
	 *
	 * @return array<int,array{issueId:int,issueName:string,kind:string,sourceUrl:string,targetUrl:string,pageId:string}>|WP_Error
	 */
	public static function fetch_safe_issues( int $project_id ) {
		if ( $project_id <= 0 ) {
			return new WP_Error( 'neo-pulse_semrush_project', 'Semrush project id is missing' );
		}
		if ( ! Neo_Pulse_App_Semrush_Client::has_api_key() ) {
			return new WP_Error( 'neo-pulse_semrush_missing', 'SEMRUSH_API_KEY is not set' );
		}

		$snapshot_id = self::latest_snapshot_id( $project_id );
		if ( is_wp_error( $snapshot_id ) ) {
			return $snapshot_id;
		}
		if ( $snapshot_id === '' ) {
			return new WP_Error( 'neo-pulse_semrush_snapshot', 'No Site Audit snapshot for this project' );
		}

		$error_ids = self::snapshot_error_ids( $project_id, $snapshot_id );
		if ( is_wp_error( $error_ids ) ) {
			return $error_ids;
		}
		if ( count( $error_ids ) === 0 ) {
			return array();
		}

		$names = self::issue_names( $project_id );
		$out   = array();
		foreach ( $error_ids as $issue_id => $count ) {
			if ( $issue_id <= 0 || $count <= 0 ) {
				continue;
			}
			$rows = self::issue_details( $project_id, $snapshot_id, $issue_id );
			if ( is_wp_error( $rows ) ) {
				return $rows;
			}
			$kind = self::ISSUE_KIND[ $issue_id ] ?? 'listed';
			$name = $names[ $issue_id ] ?? ( 'Issue ' . $issue_id );
			foreach ( $rows as $row ) {
				if ( ! is_array( $row ) ) {
					continue;
				}
				$out[] = array(
					'issueId'   => $issue_id,
					'issueName' => $name,
					'kind'      => $kind,
					'sourceUrl' => (string) ( $row['source_url'] ?? '' ),
					'targetUrl' => (string) ( $row['target_url'] ?? '' ),
					'pageId'    => (string) ( $row['page_id'] ?? '' ),
				);
			}
		}
		return $out;
	}

	/**
	 * True when this issue id is a live Semrush Error (or a known fixable kind).
	 * Kept for sheet callers; fetch_safe_issues already filters to Errors.
	 */
	public static function is_allowed_issue_id( int $issue_id ): bool {
		return $issue_id > 0;
	}

	/**
	 * @return array<int,int>|WP_Error issue_id => count
	 */
	private static function snapshot_error_ids( int $project_id, string $snapshot_id ) {
		$raw = self::get_json(
			self::REPORTS_BASE . rawurlencode( (string) $project_id ) . '/siteaudit/snapshot',
			array( 'snapshot_id' => $snapshot_id )
		);
		if ( is_wp_error( $raw ) ) {
			return $raw;
		}
		$errors = isset( $raw['errors'] ) && is_array( $raw['errors'] ) ? $raw['errors'] : array();
		$out    = array();
		foreach ( $errors as $row ) {
			if ( ! is_array( $row ) ) {
				continue;
			}
			$id    = (int) ( $row['id'] ?? 0 );
			$count = (int) ( $row['count'] ?? 0 );
			if ( $id > 0 && $count > 0 ) {
				$out[ $id ] = $count;
			}
		}
		return $out;
	}

	/**
	 * @return array<int,string>
	 */
	private static function issue_names( int $project_id ): array {
		$raw = self::get_json( self::REPORTS_BASE . rawurlencode( (string) $project_id ) . '/siteaudit/meta/issues', array() );
		if ( is_wp_error( $raw ) || ! isset( $raw['issues'] ) || ! is_array( $raw['issues'] ) ) {
			return array();
		}
		$names = array();
		foreach ( $raw['issues'] as $item ) {
			if ( ! is_array( $item ) ) {
				continue;
			}
			$names[ (int) ( $item['id'] ?? 0 ) ] = (string) ( $item['title'] ?? '' );
		}
		return $names;
	}

	/**
	 * @return string|WP_Error
	 */
	private static function latest_snapshot_id( int $project_id ) {
		$url = self::REPORTS_BASE . rawurlencode( (string) $project_id ) . '/siteaudit/snapshots';
		$raw = self::get_json( $url, array() );
		if ( is_wp_error( $raw ) ) {
			return $raw;
		}
		$list = array();
		if ( isset( $raw['snapshots'] ) && is_array( $raw['snapshots'] ) ) {
			$list = $raw['snapshots'];
		} elseif ( isset( $raw[0] ) ) {
			$list = $raw;
		}
		$best_id   = '';
		$best_date = 0;
		foreach ( $list as $row ) {
			if ( ! is_array( $row ) ) {
				continue;
			}
			$id   = trim( (string) ( $row['snapshot_id'] ?? '' ) );
			$date = (int) ( $row['finish_date'] ?? 0 );
			if ( $id === '' ) {
				continue;
			}
			if ( $best_id === '' || $date > $best_date ) {
				$best_id   = $id;
				$best_date = $date;
			}
		}
		return $best_id;
	}

	/**
	 * @return array<int,array<string,mixed>>|WP_Error
	 */
	private static function issue_details( int $project_id, string $snapshot_id, int $issue_id ) {
		$path = self::REPORTS_BASE . rawurlencode( (string) $project_id )
			. '/siteaudit/snapshot/' . rawurlencode( $snapshot_id )
			. '/issue/' . rawurlencode( (string) $issue_id );
		$raw  = self::get_json(
			$path,
			array(
				'page'  => 1,
				'limit' => 100,
			)
		);
		if ( is_wp_error( $raw ) ) {
			return $raw;
		}
		$data = isset( $raw['data'] ) && is_array( $raw['data'] ) ? $raw['data'] : array();
		$out  = array();
		foreach ( $data as $row ) {
			if ( is_array( $row ) ) {
				$out[] = $row;
			}
		}
		return $out;
	}

	/**
	 * @param array<string,string|int> $params
	 * @return array<string,mixed>|WP_Error
	 */
	private static function get_json( string $url, array $params ) {
		$key = Neo_Pulse_App_Semrush_Client::api_key();
		if ( $key === '' ) {
			return new WP_Error( 'neo-pulse_semrush_missing', 'SEMRUSH_API_KEY is not set' );
		}
		$auth = Neo_Pulse_App_Semrush_Client::auth_for_get( $key, $params );
		$full = add_query_arg( $auth['params'], $url );
		$res  = Neo_Pulse_App_Http_Transient_Retry::remote_get(
			$full,
			array(
				'timeout' => 60,
				'headers' => array_merge(
					array( 'Accept' => 'application/json' ),
					$auth['headers']
				),
			),
			3
		);
		if ( is_wp_error( $res ) ) {
			return $res;
		}
		$code = (int) wp_remote_retrieve_response_code( $res );
		$body = (string) wp_remote_retrieve_body( $res );
		if ( $code < 200 || $code >= 300 ) {
			return new WP_Error( 'neo-pulse_semrush_http', $body !== '' ? $body : sprintf( 'HTTP %d', $code ) );
		}
		$decoded = json_decode( $body, true );
		if ( ! is_array( $decoded ) ) {
			return new WP_Error( 'neo-pulse_semrush_json', 'Semrush Site Audit returned non-JSON' );
		}
		return $decoded;
	}
}
