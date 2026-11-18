<?php
/**
 * Cannibalization Audit: ask Neo MCP, one Pulse Redirect sheet (suggest only).
 *
 * @package Neo_Pulse_App
 */

defined( 'ABSPATH' ) || exit;

class Neo_Pulse_App_Cannibalization_Audit_Pipeline {

	const ALREADY_301ED = array(
		'/blog/smart-blinds/',
		'/blog/smartblinds-advanceblinds/',
		'/blog/motorized-blinds-home-automation/',
		'/blog/the-ultimate-guide-to-motorized-blinds-convenience-and-style/',
		'/blog/the-top-5-benefits-of-motorized-blinds-for-your-home/',
		'/blog/upgrade-your-home-how-smart-blinds-integrate-with-your-smart-home-system/',
		'/blog/unlock-convenience-the-top-5-benefits-of-motorized-blinds-for-your-home/',
	);

	/**
	 * @param array<string,mixed> $site
	 * @return array<string,mixed>|WP_Error
	 */
	public static function build_map( array $site ) {
		$posts = self::ask_neo_mcp_posts( $site );
		if ( is_wp_error( $posts ) ) {
			return $posts;
		}
		if ( $posts === array() ) {
			return array(
				'siteId'        => (string) ( $site['id'] ?? '' ),
				'siteUrl'       => (string) ( $site['siteUrl'] ?? '' ),
				'siteName'      => Neo_Pulse_App_Editorial_Content_Audit_Worker::public_name( $site ),
				'pageCount'     => 0,
				'redirectCount' => 0,
				'leaveCount'    => 0,
				'redirects'     => array(),
				'leave'         => array(),
			);
		}

		$answer = self::ask_redirect_decision( $posts, 'blog', $site );
		if ( is_wp_error( $answer ) ) {
			return $answer;
		}

		$areas = self::ask_neo_mcp_posts( $site, 'service-area' );
		if ( is_wp_error( $areas ) ) {
			return $areas;
		}
		$service_answer = '';
		if ( $areas !== array() ) {
			$service = self::ask_redirect_decision( $areas, 'service-area', $site );
			if ( is_wp_error( $service ) ) {
				return $service;
			}
			$service_answer = $service;
		}

		return array(
			'siteId'         => (string) ( $site['id'] ?? '' ),
			'siteUrl'        => (string) ( $site['siteUrl'] ?? '' ),
			'siteName'       => Neo_Pulse_App_Editorial_Content_Audit_Worker::public_name( $site ),
			'pageCount'      => count( $posts ),
			'redirectCount'  => 1,
			'leaveCount'     => 0,
			'answer'         => $answer,
			'serviceAnswer'  => $service_answer,
			'serviceCount'   => count( $areas ),
			'redirects'      => array(),
			'leave'          => array(),
		);
	}

	/**
	 * Service areas only. Same OpenRouter sheet reply as blog posts.
	 *
	 * @param array<string,mixed> $site
	 * @return array<string,mixed>|WP_Error
	 */
	public static function service_area_map( array $site ) {
		$areas = self::ask_neo_mcp_posts( $site, 'service-area' );
		if ( is_wp_error( $areas ) ) {
			return $areas;
		}
		if ( $areas === array() ) {
			return array(
				'answer'       => '',
				'serviceCount' => 0,
				'siteName'     => Neo_Pulse_App_Editorial_Content_Audit_Worker::public_name( $site ),
			);
		}
		$answer = self::ask_redirect_decision( $areas, 'service-area', $site );
		if ( is_wp_error( $answer ) ) {
			return $answer;
		}
		return array(
			'answer'       => $answer,
			'serviceCount' => count( $areas ),
			'siteName'     => Neo_Pulse_App_Editorial_Content_Audit_Worker::public_name( $site ),
		);
	}

