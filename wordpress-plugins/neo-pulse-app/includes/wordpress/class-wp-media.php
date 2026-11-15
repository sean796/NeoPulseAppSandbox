<?php
/**
 * WordPress media upload and list (POST /upload-media, POST /list-media).
 *
 * @package Neo_Pulse_App
 */

defined( 'ABSPATH' ) || exit;

class Neo_Pulse_App_Wp_Media {

	/**
	 * @param array<string,mixed> $body Request body.
	 * @return array{0:int,1:array<string,mixed>}
	 */
	public static function upload_media( $body ) {
		$site_url      = isset( $body['siteUrl'] ) ? (string) $body['siteUrl'] : '';
		$username      = isset( $body['username'] ) ? (string) $body['username'] : '';
		$app_password  = isset( $body['appPassword'] ) ? (string) $body['appPassword'] : '';
		$image_base64  = isset( $body['imageBase64'] ) ? (string) $body['imageBase64'] : '';
		$filename      = isset( $body['filename'] ) ? (string) $body['filename'] : '';
		$title         = isset( $body['title'] ) ? (string) $body['title'] : '';
		$alt           = isset( $body['alt'] ) ? trim( (string) $body['alt'] ) : '';
		if ( $alt === '' && isset( $body['altText'] ) ) {
			$alt = trim( (string) $body['altText'] );
		}

		if ( $site_url === '' || $username === '' || $app_password === '' || $image_base64 === '' ) {
			return array(
				400,
				array(
					'success' => false,
					'error'   => 'Missing required fields: siteUrl, username, appPassword, imageBase64',
				),
			);
		}

		$normalized = Neo_Pulse_App_Wp_Url_Normalize::normalize_url( $site_url );
		$mime_type  = 'image/png';
		$base64     = $image_base64;
		if ( strpos( $base64, ',' ) !== false ) {
			$parts = explode( ',', $base64, 2 );
			if ( preg_match( '/data:([^;]+)/', $parts[0], $m ) ) {
				$mime_type = $m[1];
			}
			$base64 = $parts[1];
		}

		$image_buffer = base64_decode( $base64, true );
		if ( $image_buffer === false ) {
			return array( 400, array( 'success' => false, 'error' => 'Invalid base64 image data' ) );
		}

		$extension = 'png';
		if ( stripos( $mime_type, 'jpeg' ) !== false || stripos( $mime_type, 'jpg' ) !== false ) {
			$extension = 'jpg';
		} elseif ( stripos( $mime_type, 'webp' ) !== false ) {
			$extension = 'webp';
		} elseif ( stripos( $mime_type, 'gif' ) !== false ) {
			$extension = 'gif';
		}

		$final_filename = $filename !== '' ? $filename : ( 'image-' . time() . '.' . $extension );
		$media_url      = $normalized . '/wp-json/wp/v2/media';
		$boundary       = wp_generate_password( 24, false );
		$multipart      = self::build_multipart_body( $boundary, $final_filename, $mime_type, $image_buffer, $title );

		$headers = Neo_Pulse_App_Wp_Rest_Client::auth_headers(
			$username,
			$app_password,
			array(
				'content_type' => 'multipart/form-data; boundary=' . $boundary,
				'headers'      => array(
					'Content-Disposition' => 'attachment; filename="' . $final_filename . '"',
				),
			)
		);

		$response = wp_remote_post(
			$media_url,
			array(
				'timeout' => 60,
				'headers' => $headers,
				'body'    => $multipart,
			)
		);

		if ( is_wp_error( $response ) ) {
			return array( 200, array( 'success' => false, 'error' => $response->get_error_message() ) );
		}

		$status = (int) wp_remote_retrieve_response_code( $response );
		$raw    = (string) wp_remote_retrieve_body( $response );
		$data   = Neo_Pulse_App_Wp_Rest_Client::parse_json_body( $raw );

		if ( $status === 401 ) {
			return array( 200, array( 'success' => false, 'error' => 'Authentication failed. Please verify your username and application password.' ) );
		}
		if ( $status === 413 ) {
			return array( 200, array( 'success' => false, 'error' => 'File too large. WordPress may have upload size limits.' ) );
		}
		if ( $status !== 201 && $status !== 200 ) {
			$msg = is_array( $data ) && ! empty( $data['message'] ) ? (string) $data['message'] : ( 'WordPress API error: HTTP ' . $status );
			return array( 200, array( 'success' => false, 'error' => $msg ) );
		}

		if ( ! is_array( $data ) ) {
			return array( 200, array( 'success' => false, 'error' => 'Unexpected media upload response' ) );
		}

		$media_id = (int) ( $data['id'] ?? 0 );
		if ( $alt !== '' && $media_id > 0 ) {
			Neo_Pulse_App_Wp_Rest_Client::request(
				'POST',
				$normalized . '/wp-json/wp/v2/media/' . $media_id,
				$username,
				$app_password,
				array(
					'timeout' => 10,
					'body'    => array( 'alt_text' => $alt ),
				)
			);
		}

		$media_title = Neo_Pulse_App_Wp_Url_Normalize::rendered_text( $data['title'] ?? '' );
		if ( $media_title === '' ) {
			$media_title = $title !== '' ? $title : $final_filename;
		}

		return array(
			200,
			array(
				'success' => true,
				'mediaId' => $media_id,
				'url'     => (string) ( $data['source_url'] ?? $data['url'] ?? '' ),
				'link'    => (string) ( $data['link'] ?? '' ),
				'title'   => $media_title,
			),
		);
	}

