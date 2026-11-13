<?php
/**
 * POST /wordpress/ai-import-client — Neo MCP import + OpenRouter profile extract.
 *
 * @package Neo_Pulse_App
 */

defined( 'ABSPATH' ) || exit;

class Neo_Pulse_App_Wp_Ai_Import_Client {

	const DEFAULT_MODEL = 'google/gemini-2.5-flash';

	/**
	 * @param array<string,mixed> $body Request body.
	 * @return array{0:int,1:array<string,mixed>}
	 */
	public static function import( $body ) {
		$site_url     = isset( $body['siteUrl'] ) ? (string) $body['siteUrl'] : '';
		$username     = isset( $body['username'] ) ? (string) $body['username'] : '';
		$app_password = isset( $body['appPassword'] ) ? (string) $body['appPassword'] : '';

		if ( $site_url === '' || $username === '' || $app_password === '' ) {
			return array(
				400,
				array(
					'success' => false,
					'error'   => 'Missing required fields: siteUrl, username, appPassword',
					'code'    => 'missing_fields',
				),
			);
		}

		$normalized = Neo_Pulse_App_Wp_Url_Normalize::normalize_url( $site_url );
		$conn       = Neo_Pulse_App_Wp_Connection::test_connection(
			array(
				'siteUrl'     => $normalized,
				'username'    => $username,
				'appPassword' => $app_password,
			)
		);
		$conn_body = isset( $conn[1] ) && is_array( $conn[1] ) ? $conn[1] : array();
		if ( empty( $conn_body['success'] ) ) {
			return array(
				200,
				array(
					'success' => false,
					'error'   => isset( $conn_body['message'] ) ? (string) $conn_body['message'] : 'WordPress connection failed',
					'code'    => 'connection_failed',
				),
			);
		}

		$mcp = new Neo_Pulse_App_Neo_Mcp_Client( $normalized, $username, $app_password );
		$info = $mcp->call_tool( 'neo-mcp_site', 'info', array() );
		if ( empty( $info['ok'] ) ) {
			return array(
				200,
				array(
					'success' => false,
					'error'   => isset( $info['error'] ) ? (string) $info['error'] : 'Neo MCP is unavailable on this site. Install and license Neo MCP, then retry.',
					'code'    => 'neo_mcp_unavailable',
				),
			);
		}

		$home = $mcp->call_tool(
			'neo-mcp_site',
			'fetch',
			array(
				'url'       => '/',
				'max_bytes' => 300000,
			)
		);
		if ( empty( $home['ok'] ) ) {
			return array(
				200,
				array(
					'success' => false,
					'error'   => isset( $home['error'] ) ? (string) $home['error'] : 'Neo MCP could not fetch the site homepage',
					'code'    => 'neo_mcp_fetch_failed',
				),
			);
		}

		$html = self::homepage_html_from_mcp( $home );
		if ( $html === '' ) {
			return array(
				200,
				array(
					'success' => false,
					'error'   => 'Neo MCP returned an empty homepage',
					'code'    => 'neo_mcp_fetch_failed',
				),
			);
		}

		$nap  = self::read_nap_via_mcp( $mcp );
		$logo = self::extract_logo_url( $html, $normalized );

		$site_name = '';
		if ( ! empty( $conn_body['siteInfo']['name'] ) ) {
			$site_name = (string) $conn_body['siteInfo']['name'];
		}

		$extract = self::openrouter_extract( $normalized, $site_name, $html, $nap );
		if ( empty( $extract['ok'] ) ) {
			return array(
				200,
				array(
					'success' => false,
					'error'   => isset( $extract['error'] ) ? (string) $extract['error'] : 'AI extract failed',
					'code'    => 'ai_extract_failed',
				),
			);
		}

		$parsed = $extract['parsed'];
		$name   = self::clean_string( $parsed['name'] ?? '' );
		if ( $name === '' ) {
			$name = $site_name !== '' ? $site_name : self::hostname_label( $normalized );
		}

		$city    = self::clean_string( $parsed['city'] ?? '' );
		$state   = self::clean_string( $parsed['state'] ?? '' );
		$country = self::clean_string( $parsed['country'] ?? '' );
		$keyword = self::clean_string( $parsed['primaryLocalKeyword'] ?? '' );

		$sitemap_url = '';
		$detect      = Neo_Pulse_App_Wp_Sitemap::detect_sitemaps(
			array(
				'siteUrl'     => $normalized,
				'username'    => $username,
				'appPassword' => $app_password,
			)
		);
		if ( isset( $detect[1] ) && is_array( $detect[1] ) && ! empty( $detect[1]['found'] ) && ! empty( $detect[1]['sitemapUrl'] ) ) {
			$sitemap_url = (string) $detect[1]['sitemapUrl'];
		}

		$locations = array();
		if ( $city !== '' || $state !== '' || $country !== '' ) {
			$locations[] = array(
				'id'        => 'loc-import-default',
				'name'      => $name,
				'address'   => '',
				'city'      => $city,
				'state'     => $state,
				'country'   => $country !== '' ? $country : null,
				'zip'       => '',
				'phone'     => '',
				'isDefault' => true,
			);
		}

		return array(
			200,
			array(
				'success'             => true,
				'name'                => $name,
				'siteUrl'             => $normalized,
				'primaryLocalKeyword' => $keyword !== '' ? $keyword : null,
				'clientLogoUrl'       => $logo !== '' ? $logo : null,
				'serviceCity'         => $city !== '' ? $city : null,
				'serviceState'        => $state !== '' ? $state : null,
				'serviceCountry'      => $country !== '' ? $country : null,
				'locations'           => $locations,
				'sitemapUrl'          => $sitemap_url !== '' ? $sitemap_url : null,
				'capabilities'        => isset( $conn_body['capabilities'] ) ? $conn_body['capabilities'] : null,
			),
		);
	}