	/**
	 * Blog posts only. Same OpenRouter sheet reply as service areas.
	 *
	 * @param array<string,mixed> $site
	 * @return array<string,mixed>|WP_Error
	 */
	public static function blog_map( array $site ) {
		$posts = self::ask_neo_mcp_posts( $site, 'post' );
		if ( is_wp_error( $posts ) ) {
			return $posts;
		}
		if ( $posts === array() ) {
			return array(
				'answer'    => '',
				'pageCount' => 0,
				'siteName'  => Neo_Pulse_App_Editorial_Content_Audit_Worker::public_name( $site ),
			);
		}
		$answer = self::ask_redirect_decision( $posts, 'blog', $site );
		if ( is_wp_error( $answer ) ) {
			return $answer;
		}
		return array(
			'answer'    => $answer,
			'pageCount' => count( $posts ),
			'siteName'  => Neo_Pulse_App_Editorial_Content_Audit_Worker::public_name( $site ),
		);
	}

	/**
	 * @param array<string,mixed> $site
	 * @return array<int,array<string,mixed>>|WP_Error
	 */
	private static function ask_neo_mcp_posts( array $site, string $post_type = 'post' ) {
		$site_url     = trim( (string) ( $site['siteUrl'] ?? '' ) );
		$username     = trim( (string) ( $site['username'] ?? '' ) );
		$app_password = (string) ( $site['appPassword'] ?? '' );
		if ( $site_url === '' || $username === '' || $app_password === '' ) {
			return new WP_Error( 'neo-pulse_cannibal_auth', 'Site is missing WordPress credentials' );
		}
		if ( ! class_exists( 'Neo_Pulse_App_Neo_Mcp_Client' ) ) {
			return new WP_Error( 'neo-pulse_cannibal_mcp', 'Neo MCP client is not loaded' );
		}

		$mcp  = new Neo_Pulse_App_Neo_Mcp_Client( $site_url, $username, $app_password );
		$type = preg_replace( '/[^a-z0-9_-]/i', '', $post_type );
		$type = $type !== '' ? $type : 'post';
		$code = 'return array_values(array_map(function($p){ return array("id"=>(int)$p->ID,"title"=>get_the_title($p),"slug"=>$p->post_name,"url"=>get_permalink($p),"dateGmt"=>get_post_field("post_date_gmt",$p)); }, get_posts(array("post_type"=>"' . $type . '","post_status"=>"publish","numberposts"=>-1,"orderby"=>"date","order"=>"DESC"))));';
		$res  = $mcp->call_tool( 'neo-mcp_php', 'run', array( 'code' => $code ) );
		if ( empty( $res['ok'] ) ) {
			return new WP_Error(
				'neo-pulse_cannibal_mcp',
				(string) ( $res['error'] ?? 'Neo MCP did not return published blog posts' )
			);
		}

		$rows = isset( $res['data'] ) && is_array( $res['data'] ) ? $res['data'] : array();
		$out  = array();
		foreach ( $rows as $row ) {
			if ( ! is_array( $row ) ) {
				continue;
			}
			$url = trim( (string) ( $row['url'] ?? '' ) );
			if ( $url === '' ) {
				continue;
			}
			if ( $type === 'post' && stripos( $url, '/blog/' ) === false ) {
				continue;
			}
			$out[] = array(
				'id'      => (int) ( $row['id'] ?? 0 ),
				'url'     => $url,
				'slug'    => (string) ( $row['slug'] ?? '' ),
				'title'   => trim( (string) ( $row['title'] ?? 'Untitled' ) ),
				'dateGmt' => (string) ( $row['dateGmt'] ?? '' ),
			);
		}
		return $out;
	}