	/**
	 * @param array<string,mixed> $body Request body.
	 * @return array{0:int,1:array<string,mixed>}
	 */
	public static function list_media( $body ) {
		$site_url     = isset( $body['siteUrl'] ) ? (string) $body['siteUrl'] : '';
		$username     = isset( $body['username'] ) ? (string) $body['username'] : '';
		$app_password = isset( $body['appPassword'] ) ? (string) $body['appPassword'] : '';
		$max_items    = isset( $body['maxItems'] ) ? (int) $body['maxItems'] : 200;
		$max_items    = max( 1, min( 200, $max_items ) );

		if ( $site_url === '' || $username === '' || $app_password === '' ) {
			return array(
				400,
				array(
					'success' => false,
					'error'   => 'Missing required fields: siteUrl, username, appPassword',
				),
			);
		}

		$normalized = Neo_Pulse_App_Wp_Url_Normalize::normalize_url( $site_url );
		$media_id   = isset( $body['mediaId'] ) ? (int) $body['mediaId'] : 0;
		if ( $media_id > 0 ) {
			$one = Neo_Pulse_App_Wp_Rest_Client::request(
				'GET',
				$normalized . '/wp-json/wp/v2/media/' . $media_id,
				$username,
				$app_password,
				array(
					'timeout' => 20,
					'params'  => array(
						'_fields' => 'id,title,alt_text,caption,source_url',
					),
				)
			);
			if ( $one['is_wp_error'] || (int) $one['status'] !== 200 || ! is_array( $one['body'] ) ) {
				$msg = is_array( $one['body'] ) && ! empty( $one['body']['message'] ) ? (string) $one['body']['message'] : 'WordPress media lookup failed';
				return array( 502, array( 'success' => false, 'error' => $msg ) );
			}
			$source_url = (string) ( $one['body']['source_url'] ?? '' );
			if ( strpos( $source_url, 'http' ) !== 0 ) {
				return array( 404, array( 'success' => false, 'error' => 'Featured image has no URL' ) );
			}
			$item_title = Neo_Pulse_App_Wp_Url_Normalize::rendered_text( $one['body']['title'] ?? '' );
			return array(
				200,
				array(
					'success' => true,
					'media'   => array(
						array(
							'id'        => (int) ( $one['body']['id'] ?? $media_id ),
							'title'     => trim( wp_strip_all_tags( $item_title ) ),
							'alt'       => trim( (string) ( $one['body']['alt_text'] ?? '' ) ),
							'caption'   => '',
							'sourceUrl' => $source_url,
						),
					),
					'count'   => 1,
				),
			);
		}
		$catalog    = array();
		$page       = 1;

		while ( count( $catalog ) < $max_items ) {
			$resp = Neo_Pulse_App_Wp_Rest_Client::request(
				'GET',
				$normalized . '/wp-json/wp/v2/media',
				$username,
				$app_password,
				array(
					'timeout' => 20,
					'params'  => array(
						'page'       => $page,
						'per_page'   => 100,
						'media_type' => 'image',
						'_fields'    => 'id,title,alt_text,caption,source_url',
					),
				)
			);

			if ( $resp['is_wp_error'] || (int) $resp['status'] !== 200 || ! is_array( $resp['body'] ) ) {
				if ( $page === 1 ) {
					$msg = is_array( $resp['body'] ) && ! empty( $resp['body']['message'] ) ? (string) $resp['body']['message'] : 'WordPress media list failed';
					return array( 502, array( 'success' => false, 'error' => $msg ) );
				}
				break;
			}

			foreach ( $resp['body'] as $item ) {
				if ( count( $catalog ) >= $max_items || ! is_array( $item ) ) {
					break;
				}
				$source_url = (string) ( $item['source_url'] ?? '' );
				if ( strpos( $source_url, 'http' ) !== 0 ) {
					continue;
				}
				$item_title   = Neo_Pulse_App_Wp_Url_Normalize::rendered_text( $item['title'] ?? '' );
				$item_caption = Neo_Pulse_App_Wp_Url_Normalize::rendered_text( $item['caption'] ?? '' );
				$catalog[]    = array(
					'id'        => (int) ( $item['id'] ?? 0 ),
					'title'     => trim( wp_strip_all_tags( $item_title ) ),
					'alt'       => trim( (string) ( $item['alt_text'] ?? '' ) ),
					'caption'   => trim( wp_strip_all_tags( $item_caption ) ),
					'sourceUrl' => $source_url,
				);
			}

			if ( count( $resp['body'] ) < 100 ) {
				break;
			}
			++$page;
		}

		return array(
			200,
			array(
				'success' => true,
				'media'   => $catalog,
				'count'   => count( $catalog ),
			),
		);
	}

	/**
	 * @param string $boundary Multipart boundary.
	 * @param string $filename File name.
	 * @param string $mime_type MIME type.
	 * @param string $binary File bytes.
	 * @param string $title Optional title.
	 * @return string
	 */
	private static function build_multipart_body( $boundary, $filename, $mime_type, $binary, $title ) {
		$eol  = "\r\n";
		$body = '--' . $boundary . $eol;
		$body .= 'Content-Disposition: form-data; name="file"; filename="' . $filename . '"' . $eol;
		$body .= 'Content-Type: ' . $mime_type . $eol . $eol;
		$body .= $binary . $eol;
		if ( $title !== '' ) {
			$body .= '--' . $boundary . $eol;
			$body .= 'Content-Disposition: form-data; name="title"' . $eol . $eol;
			$body .= $title . $eol;
		}
		$body .= '--' . $boundary . '--' . $eol;
		return $body;
	}
}
