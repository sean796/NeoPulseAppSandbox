<?php
/**
 * Live site inventory via Neo MCP (WP-CLI / in-WP PHP). No REST fallback.
 *
 * @package Neo_Pulse_App
 */

defined( 'ABSPATH' ) || exit;

class Neo_Pulse_App_Wp_Inventory_Neo_Mcp {

	/**
	 * @param string $normalized Site origin.
	 * @param string $username WP user.
	 * @param string $app_password App password.
	 * @param string $rest_collection REST collection slug (posts|pages|cpt).
	 * @param bool   $include_content Include post_content.
	 * @param bool   $include_page_heading Extract H1 when content present.
	 * @param string $wp_status Post status.
	 * @return array{ok:bool,rows?:array<int,array<string,mixed>>,error?:string,wpTotal?:int,truncated?:bool}
	 */
	public static function collect(
		$normalized,
		$username,
		$app_password,
		$rest_collection,
		$include_content,
		$include_page_heading,
		$wp_status
	) {
		$rest = sanitize_key( (string) $rest_collection );
		if ( $rest === '' ) {
			return array( 'ok' => false, 'error' => 'Missing collection for Neo MCP inventory.' );
		}
		$post_type = ( $rest === 'posts' ) ? 'post' : ( ( $rest === 'pages' ) ? 'page' : $rest );
		$status    = sanitize_key( (string) $wp_status );
		if ( $status === '' ) {
			$status = 'publish';
		}
		$want_body = $include_content || $include_page_heading;

		$pt_js     = wp_json_encode( $post_type );
		$st_js     = wp_json_encode( $status );
		$want_js   = $want_body ? 'true' : 'false';
		$code      = 'return (function(){ $q = new WP_Query(array("post_type"=>' . $pt_js . ',"post_status"=>' . $st_js . ',"posts_per_page"=>-1,"orderby"=>"date","order"=>"DESC","no_found_rows"=>true,"update_post_meta_cache"=>false,"update_post_term_cache"=>false)); $out = array(); foreach ($q->posts as $p) { $url = get_permalink($p); if (!$url) { continue; } $row = array("id"=>(int)$p->ID,"slug"=>(string)$p->post_name,"date_gmt"=>(string)$p->post_date_gmt,"url"=>(string)$url,"status"=>(string)$p->post_status,"title"=>(string)$p->post_title,"excerpt"=>(string)$p->post_excerpt,"featured_media"=>(int)get_post_thumbnail_id($p)); if (' . $want_js . ') { $row["content"] = (string)$p->post_content; } $out[] = $row; } return $out; })();';

		$mcp = new Neo_Pulse_App_Neo_Mcp_Client( $normalized, $username, $app_password );
		$res = $mcp->call_tool( 'neo-mcp_php', 'run', array( 'code' => $code ) );
		if ( empty( $res['ok'] ) ) {
			return array(
				'ok'    => false,
				'error' => isset( $res['error'] ) ? (string) $res['error'] : 'Neo MCP inventory failed',
			);
		}

		$raw_rows = array();
		if ( isset( $res['data'] ) && is_array( $res['data'] ) ) {
			$raw_rows = $res['data'];
		} elseif ( ! empty( $res['text'] ) ) {
			$decoded = json_decode( (string) $res['text'], true );
			if ( is_array( $decoded ) ) {
				$raw_rows = $decoded;
			}
		}
		if ( ! is_array( $raw_rows ) ) {
			return array( 'ok' => false, 'error' => 'Neo MCP inventory returned invalid rows' );
		}

		$inventory = array();
		foreach ( $raw_rows as $raw ) {
			if ( ! is_array( $raw ) ) {
				continue;
			}
			$row = self::map_row( $raw, $include_content, $include_page_heading, $rest );
			if ( $row ) {
				$inventory[] = $row;
			}
		}

		return array(
			'ok'        => true,
			'rows'      => $inventory,
			'wpTotal'   => count( $inventory ),
			'truncated' => false,
		);
	}

	/**
	 * @param array<string,mixed> $raw Neo MCP row.
	 * @param bool                $include_content Include content field.
	 * @param bool                $include_page_heading Extract H1.
	 * @param string              $rest_collection Collection slug.
	 * @return array<string,mixed>|null
	 */
	private static function map_row( $raw, $include_content, $include_page_heading, $rest_collection ) {
		$url = isset( $raw['url'] ) ? trim( (string) $raw['url'] ) : '';
		if ( $url === '' ) {
			return null;
		}
		$title  = trim( wp_strip_all_tags( (string) ( $raw['title'] ?? '' ) ) );
		$fields = array(
			'title'   => $title,
			'meta'    => '',
			'keyword' => '',
		);
		$excerpt = trim( wp_strip_all_tags( (string) ( $raw['excerpt'] ?? '' ) ) );
		if ( $excerpt !== '' ) {
			$fields['excerpt'] = $excerpt;
		}
		$content_body = ( $include_content || $include_page_heading )
			? (string) ( $raw['content'] ?? '' )
			: '';
		if ( $include_page_heading && $content_body !== '' && preg_match( '/<h1[^>]*>([\s\S]*?)<\/h1>/i', $content_body, $m ) ) {
			$h1 = trim( wp_strip_all_tags( $m[1] ) );
			if ( $h1 !== '' ) {
				$fields['pageHeading'] = $h1;
			}
		}
		if ( $include_content && $content_body !== '' ) {
			$fields['content'] = $content_body;
		}
		$row = array(
			'id'       => (int) ( $raw['id'] ?? 0 ),
			'slug'     => (string) ( $raw['slug'] ?? '' ),
			'date_gmt' => (string) ( $raw['date_gmt'] ?? '' ),
			'url'      => $url,
			'status'   => sanitize_key( (string) ( $raw['status'] ?? 'publish' ) ),
			'fields'   => $fields,
		);
		$fm = (int) ( $raw['featured_media'] ?? 0 );
		if ( $fm > 0 ) {
			$row['featuredMediaId'] = $fm;
		}
		unset( $rest_collection );
		return $row;
	}
}