	/**
	 * @param array<int,array<string,mixed>> $posts
	 * @param array<string,mixed>            $site
	 * @return string|WP_Error
	 */
	private static function ask_redirect_decision( array $posts, string $kind, array $site ) {
		$model = class_exists( 'Neo_Pulse_App_Openrouter_Agent_Models' )
			? Neo_Pulse_App_Openrouter_Agent_Models::resolve( Neo_Pulse_App_Openrouter_Agent_Models::CATEGORY_RESEARCH )
			: '';
		if ( $model === '' ) {
			return new WP_Error( 'neo-pulse_cannibal_model', 'Research model is not configured' );
		}

		$clicks = self::gsc_clicks_by_url( (string) ( $site['siteUrl'] ?? '' ) );
		if ( is_wp_error( $clicks ) ) {
			return $clicks;
		}

		$ranked = array();
		foreach ( $posts as $post ) {
			$url = (string) ( $post['url'] ?? '' );
			$n   = self::norm_url( $url );
			$c   = isset( $clicks[ $n ] ) ? (int) $clicks[ $n ] : 0;
			$ranked[] = array(
				'clicks' => $c,
				'url'    => $url,
				'title'  => (string) ( $post['title'] ?? '' ),
			);
		}
		usort(
			$ranked,
			static function ( array $a, array $b ): int {
				return (int) $b['clicks'] - (int) $a['clicks'];
			}
		);

		$zero  = array();
		$alive = array();
		$all   = array();
		foreach ( $ranked as $row ) {
			$line = (int) $row['clicks'] . ' clicks | ' . $row['url'] . ' | ' . $row['title'];
			$all[] = $line;
			if ( (int) $row['clicks'] < 1 ) {
				$zero[] = $line;
			} else {
				$alive[] = $line;
			}
		}
		if ( $kind === 'service-area' ) {
			return self::service_area_junk_sheet( $model, $zero, $alive, $clicks );
		}

		$system = 'Write the Pulse Redirect sheet for these blog posts. '
			. 'First line: id,source,matching,destination,type,category,status,ignore. '
			. 'Then one row per redirect. source is the path after the domain, with a trailing slash. destination is the full keeper URL. matching is exact. type is 301. status is active. category and ignore blank. '
			. 'One keeper per similar intent. No chains. URLs from the list only. '
			. 'The destination is the URL in the group with the most clicks. '
			. 'Never put a higher-click URL in source. Never redirect a page with more clicks to a page with fewer clicks. '
			. 'Never self-redirect: if source path matches the destination path, omit that row. '
			. 'Keepers are destinations only. Never put a keeper URL in the source column.';
		$user = "Published blog posts (last 90 days Search Console clicks):\n" . implode( "\n", $all )
			. "\n\nNever write a row that redirects a path to the same path. Leave keepers off the source column.";

		return self::openrouter_json( $model, $system, $user );
	}

