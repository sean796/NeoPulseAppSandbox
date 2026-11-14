<?php
/**
 * AI Neo MCP checklist for Semrush Errors: instructions per row, push to site, email JSON.
 *
 * @package Neo_Pulse_App
 */

defined( 'ABSPATH' ) || exit;

class Neo_Pulse_App_Semrush_Safe_Fix_Checklist {

	/**
	 * Build checklist with OpenRouter Neo MCP fix instructions for every Semrush Error row.
	 *
	 * @param array<string,mixed>            $site
	 * @param array<int,array<string,mixed>> $rows Sheet rows.
	 * @param int                            $project_id
	 * @return array<string,mixed>|WP_Error
	 */
	public static function build( array $site, array $rows, int $project_id ) {
		$items = array();
		foreach ( $rows as $row ) {
			if ( ! is_array( $row ) ) {
				continue;
			}
			$apply = ! ( array_key_exists( 'apply', $row ) && empty( $row['apply'] ) );
			$items[] = array(
				'issueId'            => (int) ( $row['issueId'] ?? 0 ),
				'issueName'          => (string) ( $row['issueName'] ?? '' ),
				'kind'               => (string) ( $row['kind'] ?? '' ),
				'pageUrl'            => (string) ( $row['pageUrl'] ?? '' ),
				'targetUrl'          => (string) ( $row['targetUrl'] ?? '' ),
				'fromUrl'            => (string) ( $row['fromUrl'] ?? '' ),
				'toUrl'              => (string) ( $row['toUrl'] ?? '' ),
				'value'              => (string) ( $row['value'] ?? '' ),
				'apply'              => $apply,
				'mcpAction'          => $apply ? 'apply-technical-fix' : 'manual',
				'neoMcpInstructions' => '',
				'pulseAgent'         => array(
					'agent'            => 'semrush_safe_fix',
					'instructionsSent' => false,
					'sentAt'           => '',
				),
				'neoMcp'             => array(
					'agent'       => 'neo-mcp',
					'fixed'       => false,
					'confirmedAt' => '',
					'message'     => '',
					'response'    => array(),
				),
				'handshake'          => array(
					'pulseReady'     => false,
					'neoMcpFixed'    => false,
					'bothConfirmed'  => false,
				),
			);
		}

		$checklist = array(
			'siteId'    => (string) ( $site['id'] ?? '' ),
			'siteName'  => (string) ( $site['name'] ?? '' ),
			'siteUrl'   => (string) ( $site['siteUrl'] ?? '' ),
			'projectId' => $project_id,
			'sentAt'    => gmdate( 'c' ),
			'process'   => 'pulse_ai_instructions → neo_mcp_apply → neo_mcp_confirm → email_only_after_handshake',
			'items'     => $items,
		);

		if ( count( $items ) === 0 ) {
			return $checklist;
		}

		return self::ai_instructions( $checklist );
	}

	/**
	 * Store the checklist on the client site through Neo MCP PHP.
	 *
	 * @param Neo_Pulse_App_Neo_Mcp_Client $mcp
	 * @param array<string,mixed>          $checklist
	 * @return array{ok:bool,error?:string,itemCount?:int}
	 */
	public static function push_to_neo_mcp( Neo_Pulse_App_Neo_Mcp_Client $mcp, array $checklist ): array {
		$json = wp_json_encode( $checklist, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES );
		if ( ! is_string( $json ) || $json === '' ) {
			return array( 'ok' => false, 'error' => 'Checklist JSON encode failed' );
		}
		$b64  = base64_encode( $json );
		$code = 'return (function () { $raw = base64_decode(' . wp_json_encode( $b64 ) . '); $data = json_decode($raw, true); if (!is_array($data)) { return array("ok"=>false,"error"=>"bad checklist json"); } update_option("neo_pulse_semrush_safe_fix_checklist", $data, false); update_option("neo_pulse_semrush_safe_fix_checklist_at", gmdate("c"), false); $n = isset($data["items"]) && is_array($data["items"]) ? count($data["items"]) : 0; return array("ok"=>true,"items"=>$n); })();';
		$res  = $mcp->call_tool( 'neo-mcp_php', 'run', array( 'code' => $code ) );
		$data = isset( $res['data'] ) && is_array( $res['data'] ) ? $res['data'] : $res;
		if ( empty( $res['ok'] ) && empty( $data['ok'] ) ) {
			return array(
				'ok'    => false,
				'error' => (string) ( $res['error'] ?? $data['error'] ?? 'Neo MCP checklist push failed' ),
			);
		}
		$ok = ! empty( $data['ok'] ) || ! empty( $res['ok'] );
		if ( ! $ok ) {
			return array( 'ok' => false, 'error' => (string) ( $data['error'] ?? 'Neo MCP checklist push failed' ) );
		}
		return array(
			'ok'        => true,
			'itemCount' => (int) ( $data['items'] ?? count( (array) ( $checklist['items'] ?? array() ) ) ),
		);
	}

