<?php
/**
 * Build Semrush safe-fix action sheet rows (cap 20 per site).
 *
 * @package Neo_Pulse_App
 */

defined( 'ABSPATH' ) || exit;

class Neo_Pulse_App_Semrush_Safe_Fix_Sheet {

	const CAP_PER_SITE = 20;

	/**
	 * @param array<string,mixed> $site
	 * @param array<int,array{issueId:int,kind:string,sourceUrl:string,targetUrl:string,pageId:string}> $issues
	 * @return array{rows:array<int,array<string,mixed>>,skipped:int,failedBuild:array<int,array<string,mixed>>}
	 */
	public static function build( array $site, array $issues ): array {
		$site_url  = rtrim( (string) ( $site['siteUrl'] ?? '' ), '/' );
		$site_host = self::host( $site_url );
		$rows      = array();
		$skipped   = 0;
		$failed    = array();

		foreach ( $issues as $issue ) {
			if ( count( $rows ) >= self::CAP_PER_SITE ) {
				$skipped += 1;
				continue;
			}
			$kind       = (string) ( $issue['kind'] ?? '' );
			$source_url = trim( (string) ( $issue['sourceUrl'] ?? '' ) );
			$target_url = trim( (string) ( $issue['targetUrl'] ?? '' ) );
			$page_url   = $source_url !== '' ? $source_url : $target_url;
			if ( $page_url === '' ) {
				$skipped += 1;
				continue;
			}

			$row = array(
				'siteId'    => (string) ( $site['id'] ?? '' ),
				'siteName'  => (string) ( $site['name'] ?? '' ),
				'siteUrl'   => $site_url,
				'pageUrl'   => $page_url,
				'issueId'   => (int) $issue['issueId'],
				'issueName' => (string) ( $issue['issueName'] ?? '' ),
				'kind'      => $kind,
				'targetUrl' => $target_url,
				'value'     => '',
				'fromUrl'   => '',
				'toUrl'     => '',
				'apply'     => true,
			);

			if ( $kind === 'title' || $kind === 'meta_description' || $kind === 'missing_alt' ) {
				$written = self::write_copy( $kind, $page_url, $target_url, $site_url );
				if ( is_wp_error( $written ) ) {
					$failed[] = array_merge(
						$row,
						array(
							'status' => 'failed',
							'error'  => $written->get_error_message(),
						)
					);
					continue;
				}
				$row['value'] = $written;
				if ( $kind === 'missing_alt' ) {
					$row['fromUrl'] = $target_url !== '' ? $target_url : $page_url;
				}
			} elseif ( $kind === 'slow_load' || $kind === 'listed' ) {
				$row['apply'] = false;
				$rows[]       = $row;
				continue;
			} elseif ( $kind === 'broken_internal_link' || $kind === 'broken_internal_image' ) {
				$broken = $target_url !== '' ? $target_url : $page_url;
				$fixed  = self::resolve_same_site_200( $broken, $site_host );
				$row['fromUrl'] = $broken;
				$row['toUrl']   = $fixed;
				$row['value']   = $fixed;
			} else {
				$row['apply'] = false;
			}

			$rows[] = $row;
		}

		return array(
			'rows'        => $rows,
			'skipped'     => $skipped,
			'failedBuild' => $failed,
		);
	}

	/**
	 * @return string|WP_Error
	 */
	private static function write_copy( string $kind, string $page_url, string $target_url, string $site_url ) {
		$excerpt = self::page_excerpt( $page_url );
		if ( is_wp_error( $excerpt ) ) {
			return $excerpt;
		}
		$field = 'title';
		if ( $kind === 'meta_description' ) {
			$field = 'metaDescription';
		} elseif ( $kind === 'missing_alt' ) {
			$field = 'alt';
		}
		$prompts = Neo_Pulse_App_Skills_Library_Store::load_prompts();
		if ( is_wp_error( $prompts ) ) {
			return $prompts;
		}
		$fc = $prompts['fieldCopy'];
		$system = (string) $fc['base'];
		if ( $field === 'title' ) {
			$system .= (string) $fc['title'];
		} elseif ( $field === 'metaDescription' ) {
			$system .= (string) $fc['metaDescription'];
		} else {
			$system .= (string) $fc['alt'];
		}
		$image_line = ( $field === 'alt' && $target_url !== '' ) ? "Image URL: {$target_url}\n" : '';
		$user       = str_replace(
			array( '{pageUrl}', '{siteUrl}', '{imageLine}', '{excerpt}', '{field}' ),
			array( $page_url, $site_url, $image_line, $excerpt, $field ),
			(string) $fc['userTemplate']
		);

		$model = Neo_Pulse_App_Openrouter_Agent_Models::resolve( Neo_Pulse_App_Openrouter_Agent_Models::CATEGORY_META );
		$raw   = self::openrouter_json( $model, $system, $user );
		if ( is_wp_error( $raw ) ) {
			return $raw;
		}
		$value = trim( (string) ( $raw[ $field ] ?? '' ) );
		if ( $value === '' ) {
			return new WP_Error( 'neo-pulse_safe_fix_empty', 'OpenRouter returned an empty ' . $field );
		}
		return $value;
	}