	/**
	 * @param array{ok?:bool,text?:string,data?:mixed,error?:string} $home Neo MCP tool result.
	 * @return string
	 */
	private static function homepage_html_from_mcp( $home ) {
		if ( isset( $home['data'] ) && is_array( $home['data'] ) ) {
			$data = $home['data'];
			if ( isset( $data['body'] ) && is_string( $data['body'] ) ) {
				return $data['body'];
			}
			if ( isset( $data['html'] ) && is_string( $data['html'] ) ) {
				return $data['html'];
			}
			if ( isset( $data['content'] ) && is_string( $data['content'] ) ) {
				return $data['content'];
			}
		}
		$text = isset( $home['text'] ) ? (string) $home['text'] : '';
		if ( $text !== '' && ( $text[0] === '{' || $text[0] === '[' ) ) {
			$decoded = json_decode( $text, true );
			if ( is_array( $decoded ) ) {
				if ( isset( $decoded['body'] ) && is_string( $decoded['body'] ) ) {
					return $decoded['body'];
				}
				if ( isset( $decoded['html'] ) && is_string( $decoded['html'] ) ) {
					return $decoded['html'];
				}
			}
		}
		return $text;
	}

	/**
	 * @param Neo_Pulse_App_Neo_Mcp_Client $mcp Client.
	 * @return string
	 */
	private static function read_nap_via_mcp( $mcp ) {
		$code = 'return (function(){ $out = array(); $opts = array("blogname","blogdescription","timezone_string"); foreach ($opts as $k) { $out[$k] = (string) get_option($k, ""); } if (function_exists("get_bloginfo")) { $out["name"] = (string) get_bloginfo("name"); $out["description"] = (string) get_bloginfo("description"); $out["url"] = (string) get_bloginfo("url"); } return $out; })();';
		$res  = $mcp->call_tool( 'neo-mcp_php', 'run', array( 'code' => $code ) );
		if ( empty( $res['ok'] ) ) {
			return '';
		}
		if ( isset( $res['data'] ) && is_array( $res['data'] ) ) {
			return (string) wp_json_encode( $res['data'] );
		}
		return isset( $res['text'] ) ? (string) $res['text'] : '';
	}