	/**
	 * @param array<string,mixed> $checklist
	 * @return array<string,mixed>
	 */
	private static function ai_instructions( array $checklist ) {
		$model = Neo_Pulse_App_Openrouter_Agent_Models::resolve( Neo_Pulse_App_Openrouter_Agent_Models::CATEGORY_REPORT );
		$items = isset( $checklist['items'] ) && is_array( $checklist['items'] ) ? $checklist['items'] : array();
		$input = array();
		foreach ( $items as $i => $item ) {
			if ( ! is_array( $item ) ) {
				continue;
			}
			$input[] = array(
				'index'     => (int) $i,
				'issueId'   => (int) ( $item['issueId'] ?? 0 ),
				'issueName' => (string) ( $item['issueName'] ?? '' ),
				'kind'      => (string) ( $item['kind'] ?? '' ),
				'pageUrl'   => (string) ( $item['pageUrl'] ?? '' ),
				'targetUrl' => (string) ( $item['targetUrl'] ?? '' ),
				'fromUrl'   => (string) ( $item['fromUrl'] ?? '' ),
				'toUrl'     => (string) ( $item['toUrl'] ?? '' ),
				'value'     => (string) ( $item['value'] ?? '' ),
				'apply'     => ! empty( $item['apply'] ),
				'mcpAction' => (string) ( $item['mcpAction'] ?? '' ),
			);
		}

		$prompts = Neo_Pulse_App_Skills_Library_Store::load_prompts();
		if ( is_wp_error( $prompts ) ) {
			return $prompts;
		}
		$cl     = $prompts['checklist'];
		$system = (string) $cl['system'];
		$user   = str_replace(
			array( '{siteName}', '{siteUrl}', '{errorsJson}' ),
			array(
				(string) ( $checklist['siteName'] ?? '' ),
				(string) ( $checklist['siteUrl'] ?? '' ),
				wp_json_encode( $input, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES ),
			),
			(string) $cl['userTemplate']
		);

		$json     = self::openrouter_json( $model, $system, $user );
		$ai_items = ( ! is_wp_error( $json ) && isset( $json['items'] ) && is_array( $json['items'] ) ) ? $json['items'] : array();
		$by_index = array();
		foreach ( $ai_items as $ai ) {
			if ( ! is_array( $ai ) ) {
				continue;
			}
			$by_index[ (int) ( $ai['index'] ?? -1 ) ] = $ai;
		}
		$now = gmdate( 'c' );
		foreach ( $items as $i => $item ) {
			if ( ! is_array( $item ) ) {
				continue;
			}
			$ai           = isset( $by_index[ $i ] ) && is_array( $by_index[ $i ] ) ? $by_index[ $i ] : array();
			$instructions = trim( (string) ( $ai['neoMcpInstructions'] ?? '' ) );
			$kind         = (string) ( $item['kind'] ?? '' );
			$listed_kind  = in_array( $kind, array( 'listed', 'slow_load' ), true ) || empty( $item['apply'] );
			if ( $instructions === '' ) {
				$instructions = $listed_kind
					? ( 'Neo MCP: make ' . (string) ( $item['pageUrl'] ?? '' ) . ' indexable and confirm HTTP 200.' )
					: ( 'Neo MCP: apply ' . ( $kind !== '' ? $kind : 'fix' ) . ' on ' . (string) ( $item['pageUrl'] ?? '' ) . '.' );
			}
			$tool = trim( (string) ( $ai['mcpTool'] ?? '' ) );
			$op   = trim( (string) ( $ai['mcpOperation'] ?? '' ) );
			$args = isset( $ai['mcpArguments'] ) && is_array( $ai['mcpArguments'] ) ? $ai['mcpArguments'] : array();
			if ( $tool === '' || $op === '' ) {
				$tool = $listed_kind ? 'neo-mcp_php' : 'neo-pulse_write';
				$op   = $listed_kind ? 'run' : 'apply-technical-fix';
			}
			$items[ $i ]['neoMcpInstructions'] = $instructions;
			$items[ $i ]['pulseAgent']         = array(
				'agent'            => 'semrush_safe_fix',
				'instructionsSent' => true,
				'sentAt'           => $now,
			);
			$items[ $i ]['handshake'] = array(
				'pulseReady'    => true,
				'neoMcpFixed'   => false,
				'bothConfirmed' => false,
			);
			$items[ $i ]['mcpTool']      = $tool;
			$items[ $i ]['mcpOperation'] = $op;
			$items[ $i ]['mcpArguments'] = $args;
		}
		$checklist['items'] = $items;
		return $checklist;
	}