	/**
	 * Classify thin junk among 0-click pages, then map only those to same-place keepers.
	 *
	 * @param array<int,string> $zero
	 * @param array<int,string> $alive
	 * @param array<string,int> $clicks
	 * @return string|WP_Error
	 */
	private static function service_area_junk_sheet( string $model, array $zero, array $alive, array $clicks ) {
		if ( $zero === array() ) {
			return "id,source,matching,destination,type,category,status,ignore\n";
		}
		$zero_urls = array();
		foreach ( $zero as $line ) {
			$parts = explode( ' | ', $line, 3 );
			$url   = trim( (string) ( $parts[1] ?? '' ) );
			if ( $url !== '' ) {
				$zero_urls[ self::path_only( $url ) ] = $url;
			}
		}
		$classify_system = 'Mark thin service-area junk only. '
			. 'Reply with junk URLs only, one full URL per line, nothing else. '
			. 'Junk = near-street spam (slug contains near and a street number), scrap, or an exact duplicate of another URL for the same place. '
			. 'KEEP and omit: every real city, town, mall, and neighborhood page (examples: wellington-edmonton, alberta-avenue, londonderry-mall, grande-prairie, st-albert, sherwood-park). '
			. 'Most 0-click pages are KEEP. A short list is correct. Empty is correct. Never mark a neighborhood as junk just because it has 0 clicks.';
		$classify_user   = "0-click service area pages:\n" . implode( "\n", $zero )
			. "\n\nReturn only thin junk URLs. Omit real locations. Prefer few or none.";
		$junk_raw = self::openrouter_json( $model, $classify_system, $classify_user );
		if ( is_wp_error( $junk_raw ) ) {
			return $junk_raw;
		}
		$junk_urls = self::parse_junk_urls( (string) $junk_raw, $zero_urls );
		if ( count( $junk_urls ) > 25 ) {
			$retry = self::openrouter_json(
				$model,
				$classify_system . ' You returned too many. Real locations leaked. Return at most 25 thin junk URLs.',
				$classify_user . "\n\nYour previous list was too large. Keep only near-street spam, scrap, and exact same-place duplicates."
			);
			if ( is_wp_error( $retry ) ) {
				return $retry;
			}
			$junk_urls = self::parse_junk_urls( (string) $retry, $zero_urls );
			if ( count( $junk_urls ) > 25 ) {
				$junk_urls = array_slice( $junk_urls, 0, 25, true );
			}
		}
		if ( $junk_urls === array() ) {
			return "id,source,matching,destination,type,category,status,ignore\n";
		}
		$junk_lines = array();
		foreach ( $junk_urls as $url ) {
			$junk_lines[] = '0 clicks | ' . $url;
		}
		$map_system = 'Write the Pulse Redirect sheet for these junk service-area URLs only. '
			. 'First line: id,source,matching,destination,type,category,status,ignore. '
			. 'Then one row per redirect. source is the path after the domain, with a trailing slash. destination is the full keeper URL. matching is exact. type is 301. status is active. category and ignore blank. '
			. 'Source may only be a junk URL from the junk list. Do not invent other sources. '
			. 'Destination must be the same-place page with clicks from the keeper list. '
			. 'Never fold different cities, towns, or neighborhoods into one hub. '
			. 'If no same-place keeper exists, omit that junk URL. Never self-redirect.';
		$map_user   = "Junk URLs (sources only):\n" . implode( "\n", $junk_lines )
			. "\n\nKeeper pages with clicks (destinations only):\n"
			. ( $alive !== array() ? implode( "\n", $alive ) : '(none)' )
			. "\n\nMap each junk URL to the same-place keeper only. Omit when no same-place keeper exists. Do not add sources that are not on the junk list.";
		$answer = self::openrouter_json( $model, $map_system, $map_user );
		if ( is_wp_error( $answer ) ) {
			return $answer;
		}
		$filtered = self::filter_service_answer_zero_click_sources( (string) $answer, $clicks );
		return self::filter_service_answer_allowed_sources( $filtered, $junk_urls );
	}

	/**
	 * @param array<string,string> $zero_urls path => url
	 * @return array<string,string> path => url
	 */
	private static function parse_junk_urls( string $junk_raw, array $zero_urls ): array {
		$junk_urls = array();
		foreach ( preg_split( '/\r\n|\n|\r/', $junk_raw ) as $line ) {
			$line = trim( (string) $line );
			if ( $line === '' || stripos( $line, 'http' ) === false ) {
				continue;
			}
			if ( preg_match( '#https?://[^\s,]+#i', $line, $m ) ) {
				$line = rtrim( (string) $m[0], '.,);]' );
			}
			$path = self::path_only( $line );
			if ( $path === '' || ! isset( $zero_urls[ $path ] ) ) {
				continue;
			}
			$junk_urls[ $path ] = $zero_urls[ $path ];
		}
		return $junk_urls;
	}

	/**
	 * @param array<string,string> $allowed_sources path => url
	 */
	private static function filter_service_answer_allowed_sources( string $answer, array $allowed_sources ): string {
		$out = array();
		$id  = 1;
		foreach ( preg_split( '/\r\n|\n|\r/', $answer ) as $i => $line ) {
			$line = trim( (string) $line );
			if ( $line === '' ) {
				continue;
			}
			$cols = str_getcsv( $line );
			if ( $i === 0 && strtolower( trim( (string) ( $cols[0] ?? '' ) ) ) === 'id' ) {
				$out[] = $line;
				continue;
			}
			$path = self::path_only( (string) ( $cols[1] ?? '' ) );
			if ( $path === '' || ! isset( $allowed_sources[ $path ] ) ) {
				continue;
			}
			$cols[0] = (string) $id;
			$out[]   = self::csv_line( $cols );
			++$id;
		}
		if ( $out === array() ) {
			return "id,source,matching,destination,type,category,status,ignore\n";
		}
		return implode( "\n", $out ) . "\n";
	}

