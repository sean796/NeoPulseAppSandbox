<?php
/**
 * JSON-RPC client for a remote site's Neo MCP endpoint.
 *
 * @package Neo_Pulse_App
 */

defined( 'ABSPATH' ) || exit;

class Neo_Pulse_App_Neo_Mcp_Client {

	/** @var string */
	private $mcp_url;

	/** @var string */
	private $username;

	/** @var string */
	private $app_password;

	/** @var int */
	private $rpc_id = 0;

	/** @var bool */
	private $initialized = false;

	/**
	 * @param string $site_url Site origin (normalized, no trailing slash preferred).
	 * @param string $username WP username / email.
	 * @param string $app_password Application password.
	 */
	public function __construct( $site_url, $username, $app_password ) {
		$root           = untrailingslashit( (string) $site_url );
		$this->mcp_url  = $root . '/wp-json/neo-mcp/v1/mcp';
		$this->username = (string) $username;
		$this->app_password = (string) $app_password;
	}

	/**
	 * @param string               $tool_name Tool name (e.g. neo-mcp_wp).
	 * @param string               $operation Operation name.
	 * @param array<string,mixed>  $arguments Operation arguments.
	 * @return array{ok:bool,text?:string,error?:string,data?:mixed}
	 */
	public function call_tool( $tool_name, $operation, $arguments = array() ) {
		$init = $this->ensure_initialized();
		if ( empty( $init['ok'] ) ) {
			return $init;
		}

		$payload = array(
			'operation' => (string) $operation,
			'arguments' => is_array( $arguments ) ? $arguments : array(),
		);
		$rpc     = $this->rpc(
			'tools/call',
			array(
				'name'      => (string) $tool_name,
				'arguments' => $payload,
			)
		);
		if ( empty( $rpc['ok'] ) ) {
			return $rpc;
		}

		$result = isset( $rpc['result'] ) && is_array( $rpc['result'] ) ? $rpc['result'] : array();
		$text   = '';
		if ( isset( $result['content'] ) && is_array( $result['content'] ) ) {
			foreach ( $result['content'] as $block ) {
				if ( is_array( $block ) && isset( $block['type'] ) && $block['type'] === 'text' && isset( $block['text'] ) ) {
					$text .= (string) $block['text'];
				}
			}
		}
		if ( $text === '' && isset( $result['structuredContent'] ) ) {
			$text = wp_json_encode( $result['structuredContent'] );
		}

		$data = null;
		$trim = trim( $text );
		if ( $trim !== '' && ( $trim[0] === '{' || $trim[0] === '[' ) ) {
			$decoded = json_decode( $trim, true );
			if ( json_last_error() === JSON_ERROR_NONE ) {
				$data = $decoded;
			}
		}

		// neo-mcp_php wraps the return value: { output, return, error }.
		if ( is_array( $data ) && array_key_exists( 'return', $data ) ) {
			$data = $data['return'];
		}

		return array(
			'ok'   => true,
			'text' => $text,
			'data' => $data,
		);
	}

	/**
	 * Fetch a URL from inside the remote WordPress (same-origin sitemap scrape).
	 *
	 * @param string $url Absolute URL on the remote site.
	 * @return array{ok:bool,body?:string,error?:string}
	 */
	public function fetch_url_body( $url ) {
		$url_js = wp_json_encode( (string) $url );
		$code   = 'return (function(){ $r = wp_remote_get(' . $url_js . ', array("timeout"=>45,"redirection"=>3,"sslverify"=>true)); if (is_wp_error($r)) { return array("ok"=>false,"error"=>$r->get_error_message()); } $code = (int) wp_remote_retrieve_response_code($r); $body = (string) wp_remote_retrieve_body($r); if ($code < 200 || $code >= 300) { return array("ok"=>false,"error"=>"HTTP ".$code); } return array("ok"=>true,"body"=>$body); })();';
		$res    = $this->call_tool( 'neo-mcp_php', 'run', array( 'code' => $code ) );
		if ( empty( $res['ok'] ) ) {
			return array( 'ok' => false, 'error' => isset( $res['error'] ) ? (string) $res['error'] : 'Neo MCP PHP failed' );
		}
		$data = isset( $res['data'] ) && is_array( $res['data'] ) ? $res['data'] : null;
		if ( ! $data && isset( $res['text'] ) ) {
			$decoded = json_decode( (string) $res['text'], true );
			if ( is_array( $decoded ) ) {
				$data = $decoded;
			}
		}
		if ( ! is_array( $data ) ) {
			return array( 'ok' => false, 'error' => 'Neo MCP returned no sitemap body' );
		}
		if ( empty( $data['ok'] ) ) {
			return array( 'ok' => false, 'error' => isset( $data['error'] ) ? (string) $data['error'] : 'Sitemap fetch failed' );
		}
		return array( 'ok' => true, 'body' => isset( $data['body'] ) ? (string) $data['body'] : '' );
	}