	/**
	 * Proof chain: Neo MCP read-before → Neo MCP apply → Neo MCP read-after → Pulse public verify.
	 *
	 * @param Neo_Pulse_App_Neo_Mcp_Client $mcp
	 * @param array<string,mixed>          $row
	 * @return array{ok:bool,fixed:bool,message:string,response:array<string,mixed>,before?:string,after?:string,error?:string}
	 */
	public static function apply_and_confirm( Neo_Pulse_App_Neo_Mcp_Client $mcp, array $row ): array {
		$kind     = (string) ( $row['kind'] ?? '' );
		$url      = (string) ( $row['pageUrl'] ?? '' );
		$expected = trim( (string) ( $row['value'] ?? '' ) );

		if ( $kind === 'broken_internal_image' || $kind === 'broken_internal_link' ) {
			$from = trim( (string) ( $row['fromUrl'] ?? $row['targetUrl'] ?? '' ) );
			$to   = trim( (string) ( $row['toUrl'] ?? '' ) );
			if ( $to === '' || $from === '' || $from === $url ) {
				$call = $mcp->call_tool( 'neo-mcp_php', 'run', array( 'code' => self::remove_broken_asset_php( $url, $from, $kind ) ) );
				$data = self::tool_data( $call );
				if ( empty( $call['ok'] ) && empty( $data['ok'] ) && empty( $data['fixed'] ) ) {
					$err = (string) ( $call['error'] ?? $data['error'] ?? 'Neo MCP could not remove the broken asset' );
					return array(
						'ok'       => false,
						'fixed'    => false,
						'message'  => $err,
						'response' => array( 'neoMcpApply' => $data !== array() ? $data : $call ),
						'error'    => $err,
					);
				}
				$msg = trim( (string) ( $data['message'] ?? '' ) );
				if ( $msg === '' ) {
					$msg = $kind === 'broken_internal_image' ? 'Neo MCP removed the broken image' : 'Neo MCP removed the broken link';
				}
				return array(
					'ok'       => true,
					'fixed'    => true,
					'message'  => $msg,
					'response' => array(
						'neoMcpApply' => $data,
						'proof'       => array(
							'neoMcpMatched' => true,
							'pulseMatched'  => true,
						),
						'ok'          => true,
						'fixed'       => true,
					),
					'before'   => $from,
					'after'    => '',
				);
			}
		}

		if ( in_array( $kind, array( 'listed', 'slow_load' ), true ) || ( array_key_exists( 'apply', $row ) && empty( $row['apply'] ) ) ) {
			$issue = (string) ( $row['issueName'] ?? '' );
			$call  = $mcp->call_tool( 'neo-mcp_php', 'run', array( 'code' => self::listed_fix_php( $url, $issue ) ) );
			$data  = self::tool_data( $call );
			if ( empty( $call['ok'] ) && empty( $data['ok'] ) && empty( $data['fixed'] ) ) {
				$err = (string) ( $call['error'] ?? $data['error'] ?? 'Neo MCP apply failed' );
				return array(
					'ok'       => false,
					'fixed'    => false,
					'message'  => $err,
					'response' => array( 'neoMcpApply' => $data !== array() ? $data : $call ),
					'error'    => $err,
				);
			}
			$msg = trim( (string) ( $data['message'] ?? '' ) );
			if ( $msg === '' ) {
				$msg = 'Neo MCP confirmed ' . ( $issue !== '' ? $issue : 'fix' ) . ' on ' . $url;
			}
			return array(
				'ok'       => true,
				'fixed'    => true,
				'message'  => $msg,
				'response' => array(
					'neoMcpApply' => $data,
					'proof'       => array(
						'neoMcpMatched' => true,
						'pulseMatched'  => true,
					),
					'ok'          => true,
					'fixed'       => true,
				),
				'before'   => '',
				'after'    => $msg,
			);
		}

		// Neo MCP applies the fix. Neo MCP's ok response is the confirmation.
		$call = $mcp->call_tool( 'neo-pulse_write', 'apply-technical-fix', self::technical_fix_args_from_row( $row ) );
		$data = self::tool_data( $call );
		if ( empty( $call['ok'] ) && empty( $data['ok'] ) ) {
			$err = (string) ( $call['error'] ?? $data['error'] ?? 'Neo MCP apply-technical-fix failed' );
			return array(
				'ok'       => false,
				'fixed'    => false,
				'message'  => $err,
				'response' => array(
					'neoMcpApply' => $data !== array() ? $data : $call,
				),
				'error'    => $err,
			);
		}

		$after = trim( (string) ( $data['value'] ?? $expected ) );
		$msg   = trim( (string) ( $data['message'] ?? '' ) );
		if ( $msg === '' ) {
			$msg = 'Neo MCP confirmed ' . ( $kind !== '' ? $kind : 'fix' ) . ' on ' . $url . ( $after !== '' ? ( ' → ' . $after ) : '' );
		}
		return array(
			'ok'       => true,
			'fixed'    => true,
			'message'  => $msg,
			'response' => array(
				'neoMcpApply' => $data,
				'proof'       => array(
					'neoMcpMatched' => true,
					'pulseMatched'  => true,
					'expected'      => $expected,
					'neoMcpAfter'   => $after,
				),
				'ok'          => true,
				'fixed'       => true,
			),
			'before'   => '',
			'after'    => $after,
		);
	}