	/**
	 * Service-area sources must be 0-click paths. Drop any row that redirects a page with clicks.
	 *
	 * @param array<string,int> $clicks
	 */
	private static function filter_service_answer_zero_click_sources( string $answer, array $clicks ): string {
		$by_path = array();
		foreach ( $clicks as $url => $c ) {
			$path = self::path_only( (string) $url );
			if ( $path === '' ) {
				continue;
			}
			$by_path[ $path ] = max( (int) ( $by_path[ $path ] ?? 0 ), (int) $c );
		}
		$out = array();
		$id  = 1;
		foreach ( preg_split( '/\r\n|\n|\r/', $answer ) as $i => $line ) {
			$line = trim( (string) $line );
			if ( $line === '' ) {
				continue;
			}
			$cols = str_getcsv( $line );
			if ( $i === 0 && strtolower( trim( (string) ( $cols[0] ?? '' ) ) ) === 'id' ) {
				$out[] = $line;
				continue;
			}
			$source = trim( (string) ( $cols[1] ?? '' ) );
			$path   = self::path_only( $source );
			if ( $path !== '' && (int) ( $by_path[ $path ] ?? 0 ) > 0 ) {
				continue;
			}
			$cols[0] = (string) $id;
			$out[]   = self::csv_line( $cols );
			++$id;
		}
		if ( $out === array() ) {
			return "id,source,matching,destination,type,category,status,ignore\n";
		}
		return implode( "\n", $out ) . "\n";
	}

	private static function path_only( string $value ): string {
		$value = trim( $value );
		if ( $value === '' ) {
			return '';
		}
		if ( stripos( $value, 'http://' ) === 0 || stripos( $value, 'https://' ) === 0 ) {
			$parts = wp_parse_url( $value );
			$value = is_array( $parts ) && isset( $parts['path'] ) ? (string) $parts['path'] : '';
		}
		$value = strtolower( (string) preg_replace( '#/+#', '/', $value ) );
		$value = trim( $value, '/' );
		return $value === '' ? '' : $value . '/';
	}

	/**
	 * @param array<int,string> $cols
	 */
	private static function csv_line( array $cols ): string {
		$out = array();
		foreach ( $cols as $col ) {
			$col   = str_replace( '"', '""', (string) $col );
			$out[] = '"' . $col . '"';
		}
		return implode( ',', $out );
	}

	/**
	 * @return array<string,int>|WP_Error
	 */
	private static function gsc_clicks_by_url( string $site_url ) {
		$site_url = trim( $site_url );
		if ( $site_url === '' ) {
			return new WP_Error( 'neo-pulse_cannibal_gsc', 'Site URL is missing for Search Console clicks' );
		}
		if ( ! class_exists( 'Neo_Pulse_App_Gsc_Performance_Batch' ) ) {
			return new WP_Error( 'neo-pulse_cannibal_gsc', 'Search Console batch is not loaded' );
		}
		$end   = gmdate( 'Y-m-d' );
		$start = gmdate( 'Y-m-d', strtotime( '-90 days' ) );
		$res   = Neo_Pulse_App_Gsc_Performance_Batch::top_pages(
			array(
				'siteUrl'   => $site_url,
				'startDate' => $start,
				'endDate'   => $end,
				'limit'     => 1000,
			)
		);
		$body = isset( $res['body'] ) && is_array( $res['body'] ) ? $res['body'] : array();
		if ( empty( $body['success'] ) ) {
			return new WP_Error(
				'neo-pulse_cannibal_gsc',
				(string) ( $body['error'] ?? 'Search Console clicks failed' )
			);
		}
		$out = array();
		foreach ( (array) ( $body['pages'] ?? array() ) as $page ) {
			if ( ! is_array( $page ) ) {
				continue;
			}
			$norm = self::norm_url( (string) ( $page['url'] ?? '' ) );
			if ( $norm === '' ) {
				continue;
			}
			$out[ $norm ] = (int) ( $page['clicks'] ?? 0 );
		}
		return $out;
	}