	/**
	 * @param string $html Homepage HTML.
	 * @param string $site_url Normalized site URL.
	 * @return string
	 */
	private static function extract_logo_url( $html, $site_url ) {
		if ( $html === '' ) {
			return '';
		}
		if ( preg_match( '/property=["\']og:image["\'][^>]*content=["\']([^"\']+)["\']/i', $html, $m ) ) {
			return self::absolutize_url( $m[1], $site_url );
		}
		if ( preg_match( '/content=["\']([^"\']+)["\'][^>]*property=["\']og:image["\']/i', $html, $m ) ) {
			return self::absolutize_url( $m[1], $site_url );
		}
		if ( preg_match( '/rel=["\']apple-touch-icon["\'][^>]*href=["\']([^"\']+)["\']/i', $html, $m ) ) {
			return self::absolutize_url( $m[1], $site_url );
		}
		return '';
	}

	/**
	 * @param string $maybe Relative or absolute URL.
	 * @param string $site_url Site origin.
	 * @return string
	 */
	private static function absolutize_url( $maybe, $site_url ) {
		$maybe = trim( (string) $maybe );
		if ( $maybe === '' ) {
			return '';
		}
		if ( preg_match( '#^https?://#i', $maybe ) ) {
			return $maybe;
		}
		if ( strpos( $maybe, '//' ) === 0 ) {
			return 'https:' . $maybe;
		}
		return rtrim( $site_url, '/' ) . '/' . ltrim( $maybe, '/' );
	}

	/**
	 * @param string $site_url Site URL.
	 * @param string $site_name WP site name.
	 * @param string $html Homepage HTML.
	 * @param string $nap_json NAP/options JSON text.
	 * @return array{ok:bool,parsed?:array<string,mixed>,error?:string}
	 */
	private static function openrouter_extract( $site_url, $site_name, $html, $nap_json ) {
		if ( ! class_exists( 'Neo_Pulse_App_Chat_Openrouter' ) ) {
			return array( 'ok' => false, 'error' => 'OpenRouter is not available on the server' );
		}

		$text = wp_strip_all_tags( $html );
		$text = preg_replace( '/\s+/', ' ', (string) $text );
		$text = substr( trim( (string) $text ), 0, 8000 );

		$system = 'Extract business profile fields for a WordPress client property. Use ONLY the provided site text and NAP/options JSON. Do not invent brands, cities, or keywords. If unknown, use an empty string. Return JSON only.';
		$user   = "Site URL: {$site_url}\nWordPress name: {$site_name}\nNAP/options JSON:\n{$nap_json}\n\nHomepage text:\n{$text}\n\nReturn JSON object with keys: name, primaryLocalKeyword, city, state, country.";

		try {
			$parsed = Neo_Pulse_App_Chat_Openrouter::json_completion(
				array(
					array( 'role' => 'system', 'content' => $system ),
					array( 'role' => 'user', 'content' => $user ),
				),
				array(
					'model'       => self::DEFAULT_MODEL,
					'temperature' => 0.1,
					'maxTokens'   => 1024,
				)
			);
		} catch ( Exception $e ) {
			return array( 'ok' => false, 'error' => $e->getMessage() );
		}

		if ( ! is_array( $parsed ) ) {
			return array( 'ok' => false, 'error' => 'AI returned invalid JSON' );
		}

		return array( 'ok' => true, 'parsed' => $parsed );
	}

	/**
	 * @param mixed $value Raw value.
	 * @return string
	 */
	private static function clean_string( $value ) {
		return is_string( $value ) ? trim( $value ) : '';
	}

	/**
	 * @param string $url Site URL.
	 * @return string
	 */
	private static function hostname_label( $url ) {
		$host = wp_parse_url( $url, PHP_URL_HOST );
		return is_string( $host ) && $host !== '' ? preg_replace( '/^www\./i', '', $host ) : 'New Site';
	}
}