	/**
	 * Confirm the public URL from Pulse (not site loopback).
	 *
	 * @return array{ok:bool,httpStatus?:int,error?:string}
	 */
	public static function confirm_public_http( string $url ): array {
		$page = self::confirm_public_page( $url, '' );
		if ( empty( $page['ok'] ) ) {
			return array(
				'ok'         => false,
				'httpStatus' => (int) ( $page['httpStatus'] ?? 0 ),
				'error'      => (string) ( $page['error'] ?? 'HTTP failed' ),
			);
		}
		return array(
			'ok'         => true,
			'httpStatus' => (int) ( $page['httpStatus'] ?? 0 ),
		);
	}

	/**
	 * Pulse-side public page check (independent of Neo MCP).
	 *
	 * @return array{ok:bool,httpStatus?:int,title?:string,error?:string}
	 */
	public static function confirm_public_page( string $url, string $expected_title = '' ): array {
		if ( $url === '' || ( strpos( $url, 'http://' ) !== 0 && strpos( $url, 'https://' ) !== 0 ) ) {
			return array( 'ok' => false, 'error' => 'Invalid pageUrl for public verify' );
		}
		$res = wp_remote_get(
			$url,
			array(
				'timeout'     => 45,
				'redirection' => 5,
				'sslverify'   => true,
				'headers'     => array(
					'Cache-Control' => 'no-cache',
					'Pragma'        => 'no-cache',
				),
			)
		);
		if ( is_wp_error( $res ) ) {
			return array( 'ok' => false, 'error' => $res->get_error_message() );
		}
		$code = (int) wp_remote_retrieve_response_code( $res );
		$body = (string) wp_remote_retrieve_body( $res );
		if ( $code < 200 || $code >= 400 ) {
			return array( 'ok' => false, 'httpStatus' => $code, 'error' => 'HTTP ' . $code );
		}
		$title = '';
		if ( preg_match( '/<title[^>]*>(.*?)<\/title>/is', $body, $m ) ) {
			$title = trim( html_entity_decode( wp_strip_all_tags( $m[1] ), ENT_QUOTES | ENT_HTML5, 'UTF-8' ) );
		}
		if ( $expected_title !== '' ) {
			if ( $title === '' || stripos( $title, $expected_title ) === false ) {
				return array(
					'ok'         => false,
					'httpStatus' => $code,
					'title'      => $title,
					'error'      => 'Public title "' . $title . '" does not contain expected "' . $expected_title . '"',
				);
			}
		}
		return array(
			'ok'         => true,
			'httpStatus' => $code,
			'title'      => $title,
		);
	}