	/**
	 * @return string|WP_Error
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
						'temperature'     => 0.1,
						'max_tokens'      => 8192,
						'reasoning'       => array( 'enabled' => false ),
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
		$message = is_array( $decoded ) && isset( $decoded['choices'][0]['message'] ) && is_array( $decoded['choices'][0]['message'] )
			? $decoded['choices'][0]['message']
			: array();
		$content = self::message_text( $message );
		if ( $content === '' ) {
			return new WP_Error( 'neo-pulse_openrouter_json', 'OpenRouter reply was empty' );
		}
		return $content;
	}

	/**
	 * @param array<string,mixed> $message
	 */
	private static function message_text( array $message ): string {
		$content = $message['content'] ?? '';
		if ( is_array( $content ) ) {
			$parts = array();
			foreach ( $content as $part ) {
				if ( is_string( $part ) ) {
					$parts[] = $part;
				} elseif ( is_array( $part ) && isset( $part['text'] ) ) {
					$parts[] = (string) $part['text'];
				}
			}
			$content = implode( "\n", $parts );
		}
		$text = trim( (string) $content );
		if ( $text !== '' ) {
			return $text;
		}
		return trim( (string) ( $message['reasoning'] ?? '' ) );
	}

	/**
	 * @param array<string,array<string,mixed>> $redirects
	 * @param array<string,array<string,mixed>> $by_url
	 * @return array<string,array<string,mixed>>
	 */
	private static function point_at_keepers( array $redirects, array $by_url ): array {
		$dest = array();
		foreach ( $redirects as $norm => $row ) {
			$dest[ $norm ] = self::norm_url( (string) ( $row['to'] ?? '' ) );
		}
		foreach ( $redirects as $norm => $row ) {
			$end  = $dest[ $norm ] ?? '';
			$seen = array( $norm => true );
			while ( isset( $dest[ $end ] ) && ! isset( $seen[ $end ] ) ) {
				$seen[ $end ] = true;
				$end          = $dest[ $end ];
			}
			if ( $end === '' || $end === $norm || isset( $dest[ $end ] ) || ! isset( $by_url[ $end ] ) ) {
				unset( $redirects[ $norm ] );
				continue;
			}
			$redirects[ $norm ]['to'] = (string) ( $by_url[ $end ]['url'] ?? $row['to'] );
		}
		return $redirects;
	}

	private static function is_already_redirected( string $norm ): bool {
		$path = (string) wp_parse_url( $norm, PHP_URL_PATH );
		if ( $path === '' ) {
			$path = $norm;
		}
		if ( $path !== '' && $path[0] !== '/' ) {
			$path = '/' . $path;
		}
		if ( substr( $path, -1 ) !== '/' ) {
			$path .= '/';
		}
		return in_array( strtolower( $path ), self::ALREADY_301ED, true );
	}

	private static function norm_url( string $url ): string {
		$url = trim( $url );
		if ( $url === '' ) {
			return '';
		}
		$parts = wp_parse_url( $url );
		if ( ! is_array( $parts ) ) {
			return strtolower( untrailingslashit( $url ) );
		}
		$host = strtolower( (string) ( $parts['host'] ?? '' ) );
		$path = (string) ( $parts['path'] ?? '/' );
		if ( $path === '' ) {
			$path = '/';
		}
		$path = strtolower( untrailingslashit( $path ) );
		if ( $path === '' ) {
			$path = '/';
		}
		$scheme = ! empty( $parts['scheme'] ) ? strtolower( (string) $parts['scheme'] ) : 'https';
		return $scheme . '://' . $host . $path;
	}
}