	/**
	 * @return string|WP_Error
	 */
	private static function page_excerpt( string $url ) {
		$res = wp_remote_get(
			$url,
			array(
				'timeout'     => 30,
				'redirection' => 3,
				'sslverify'   => true,
			)
		);
		if ( is_wp_error( $res ) ) {
			return $res;
		}
		$code = (int) wp_remote_retrieve_response_code( $res );
		$body = (string) wp_remote_retrieve_body( $res );
		if ( $code < 200 || $code >= 300 || $body === '' ) {
			return new WP_Error( 'neo-pulse_safe_fix_page', 'Could not load page for excerpt (HTTP ' . $code . ')' );
		}
		$title = '';
		if ( preg_match( '/<title[^>]*>(.*?)<\/title>/is', $body, $m ) ) {
			$title = trim( wp_strip_all_tags( $m[1] ) );
		}
		$h1 = '';
		if ( preg_match( '/<h1[^>]*>(.*?)<\/h1>/is', $body, $m ) ) {
			$h1 = trim( wp_strip_all_tags( $m[1] ) );
		}
		$text = trim( wp_strip_all_tags( $body ) );
		$text = preg_replace( '/\s+/', ' ', $text ) ?? $text;
		$text = substr( $text, 0, 1200 );
		return "Title: {$title}\nH1: {$h1}\nBody: {$text}";
	}

	/**
	 * Follow redirects / slash variants; return final same-host 200 URL or empty.
	 */
	public static function resolve_same_site_200( string $url, string $site_host ): string {
		$url = trim( $url );
		if ( $url === '' || $site_host === '' ) {
			return '';
		}
		$candidates = array( $url );
		if ( substr( $url, -1 ) === '/' ) {
			$candidates[] = rtrim( $url, '/' );
		} else {
			$candidates[] = $url . '/';
		}
		$parsed = wp_parse_url( $url );
		if ( is_array( $parsed ) && ! empty( $parsed['scheme'] ) && ! empty( $parsed['host'] ) ) {
			$alt_scheme   = strtolower( (string) $parsed['scheme'] ) === 'https' ? 'http' : 'https';
			$path         = isset( $parsed['path'] ) ? (string) $parsed['path'] : '';
			$query        = isset( $parsed['query'] ) ? '?' . $parsed['query'] : '';
			$candidates[] = $alt_scheme . '://' . $parsed['host'] . $path . $query;
		}

		foreach ( array_unique( $candidates ) as $candidate ) {
			$final = self::follow_to_200( $candidate );
			if ( $final === '' ) {
				continue;
			}
			if ( self::host( $final ) !== $site_host ) {
				continue;
			}
			return $final;
		}
		return '';
	}

	private static function follow_to_200( string $url ): string {
		$res = wp_remote_get(
			$url,
			array(
				'timeout'     => 20,
				'redirection' => 5,
				'sslverify'   => true,
			)
		);
		if ( is_wp_error( $res ) ) {
			return '';
		}
		$code = (int) wp_remote_retrieve_response_code( $res );
		if ( $code !== 200 ) {
			return '';
		}
		$final = wp_remote_retrieve_header( $res, 'x-final-url' );
		if ( is_string( $final ) && $final !== '' ) {
			return $final;
		}
		return $url;
	}

	public static function host( string $url ): string {
		$host = wp_parse_url( $url, PHP_URL_HOST );
		$host = is_string( $host ) ? strtolower( $host ) : '';
		if ( str_starts_with( $host, 'www.' ) ) {
			$host = substr( $host, 4 );
		}
		return $host;
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
				'timeout' => 90,
				'headers' => $headers,
				'body'    => wp_json_encode(
					array(
						'model'           => $model,
						'temperature'     => 0.3,
						'max_tokens'      => 512,
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