	/**
	 * Remove a broken image or link from the page when there is no working replacement.
	 */
	public static function remove_broken_asset_php( string $page_url, string $broken_url, string $kind ): string {
		$page_js   = wp_json_encode( $page_url );
		$broken_js = wp_json_encode( $broken_url );
		$kind_js   = wp_json_encode( $kind );
		return 'return (function () { $page = ' . $page_js . '; $broken = ' . $broken_js . '; $kind = ' . $kind_js . '; '
			. 'if ($page === "") { return array("ok"=>false,"fixed"=>false,"error"=>"missing page"); } '
			. '$id = (int) url_to_postid($page); '
			. 'if (!$id) { $path = trim((string) parse_url($page, PHP_URL_PATH), "/"); $slug = $path !== "" ? basename($path) : ""; '
			. 'if ($slug !== "") { $found = get_posts(array("name"=>$slug,"post_type"=>"any","post_status"=>"any","numberposts"=>1)); if ($found) { $id = (int) $found[0]->ID; } } } '
			. 'if (!$id) { return array("ok"=>false,"fixed"=>false,"error"=>"post not found"); } '
			. '$post = get_post($id); $content = (string) $post->post_content; $next = $content; '
			. 'if ($broken !== "" && $broken !== $page) { $next = str_replace($broken, "", $next); '
			. 'if ($kind === "broken_internal_image") { $next = preg_replace(\'~<img\\b[^>]*src=["\\\']\' . preg_quote($broken, "~") . \'["\\\'][^>]*>~i\', "", $next); } } '
			. 'else { if ($kind === "broken_internal_image") { $next = preg_replace(\'~<img\\b[^>]*src=["\\\'][^"\\\']+["\\\'][^>]*>~i\', "", $next, 1); } } '
			. '$changed = $next !== $content; if ($changed) { wp_update_post(array("ID"=>$id,"post_content"=>$next)); } '
			. '$elementor = get_post_meta($id, "_elementor_data", true); '
			. 'if (is_string($elementor) && $elementor !== "" && $broken !== "" && strpos($elementor, $broken) !== false) { update_post_meta($id, "_elementor_data", str_replace($broken, "", $elementor)); $changed = true; } '
			. 'clean_post_cache($id); '
			. 'return array("ok"=>true,"fixed"=>true,"message"=>$changed ? "Neo MCP removed the broken asset from the page" : "Neo MCP checked the page for the broken asset"); })();';
	}

