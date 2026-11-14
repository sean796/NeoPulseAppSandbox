<?php
/**
 * Post-fix HTTP 200 rescan for Semrush safe-fix rows.
 *
 * @package Neo_Pulse_App
 */

defined( 'ABSPATH' ) || exit;

class Neo_Pulse_App_Semrush_Safe_Fix_Rescan {

	/**
	 * @param array<string,mixed> $row
	 * @return array{ok:bool,error?:string,httpStatus?:int}
	 */
	public static function rescan_row( array $row ): array {
		$page_url = (string) ( $row['pageUrl'] ?? '' );
		$kind     = (string) ( $row['kind'] ?? '' );
		if ( $page_url === '' ) {
			return array( 'ok' => false, 'error' => 'missing pageUrl' );
		}

		$page = wp_remote_get(
			$page_url,
			array(
				'timeout'     => 30,
				'redirection' => 3,
				'sslverify'   => true,
			)
		);
		if ( is_wp_error( $page ) ) {
			return array( 'ok' => false, 'error' => $page->get_error_message() );
		}
		$code = (int) wp_remote_retrieve_response_code( $page );
		$body = (string) wp_remote_retrieve_body( $page );
		if ( $code !== 200 ) {
			return array( 'ok' => false, 'error' => 'page HTTP ' . $code, 'httpStatus' => $code );
		}

		if ( $kind === 'title' ) {
			if ( ! preg_match( '/<title[^>]*>\s*[^<]+\s*<\/title>/is', $body ) ) {
				return array( 'ok' => false, 'error' => 'title still empty', 'httpStatus' => 200 );
			}
			return array( 'ok' => true, 'httpStatus' => 200 );
		}
		if ( $kind === 'meta_description' ) {
			if ( ! preg_match( '/<meta[^>]+name=["\']description["\'][^>]+content=["\'][^"\']+["\']/is', $body )
				&& ! preg_match( '/<meta[^>]+content=["\'][^"\']+["\'][^>]+name=["\']description["\']/is', $body ) ) {
				return array( 'ok' => false, 'error' => 'meta description still empty', 'httpStatus' => 200 );
			}
			return array( 'ok' => true, 'httpStatus' => 200 );
		}
		if ( $kind === 'broken_internal_link' || $kind === 'broken_internal_image' ) {
			$to = (string) ( $row['toUrl'] ?? '' );
			if ( $to === '' ) {
				return array( 'ok' => false, 'error' => 'missing toUrl' );
			}
			$res = wp_remote_get(
				$to,
				array(
					'timeout'     => 20,
					'redirection' => 3,
					'sslverify'   => true,
				)
			);
			if ( is_wp_error( $res ) ) {
				return array( 'ok' => false, 'error' => $res->get_error_message() );
			}
			$tcode = (int) wp_remote_retrieve_response_code( $res );
			if ( $tcode !== 200 ) {
				return array( 'ok' => false, 'error' => 'resource HTTP ' . $tcode, 'httpStatus' => $tcode );
			}
			return array( 'ok' => true, 'httpStatus' => 200 );
		}
		if ( $kind === 'missing_alt' ) {
			$from = (string) ( $row['fromUrl'] ?? '' );
			$alt  = (string) ( $row['value'] ?? '' );
			if ( $from === '' || $alt === '' ) {
				return array( 'ok' => false, 'error' => 'missing image or alt' );
			}
			$escaped = preg_quote( $from, '/' );
			if ( ! preg_match( '/<img[^>]+src=["\']' . $escaped . '["\'][^>]*>/i', $body, $m )
				&& ! preg_match( '/<img[^>]+src=["\'][^"\']*' . preg_quote( basename( $from ), '/' ) . '["\'][^>]*>/i', $body, $m ) ) {
				return array( 'ok' => true, 'httpStatus' => 200 );
			}
			$tag = $m[0];
			if ( ! preg_match( '/alt=["\']([^"\']+)["\']/i', $tag, $am ) || trim( $am[1] ) === '' ) {
				return array( 'ok' => false, 'error' => 'alt still empty', 'httpStatus' => 200 );
			}
			return array( 'ok' => true, 'httpStatus' => 200 );
		}
		return array( 'ok' => false, 'error' => 'unknown kind' );
	}
}