	/**
	 * List post_date_gmt unix timestamps via WP-CLI (one remote call).
	 *
	 * @param string $post_type Post type slug.
	 * @param string $status Post status.
	 * @return array{ok:bool,timestamps?:array<int,int>,error?:string}
	 */
	public function list_post_date_timestamps_wp_cli( $post_type, $status ) {
		$pt  = preg_replace( '/[^a-z0-9_-]/i', '', (string) $post_type );
		$st  = preg_replace( '/[^a-z0-9_-]/i', '', (string) $status );
		$cmd = sprintf(
			'post list --post_type=%s --post_status=%s --posts_per_page=-1 --fields=ID,post_date_gmt --format=json',
			$pt ? $pt : 'post',
			$st ? $st : 'future'
		);
		$res = $this->call_tool( 'neo-mcp_wp', 'run', array( 'command' => $cmd ) );
		if ( empty( $res['ok'] ) ) {
			return array( 'ok' => false, 'error' => isset( $res['error'] ) ? (string) $res['error'] : 'Neo MCP WP-CLI failed' );
		}

		$stdout   = '';
		$envelope = null;
		$text     = isset( $res['text'] ) ? trim( (string) $res['text'] ) : '';
		if ( $text !== '' ) {
			$envelope = json_decode( $text, true );
		}
		if ( is_array( $envelope ) && isset( $envelope['stdout'] ) ) {
			$stdout = trim( (string) $envelope['stdout'] );
		} elseif ( is_array( $res['data'] ) && isset( $res['data']['stdout'] ) ) {
			$stdout = trim( (string) $res['data']['stdout'] );
		} else {
			$stdout = $text;
		}

		if ( $stdout === '' || $stdout === '[]' ) {
			return array( 'ok' => true, 'timestamps' => array() );
		}

		$rows = json_decode( $stdout, true );
		if ( ! is_array( $rows ) ) {
			return array( 'ok' => false, 'error' => 'Could not parse WP-CLI post list' );
		}

		$timestamps = array();
		foreach ( $rows as $row ) {
			if ( ! is_array( $row ) ) {
				continue;
			}
			$raw = isset( $row['post_date_gmt'] ) ? (string) $row['post_date_gmt'] : '';
			if ( $raw === '' ) {
				continue;
			}
			$ts = strtotime( $raw . ( strpos( $raw, 'Z' ) !== false || strpos( $raw, '+' ) !== false ? '' : ' UTC' ) );
			if ( ! $ts ) {
				$ts = strtotime( $raw );
			}
			if ( $ts ) {
				$timestamps[] = (int) $ts;
			}
		}
		return array( 'ok' => true, 'timestamps' => $timestamps );
	}

	/**
	 * Count posts via WP-CLI on the remote site (scheduled / future).
	 *
	 * @param string $post_type Post type slug.
	 * @param string $status Post status.
	 * @param string $after_iso Inclusive start ISO8601.
	 * @param string $before_iso Exclusive end ISO8601.
	 * @return array{ok:bool,count?:int,error?:string}
	 */
	public function count_posts_wp_cli( $post_type, $status, $after_iso, $before_iso ) {
		$list = $this->list_post_date_timestamps_wp_cli( $post_type, $status );
		if ( empty( $list['ok'] ) ) {
			return $list;
		}
		$after_ts  = strtotime( trim( (string) $after_iso ) );
		$before_ts = strtotime( trim( (string) $before_iso ) );
		if ( ! $after_ts || ! $before_ts ) {
			return array( 'ok' => false, 'error' => 'Invalid after/before for scheduled count' );
		}
		$count = 0;
		foreach ( $list['timestamps'] as $ts ) {
			if ( $ts >= $after_ts && $ts < $before_ts ) {
				++$count;
			}
		}
		return array( 'ok' => true, 'count' => $count );
	}