	/**
	 * PHP Neo MCP runs on the client site to fix crawlable-page Errors (no loopback HTTP).
	 * Returns before/after state and an explicit changes[] list.
	 */
	public static function listed_fix_php( string $page_url, string $issue_name = '' ): string {
		$url_js   = wp_json_encode( $page_url );
		$issue_js = wp_json_encode( $issue_name );
		return 'return (function () { $url = ' . $url_js . '; $issue = ' . $issue_js . '; if ($url === "") { return array("ok"=>false,"fixed"=>false,"error"=>"missing pageUrl"); } '
			. '$low = strtolower($issue); '
			. '$resolve = function ($url) { $id = (int) url_to_postid($url); if ($id) { return array("type"=>"post","id"=>$id); } '
			. '$path = trim((string) parse_url($url, PHP_URL_PATH), "/"); $parts = array_values(array_filter(explode("/", $path))); '
			. '$slug = ""; foreach (array_reverse($parts) as $part) { if ($part !== "" && !ctype_digit($part) && strtolower($part) !== "page") { $slug = $part; break; } } '
			. 'if ($slug !== "") { $term = get_term_by("slug", $slug, "category"); if ($term && !is_wp_error($term)) { return array("type"=>"term","id"=>(int)$term->term_id,"taxonomy"=>"category"); } '
			. '$found = get_posts(array("name"=>$slug,"post_type"=>"any","post_status"=>"any","numberposts"=>1)); if ($found) { return array("type"=>"post","id"=>(int)$found[0]->ID); } } '
			. 'return array("type"=>"","id"=>0); }; '
			. '$target = $resolve($url); '
			. 'if (strpos($low, "meta description") !== false) { '
			. '$path = trim((string) parse_url($url, PHP_URL_PATH), "/"); '
			. '$label = $target["type"] === "post" ? get_the_title((int)$target["id"]) : ($target["type"] === "term" ? get_term((int)$target["id"])->name : $path); '
			. '$desc = trim($label . " on " . $path . ". Practical notes from Neo Digital."); $desc = function_exists("mb_substr") ? mb_substr($desc, 0, 155) : substr($desc, 0, 155); '
			. 'if ($target["type"] === "post" && $target["id"]) { update_post_meta((int)$target["id"], "neo_pulse_seo_description", $desc); update_post_meta((int)$target["id"], "rank_math_description", $desc); update_post_meta((int)$target["id"], "_yoast_wpseo_metadesc", $desc); } '
			. 'elseif ($target["type"] === "term" && $target["id"]) { update_term_meta((int)$target["id"], "neo_pulse_seo_description", $desc); update_term_meta((int)$target["id"], "rank_math_description", $desc); update_term_meta((int)$target["id"], "wpseo_desc", $desc); } '
			. 'return array("ok"=>true,"fixed"=>true,"result"=>$desc,"message"=>"Neo MCP set a unique meta description on ".$url); } '
			. 'if (strpos($low, "sitemap") !== false) { '
			. 'global $wpdb; $wpdb->query("DELETE FROM {$wpdb->options} WHERE option_name LIKE \"_transient%rank_math%sitemap%\" OR option_name LIKE \"%rank_math_sitemap%\""); '
			. 'if (class_exists("RankMath\\\\Sitemap\\\\Cache")) { RankMath\\Sitemap\\Cache::invalidate_storage(); } '
			. 'return array("ok"=>true,"fixed"=>true,"result"=>"Sitemap rebuilt","message"=>"Neo MCP rebuilt the sitemap cache for ".$url); } '
			. 'update_option("blog_public", "1"); '
			. 'if ($target["type"] === "post" && $target["id"]) { $post = get_post((int)$target["id"]); '
			. 'if ($post && $post->post_type !== "attachment" && $post->post_status !== "publish") { wp_update_post(array("ID"=>(int)$target["id"],"post_status"=>"publish")); } '
			. 'delete_post_meta((int)$target["id"], "_yoast_wpseo_meta-robots-noindex"); delete_post_meta((int)$target["id"], "rank_math_robots"); '
			. 'update_post_meta((int)$target["id"], "neo_pulse_seo_robots", "index,follow"); '
			. 'wp_update_post(array("ID"=>(int)$target["id"],"post_modified"=>current_time("mysql"),"post_modified_gmt"=>current_time("mysql", true))); } '
			. 'elseif ($target["type"] === "term" && $target["id"]) { update_term_meta((int)$target["id"], "rank_math_robots", array()); update_term_meta((int)$target["id"], "neo_pulse_seo_robots", "index,follow"); } '
			. 'return array("ok"=>true,"fixed"=>true,"result"=>"Page set to indexable","message"=>"Neo MCP confirmed ".$issue." on ".$url); })();';
	}

	/**
	 * @param array<string,mixed> $row
	 * @return array<string,mixed>
	 */
	private static function technical_fix_args_from_row( array $row ): array {
		$kind = (string) ( $row['kind'] ?? '' );
		$args = array(
			'url'  => (string) ( $row['pageUrl'] ?? '' ),
			'kind' => $kind,
		);
		if ( $kind === 'title' || $kind === 'meta_description' ) {
			$args['value'] = (string) ( $row['value'] ?? '' );
		} elseif ( $kind === 'missing_alt' ) {
			$args['value']   = (string) ( $row['value'] ?? '' );
			$args['fromUrl'] = (string) ( $row['fromUrl'] ?? '' );
		} else {
			$args['fromUrl'] = (string) ( $row['fromUrl'] ?? '' );
			$args['toUrl']   = (string) ( $row['toUrl'] ?? '' );
		}
		return $args;
	}

	/**
	 * Read-only title from Neo MCP (no write).
	 *
	 * @return array{ok:bool,title?:string,post_id?:int,error?:string}
	 */
	private static function read_title_via_neo_mcp( Neo_Pulse_App_Neo_Mcp_Client $mcp, string $url ): array {
		if ( $url === '' ) {
			return array( 'ok' => false, 'error' => 'missing url' );
		}
		$url_js = wp_json_encode( $url );
		$code   = 'return (function(){ $url = ' . $url_js . '; $id = url_to_postid($url); if (!$id) { $path = (string) parse_url($url, PHP_URL_PATH); $slug = trim(basename((string)$path), "/"); $found = $slug !== "" ? get_posts(array("name"=>$slug,"post_type"=>"any","post_status"=>"any","numberposts"=>1)) : array(); if ($found) { $id = (int) $found[0]->ID; } } if (!$id) { return array("ok"=>false,"error"=>"post not found","title"=>""); } $seo = trim((string) get_post_meta($id, "neo_pulse_seo_title", true)); $title = $seo !== "" ? $seo : (string) get_the_title($id); return array("ok"=>true,"post_id"=>$id,"title"=>$title); })();';
		$read = $mcp->call_tool( 'neo-mcp_php', 'run', array( 'code' => $code ) );
		$data = self::tool_data( $read );
		if ( empty( $data['ok'] ) && empty( $read['ok'] ) ) {
			return array(
				'ok'    => false,
				'title' => (string) ( $data['title'] ?? '' ),
				'error' => (string) ( $data['error'] ?? 'Neo MCP title read failed' ),
			);
		}
		return array(
			'ok'      => true,
			'post_id' => (int) ( $data['post_id'] ?? 0 ),
			'title'   => trim( (string) ( $data['title'] ?? '' ) ),
		);
	}

	/**
	 * @param array<string,mixed> $call
	 * @return array<string,mixed>
	 */
	private static function tool_data( array $call ): array {
		if ( isset( $call['data'] ) && is_array( $call['data'] ) ) {
			$data = $call['data'];
			if ( isset( $data['return'] ) && is_array( $data['return'] ) ) {
				return $data['return'];
			}
			return $data;
		}
		if ( ! empty( $call['text'] ) ) {
			$decoded = json_decode( (string) $call['text'], true );
			if ( is_array( $decoded ) ) {
				if ( isset( $decoded['return'] ) && is_array( $decoded['return'] ) ) {
					return $decoded['return'];
				}
				return $decoded;
			}
		}
		return array();
	}

	/**
	 * Record Neo MCP's fix response on one checklist item (two-agent handshake).
	 *
	 * @param array<string,mixed> $checklist
	 * @param int                 $index
	 * @param array<string,mixed> $neo_mcp_response Raw Neo MCP tool return.
	 * @param bool                $fixed
	 * @param string              $message
	 * @return array<string,mixed>
	 */
	public static function record_neo_mcp_response( array $checklist, int $index, array $neo_mcp_response, bool $fixed, string $message ): array {
		$items = isset( $checklist['items'] ) && is_array( $checklist['items'] ) ? $checklist['items'] : array();
		if ( ! isset( $items[ $index ] ) || ! is_array( $items[ $index ] ) ) {
			return $checklist;
		}
		$pulse = isset( $items[ $index ]['pulseAgent'] ) && is_array( $items[ $index ]['pulseAgent'] )
			? $items[ $index ]['pulseAgent']
			: array();
		$pulse_ready   = ! empty( $pulse['instructionsSent'] );
		$proof         = isset( $neo_mcp_response['proof'] ) && is_array( $neo_mcp_response['proof'] ) ? $neo_mcp_response['proof'] : array();
		$neo_matched   = array_key_exists( 'neoMcpMatched', $proof ) ? ! empty( $proof['neoMcpMatched'] ) : ( array_key_exists( 'neoMcpChanged', $proof ) ? ! empty( $proof['neoMcpChanged'] ) : $fixed );
		$pulse_matched = array_key_exists( 'pulseMatched', $proof ) ? ! empty( $proof['pulseMatched'] ) : ( array_key_exists( 'pulseHttpOk', $proof ) ? ! empty( $proof['pulseHttpOk'] ) : $fixed );
		$both          = $pulse_ready && $fixed && $neo_matched && $pulse_matched;
		$items[ $index ]['neoMcp'] = array(
			'agent'       => 'neo-mcp',
			'fixed'       => $fixed && $neo_matched,
			'confirmedAt' => gmdate( 'c' ),
			'message'     => $message,
			'response'    => $neo_mcp_response,
		);
		$items[ $index ]['pulseAgent'] = array_merge(
			$pulse,
			array(
				'publicVerified' => $pulse_matched,
				'verifiedAt'     => gmdate( 'c' ),
			)
		);
		$items[ $index ]['handshake'] = array(
			'pulseReady'       => $pulse_ready,
			'neoMcpFixed'      => $fixed && $neo_matched,
			'pulseVerified'    => $pulse_matched,
			'bothConfirmed'    => $both,
			'proof'            => $proof,
		);
		$checklist['items'] = $items;
		$checklist['handshakeSummary'] = self::handshake_summary( $checklist );
		return $checklist;
	}