	/**
	 * @return array{ok:bool,error?:string}
	 */
	private function ensure_initialized() {
		if ( $this->initialized ) {
			return array( 'ok' => true );
		}
		$init = $this->rpc(
			'initialize',
			array(
				'protocolVersion' => '2025-03-26',
				'capabilities'    => new stdClass(),
				'clientInfo'      => array(
					'name'    => 'neo-pulse-app-editorial-counts',
					'version' => '1.0.0',
				),
			)
		);
		if ( empty( $init['ok'] ) ) {
			return $init;
		}
		$this->notify( 'notifications/initialized', new stdClass() );
		$this->initialized = true;
		return array( 'ok' => true );
	}

	/**
	 * @param string $method RPC method.
	 * @param mixed  $params Params.
	 * @return array{ok:bool,result?:mixed,error?:string}
	 */
	private function rpc( $method, $params ) {
		++$this->rpc_id;
		$body = array(
			'jsonrpc' => '2.0',
			'id'      => $this->rpc_id,
			'method'  => (string) $method,
			'params'  => $params,
		);
		$res  = $this->http_post( $body );
		if ( empty( $res['ok'] ) ) {
			return $res;
		}
		$parsed = $this->parse_rpc_response( $res['raw'] );
		if ( isset( $parsed['error'] ) ) {
			$err = $parsed['error'];
			$msg = is_array( $err ) && isset( $err['message'] ) ? (string) $err['message'] : 'Neo MCP RPC error';
			return array( 'ok' => false, 'error' => $msg );
		}
		return array(
			'ok'     => true,
			'result' => isset( $parsed['result'] ) ? $parsed['result'] : null,
		);
	}

	/**
	 * @param string $method Notification method.
	 * @param mixed  $params Params.
	 * @return void
	 */
	private function notify( $method, $params ) {
		$body = array(
			'jsonrpc' => '2.0',
			'method'  => (string) $method,
			'params'  => $params,
		);
		$this->http_post( $body );
	}

	/**
	 * @param array<string,mixed> $body JSON body.
	 * @return array{ok:bool,raw?:string,error?:string}
	 */
	private function http_post( $body ) {
		$auth = base64_encode( $this->username . ':' . $this->app_password );
		$args = array(
			'timeout' => 60,
			'headers' => array(
				'Authorization' => 'Basic ' . $auth,
				'Content-Type'  => 'application/json',
				'Accept'        => 'application/json, text/event-stream',
			),
			'body'    => wp_json_encode( $body ),
		);
		$resp = wp_remote_post( $this->mcp_url, $args );
		if ( is_wp_error( $resp ) ) {
			return array( 'ok' => false, 'error' => $resp->get_error_message() );
		}
		$code = (int) wp_remote_retrieve_response_code( $resp );
		$raw  = (string) wp_remote_retrieve_body( $resp );
		if ( $code === 401 || $code === 403 ) {
			return array( 'ok' => false, 'error' => 'Neo MCP authentication failed. Check username and application password.' );
		}
		if ( $code < 200 || $code >= 300 ) {
			return array( 'ok' => false, 'error' => 'Neo MCP HTTP ' . $code );
		}
		return array( 'ok' => true, 'raw' => $raw );
	}

	/**
	 * @param string $raw Response body (JSON or SSE).
	 * @return array<string,mixed>
	 */
	private function parse_rpc_response( $raw ) {
		$trim = trim( (string) $raw );
		if ( $trim === '' ) {
			return array( 'error' => array( 'message' => 'Empty Neo MCP response' ) );
		}
		if ( strpos( $trim, 'data:' ) !== false ) {
			$lines = preg_split( '/\r\n|\n|\r/', $trim );
			foreach ( $lines as $line ) {
				$line = trim( (string) $line );
				if ( strpos( $line, 'data:' ) !== 0 ) {
					continue;
				}
				$json = trim( substr( $line, 5 ) );
				$decoded = json_decode( $json, true );
				if ( is_array( $decoded ) && ( isset( $decoded['result'] ) || isset( $decoded['error'] ) ) ) {
					return $decoded;
				}
			}
		}
		$decoded = json_decode( $trim, true );
		return is_array( $decoded ) ? $decoded : array( 'error' => array( 'message' => 'Invalid Neo MCP JSON' ) );
	}
}