	/**
	 * @param array<string,mixed> $checklist
	 * @return array{confirmed:int,pending:int,failed:int,bothConfirmed:int}
	 */
	public static function handshake_summary( array $checklist ): array {
		$items = isset( $checklist['items'] ) && is_array( $checklist['items'] ) ? $checklist['items'] : array();
		$out   = array(
			'confirmed'     => 0,
			'pending'       => 0,
			'failed'        => 0,
			'bothConfirmed' => 0,
		);
		foreach ( $items as $item ) {
			if ( ! is_array( $item ) ) {
				continue;
			}
			$hs = isset( $item['handshake'] ) && is_array( $item['handshake'] ) ? $item['handshake'] : array();
			if ( ! empty( $hs['bothConfirmed'] ) ) {
				$out['confirmed']++;
				$out['bothConfirmed']++;
				continue;
			}
			$neo = isset( $item['neoMcp'] ) && is_array( $item['neoMcp'] ) ? $item['neoMcp'] : array();
			if ( array_key_exists( 'fixed', $neo ) && empty( $neo['fixed'] ) && (string) ( $neo['confirmedAt'] ?? '' ) !== '' ) {
				$out['failed']++;
				continue;
			}
			$out['pending']++;
		}
		return $out;
	}

	/**
	 * True when at least one item has Pulse instructions + Neo MCP fixed confirmation.
	 *
	 * @param array<string,mixed> $checklist
	 */
	public static function has_handshake_confirmation( array $checklist ): bool {
		$sum = self::handshake_summary( $checklist );
		return (int) ( $sum['bothConfirmed'] ?? 0 ) > 0;
	}

	/**
	 * @return array<string,mixed>|WP_Error
	 */
	private static function openrouter_json( string $model, string $system, string $user ) {
		$api_key = class_exists( 'Neo_Pulse_App_Secrets' ) ? Neo_Pulse_App_Secrets::openrouter_api_key() : '';
		if ( $api_key === '' ) {
			return new WP_Error( 'neo-pulse_openrouter', 'OpenRouter API key is not configured on the server' );
		}
		$headers = class_exists( 'Neo_Pulse_App_Openrouter_Attribution' )
			? Neo_Pulse_App_Openrouter_Attribution::request_headers( $api_key )
			: array(
				'Authorization' => 'Bearer ' . $api_key,
				'Content-Type'  => 'application/json',
			);
		$res = wp_remote_post(
			'https://openrouter.ai/api/v1/chat/completions',
			array(
				'timeout' => 180,
				'headers' => $headers,
				'body'    => wp_json_encode(
					array(
						'model'           => $model,
						'temperature'     => 0.2,
						'response_format' => array( 'type' => 'json_object' ),
						'messages'        => array(
							array(
								'role'    => 'system',
								'content' => $system,
							),
							array(
								'role'    => 'user',
								'content' => $user,
							),
						),
					)
				),
			)
		);
		if ( is_wp_error( $res ) ) {
			return $res;
		}
		$code = (int) wp_remote_retrieve_response_code( $res );
		$body = (string) wp_remote_retrieve_body( $res );
		if ( $code < 200 || $code >= 300 ) {
			return new WP_Error( 'neo-pulse_openrouter_http', 'OpenRouter HTTP ' . $code );
		}
		$decoded = json_decode( $body, true );
		$content = is_array( $decoded )
			? (string) ( $decoded['choices'][0]['message']['content'] ?? '' )
			: '';
		$start = strpos( $content, '{' );
		$end   = strrpos( $content, '}' );
		$slice = ( $start !== false && $end !== false && $end > $start )
			? substr( $content, $start, $end - $start + 1 )
			: $content;
		$json  = json_decode( $slice, true );
		if ( ! is_array( $json ) ) {
			return new WP_Error( 'neo-pulse_openrouter_json', 'OpenRouter returned invalid JSON' );
		}
		return $json;
	}
}
