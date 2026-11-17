<?php
/**
 * Multipart Drive upload and deliverable upload flows.
 *
 * @package Neo_Pulse_App
 */

defined( 'ABSPATH' ) || exit;

trait Neo_Pulse_App_Google_Drive_Upload_Trait_Upload {

	/**
	 * @param array<string,mixed> $metadata
	 * @return array{statusCode:int,body:array<string,mixed>}
	 */
	private static function send_multipart_upload(
		string $access_token,
		string $url,
		string $method,
		array $metadata,
		string $upload_mime,
		string $content
	): array {
		$boundary = 'neo_pulse_' . wp_generate_password( 16, false, false );
		$payload  = '--' . $boundary . "\r\n";
		$payload .= "Content-Type: application/json; charset=UTF-8\r\n\r\n";
		$payload .= wp_json_encode( $metadata ) . "\r\n";
		$payload .= '--' . $boundary . "\r\n";
		$payload .= 'Content-Type: ' . $upload_mime . '; charset=UTF-8' . "\r\n\r\n";
		$payload .= $content . "\r\n";
		$payload .= '--' . $boundary . '--';

		$response = wp_remote_request(
			$url,
			array(
				'method'  => $method,
				'timeout' => 60,
				'headers' => array(
					'Authorization' => 'Bearer ' . $access_token,
					'Content-Type'  => 'multipart/related; boundary=' . $boundary,
				),
				'body'    => $payload,
			)
		);
		if ( is_wp_error( $response ) ) {
			return array(
				'statusCode' => 502,
				'body'       => array(
					'success' => false,
					'error'   => $response->get_error_message(),
				),
			);
		}

		$code = (int) wp_remote_retrieve_response_code( $response );
		$data = json_decode( wp_remote_retrieve_body( $response ), true );
		if ( $code < 200 || $code >= 300 || ! is_array( $data ) ) {
			$msg = is_array( $data ) && ! empty( $data['error']['message'] )
				? (string) $data['error']['message']
				: 'Google Drive upload failed.';
			return array(
				'statusCode' => $code > 0 ? $code : 502,
				'body'       => array( 'success' => false, 'error' => $msg ),
			);
		}

		return array(
			'statusCode' => 200,
			'body'       => array(
				'success'     => true,
				'fileId'      => (string) ( $data['id'] ?? '' ),
				'name'        => (string) ( $data['name'] ?? '' ),
				'webViewLink' => (string) ( $data['webViewLink'] ?? '' ),
			),
		);
	}

	/**
	 * @param array<string,mixed> $body
	 * @return array{statusCode:int,body:array<string,mixed>}
	 */
	public static function upload_deliverable( array $body ): array {
		if ( ! Neo_Pulse_App_Google_Mcp_Oauth::is_configured() ) {
			return array(
				'statusCode' => 503,
				'body'       => array(
					'success' => false,
					'error'   => 'Google OAuth not configured.',
				),
			);
		}

		$access_token = Neo_Pulse_App_Google_Mcp_Tokens::get_valid_access_token();
		if ( is_wp_error( $access_token ) ) {
			return array(
				'statusCode' => 401,
				'body'       => array(
					'success' => false,
					'error'   => $access_token->get_error_message(),
				),
			);
		}

		$file_name = sanitize_text_field( (string) ( $body['fileName'] ?? '' ) );
		$content   = (string) ( $body['content'] ?? '' );
		$folder_id = preg_replace( '/[^a-zA-Z0-9_-]/', '', (string) ( $body['folderId'] ?? '' ) );
		$mime      = sanitize_text_field( (string) ( $body['mime'] ?? 'text/plain' ) );
		$as_sheet  = ! empty( $body['convertToGoogleSheet'] );
		$as_doc    = ! $as_sheet && ( ! array_key_exists( 'convertToGoogleDoc', $body ) || ! empty( $body['convertToGoogleDoc'] ) );

		if ( $file_name === '' ) {
			return array(
				'statusCode' => 400,
				'body'       => array( 'success' => false, 'error' => 'fileName is required.' ),
			);
		}
		if ( $content === '' ) {
			return array(
				'statusCode' => 400,
				'body'       => array( 'success' => false, 'error' => 'content is required.' ),
			);
		}
		if ( strlen( $folder_id ) < 10 ) {
			return array(
				'statusCode' => 400,
				'body'       => array( 'success' => false, 'error' => 'folderId is required.' ),
			);
		}

		$upload_mime = $mime !== '' ? $mime : 'text/plain';
		if ( $as_sheet ) {
			$target_mime = 'application/vnd.google-apps.spreadsheet';
		} elseif ( $as_doc && $upload_mime !== 'text/csv' ) {
			$target_mime = 'application/vnd.google-apps.document';
		} else {
			$target_mime = $upload_mime;
		}

		$match_names = array( $file_name );
		if ( isset( $body['alsoMatchNames'] ) && is_array( $body['alsoMatchNames'] ) ) {
			foreach ( $body['alsoMatchNames'] as $alias ) {
				$alias = sanitize_text_field( (string) $alias );
				if ( $alias !== '' && ! in_array( $alias, $match_names, true ) ) {
					$match_names[] = $alias;
				}
			}
		}

		$existing = array();
		$seen_ids = array();
		foreach ( $match_names as $match_name ) {
			$existing_list = self::named_files_in_folder( $access_token, $folder_id, $match_name );
			if ( (int) ( $existing_list['statusCode'] ?? 500 ) !== 200 ) {
				return $existing_list;
			}
			$files = isset( $existing_list['files'] ) && is_array( $existing_list['files'] ) ? $existing_list['files'] : array();
			foreach ( $files as $file ) {
				if ( ! is_array( $file ) || empty( $file['id'] ) ) {
					continue;
				}
				$id = (string) $file['id'];
				if ( isset( $seen_ids[ $id ] ) ) {
					continue;
				}
				$seen_ids[ $id ] = true;
				$existing[]      = $file;
			}
		}

		if ( count( $existing ) > 0 ) {
			if ( $as_sheet ) {
				$keep_sheet = null;
				foreach ( $existing as $file ) {
					if ( (string) ( $file['mimeType'] ?? '' ) === 'application/vnd.google-apps.spreadsheet' ) {
						$keep_sheet = $file;
						break;
					}
				}
				if ( is_array( $keep_sheet ) ) {
					foreach ( $existing as $file ) {
						if ( (string) $file['id'] === (string) $keep_sheet['id'] ) {
							continue;
						}
						self::trash_file( array( 'fileId' => (string) $file['id'] ) );
					}
					$values = self::sheet_values_from_upload_body( $body, $content );
					$replaced = self::replace_spreadsheet_values(
						$access_token,
						(string) $keep_sheet['id'],
						$values
					);
					if ( (int) ( $replaced['statusCode'] ?? 500 ) !== 200 ) {
						return $replaced;
					}
					$link = (string) ( $keep_sheet['webViewLink'] ?? '' );
					if ( $link === '' ) {
						$link = 'https://docs.google.com/spreadsheets/d/' . rawurlencode( (string) $keep_sheet['id'] ) . '/edit';
					}
					return array(
						'statusCode' => 200,
						'body'       => array(
							'success'     => true,
							'fileId'      => (string) $keep_sheet['id'],
							'name'        => $file_name,
							'webViewLink' => $link,
						),
					);
				}
				foreach ( $existing as $file ) {
					self::trash_file( array( 'fileId' => (string) $file['id'] ) );
				}
			} else {
				$keep = $existing[0];
				foreach ( $existing as $file ) {
					if ( (string) $file['id'] === (string) $keep['id'] ) {
						continue;
					}
					self::trash_file( array( 'fileId' => (string) $file['id'] ) );
				}
				$update_metadata = array( 'name' => $file_name );
				if ( $target_mime === 'application/vnd.google-apps.document' ) {
					$update_metadata['mimeType'] = 'application/vnd.google-apps.document';
				}
				$updated = self::send_multipart_upload(
					$access_token,
					self::DRIVE_UPLOAD_URL . '/' . rawurlencode( (string) $keep['id'] ) . '?uploadType=multipart&supportsAllDrives=true&fields=id,name,webViewLink',
					'PATCH',
					$update_metadata,
					$upload_mime,
					$content
				);
				if ( (int) ( $updated['statusCode'] ?? 500 ) !== 200 ) {
					return $updated;
				}
				$updated_body = isset( $updated['body'] ) && is_array( $updated['body'] ) ? $updated['body'] : array();
				if ( (string) ( $updated_body['name'] ?? '' ) === '' ) {
					$updated_body['name'] = $file_name;
				}
				if ( (string) ( $updated_body['fileId'] ?? '' ) === '' ) {
					$updated_body['fileId'] = (string) $keep['id'];
				}
				if ( (string) ( $updated_body['webViewLink'] ?? '' ) === '' ) {
					$updated_body['webViewLink'] = (string) ( $keep['webViewLink'] ?? '' );
				}
				return array(
					'statusCode' => 200,
					'body'       => $updated_body,
				);
			}
		}

		$metadata = array(
			'name'    => $file_name,
			'parents' => array( $folder_id ),
		);
		if ( $target_mime === 'application/vnd.google-apps.document' || $target_mime === 'application/vnd.google-apps.spreadsheet' ) {
			$metadata['mimeType'] = $target_mime;
		}

		$created = self::send_multipart_upload(
			$access_token,
			self::DRIVE_UPLOAD_URL . '?uploadType=multipart&supportsAllDrives=true&fields=id,name,webViewLink',
			'POST',
			$metadata,
			$upload_mime,
			$content
		);
		if ( (int) ( $created['statusCode'] ?? 500 ) !== 200 ) {
			return $created;
		}
		$created_body = isset( $created['body'] ) && is_array( $created['body'] ) ? $created['body'] : array();
		if ( (string) ( $created_body['name'] ?? '' ) === '' ) {
			$created_body['name'] = $file_name;
		}
		return array(
			'statusCode' => 200,
			'body'       => $created_body,
		);
	}

	/**
	 * Resolve folder + upload a workflow step test markdown file in one request.
	 *
	 * @param array<string,mixed> $body
	 * @return array{statusCode:int,body:array<string,mixed>}
	 */
	public static function test_step_upload( array $body ): array {
		$title     = sanitize_text_field( (string) ( $body['title'] ?? 'Workflow step' ) );
		$site_name = sanitize_text_field( (string) ( $body['siteName'] ?? '' ) );
		$site_url  = esc_url_raw( (string) ( $body['siteUrl'] ?? '' ) );
		$settings  = Neo_Pulse_App_Google_Drive_Settings::get();
		$aliases   = isset( $settings['folderAliases'] ) && is_array( $settings['folderAliases'] ) ? $settings['folderAliases'] : array();
		$source    = self::normalize_folder_source( (string) ( $body['googleDriveFolderSource'] ?? 'path' ) );

		if ( trim( (string) ( $body['googleDriveFolderPath'] ?? '' ) ) === '' ) {
			$body['googleDriveFolderPath'] = self::resolve_delivery_purpose_key( $body, 'path', $aliases );
		}
		if ( $source === 'client_root' ) {
			$body['googleDriveFolderSource'] = 'path';
			$source                          = 'path';
		}

		$folder_result = self::resolve_test_step_folder( $body, $source, $site_name, $site_url );
		if ( (int) ( $folder_result['statusCode'] ?? 500 ) !== 200 ) {
			return $folder_result;
		}
		$folder_body = isset( $folder_result['body'] ) && is_array( $folder_result['body'] ) ? $folder_result['body'] : array();
		$folder_id   = (string) ( $folder_body['folderId'] ?? '' );
		$folder_label = (string) ( $folder_body['folderLabel'] ?? $folder_body['label'] ?? '' );
		if ( strlen( $folder_id ) < 10 ) {
			return array(
				'statusCode' => 502,
				'body'       => array( 'success' => false, 'error' => 'Google Drive folder is required.' ),
			);
		}
		if ( ! self::is_delivery_month_leaf_label( $folder_label ) ) {
			return array(
				'statusCode' => 502,
				'body'       => array(
					'success' => false,
					'error'   => 'Google Drive test must upload to a purpose/year/month folder, not the client root.',
				),
			);
		}

		$timestamp = gmdate( 'c' );
		$stamp_slug = gmdate( 'Y-m-d-His' );
		$safe_title = $title !== '' ? $title : 'Workflow step';
		$file_name  = sanitize_file_name( str_replace( ' ', '-', $safe_title ) . '-test-' . $stamp_slug );
		$content    = '# ' . $safe_title . "\n\nTest file\n\n" . $timestamp . "\n";

		$upload = self::upload_deliverable(
			array(
				'fileName'           => $file_name,
				'content'            => $content,
				'folderId'           => $folder_id,
				'mime'               => 'text/markdown',
				'convertToGoogleDoc' => true,
			)
		);
		if ( (int) ( $upload['statusCode'] ?? 500 ) !== 200 ) {
			return $upload;
		}
		$upload_body = isset( $upload['body'] ) && is_array( $upload['body'] ) ? $upload['body'] : array();

		return array(
			'statusCode' => 200,
			'body'       => array(
				'success'     => true,
				'fileLink'    => (string) ( $upload_body['webViewLink'] ?? '' ),
				'fileName'    => (string) ( $upload_body['name'] ?? $file_name ),
				'fileId'      => (string) ( $upload_body['fileId'] ?? '' ),
				'folderLink'  => (string) ( $folder_body['webViewLink'] ?? '' ),
				'folderLabel' => (string) ( $folder_body['folderLabel'] ?? '' ),
				'created'     => isset( $folder_body['created'] ) && is_array( $folder_body['created'] ) ? $folder_body['created'] : array(),
			),
		);
	}

	/**
	 * @param array<string,mixed> $body
	 * @return array<int,array<int,string>>
	 */
	private static function sheet_values_from_upload_body( array $body, string $content ): array {
		if ( isset( $body['sheetValues'] ) && is_array( $body['sheetValues'] ) ) {
			$out = array();
			foreach ( $body['sheetValues'] as $row ) {
				if ( ! is_array( $row ) ) {
					continue;
				}
				$cells = array();
				foreach ( $row as $cell ) {
					$cells[] = (string) $cell;
				}
				$out[] = $cells;
			}
			if ( $out !== array() ) {
				return $out;
			}
		}
		return self::parse_csv_to_sheet_values( $content );
	}

	/**
	 * @return array<int,array<int,string>>
	 */
	private static function parse_csv_to_sheet_values( string $csv ): array {
		$csv = str_replace( "\r\n", "\n", $csv );
		$csv = str_replace( "\r", "\n", $csv );
		$lines = explode( "\n", $csv );
		$rows  = array();
		foreach ( $lines as $line ) {
			if ( $line === '' ) {
				continue;
			}
			$parsed = str_getcsv( $line );
			if ( ! is_array( $parsed ) ) {
				continue;
			}
			$cells = array();
			foreach ( $parsed as $cell ) {
				$cells[] = (string) $cell;
			}
			$rows[] = $cells;
		}
		return $rows;
	}

	/**
	 * Clear and rewrite every cell on the first tab. Keeps the same spreadsheet ID / URL.
	 *
	 * @param array<int,array<int,string>> $values
	 * @return array{statusCode:int,body:array<string,mixed>}
	 */
	private static function replace_spreadsheet_values( string $access_token, string $spreadsheet_id, array $values ): array {
		if ( $values === array() ) {
			return array(
				'statusCode' => 400,
				'body'       => array( 'success' => false, 'error' => 'sheet values are required.' ),
			);
		}

		$meta_url = self::SHEETS_API_URL . '/' . rawurlencode( $spreadsheet_id ) . '?fields=sheets.properties.title';
		$meta_res = wp_remote_get(
			$meta_url,
			array(
				'timeout' => 30,
				'headers' => array( 'Authorization' => 'Bearer ' . $access_token ),
			)
		);
		if ( is_wp_error( $meta_res ) ) {
			return array(
				'statusCode' => 502,
				'body'       => array( 'success' => false, 'error' => $meta_res->get_error_message() ),
			);
		}
		$meta_code = (int) wp_remote_retrieve_response_code( $meta_res );
		$meta_data = json_decode( wp_remote_retrieve_body( $meta_res ), true );
		if ( $meta_code < 200 || $meta_code >= 300 || ! is_array( $meta_data ) ) {
			$msg = is_array( $meta_data ) && ! empty( $meta_data['error']['message'] )
				? (string) $meta_data['error']['message']
				: 'Could not read spreadsheet tabs.';
			return array(
				'statusCode' => $meta_code > 0 ? $meta_code : 502,
				'body'       => array( 'success' => false, 'error' => $msg ),
			);
		}
		$title = 'Sheet1';
		if ( isset( $meta_data['sheets'][0]['properties']['title'] ) ) {
			$title = (string) $meta_data['sheets'][0]['properties']['title'];
		}
		$quoted = str_replace( "'", "''", $title );
		$a1     = "'" . $quoted . "'!A1";

		$clear_url = self::SHEETS_API_URL . '/' . rawurlencode( $spreadsheet_id ) . '/values/' . rawurlencode( "'" . $quoted . "'!A:ZZ" ) . ':clear';
		$clear_res = wp_remote_post(
			$clear_url,
			array(
				'timeout' => 30,
				'headers' => array(
					'Authorization' => 'Bearer ' . $access_token,
					'Content-Type'  => 'application/json; charset=UTF-8',
				),
				'body'    => '{}',
			)
		);
		if ( is_wp_error( $clear_res ) ) {
			return array(
				'statusCode' => 502,
				'body'       => array( 'success' => false, 'error' => $clear_res->get_error_message() ),
			);
		}
		$clear_code = (int) wp_remote_retrieve_response_code( $clear_res );
		if ( $clear_code < 200 || $clear_code >= 300 ) {
			$clear_data = json_decode( wp_remote_retrieve_body( $clear_res ), true );
			$msg        = is_array( $clear_data ) && ! empty( $clear_data['error']['message'] )
				? (string) $clear_data['error']['message']
				: 'Could not clear spreadsheet cells.';
			return array(
				'statusCode' => $clear_code > 0 ? $clear_code : 502,
				'body'       => array( 'success' => false, 'error' => $msg ),
			);
		}

		$update_url = self::SHEETS_API_URL . '/' . rawurlencode( $spreadsheet_id ) . '/values/' . rawurlencode( $a1 ) . '?valueInputOption=RAW';
		$update_res = wp_remote_request(
			$update_url,
			array(
				'method'  => 'PUT',
				'timeout' => 60,
				'headers' => array(
					'Authorization' => 'Bearer ' . $access_token,
					'Content-Type'  => 'application/json; charset=UTF-8',
				),
				'body'    => wp_json_encode(
					array(
						'range'  => $a1,
						'values' => $values,
					)
				),
			)
		);
		if ( is_wp_error( $update_res ) ) {
			return array(
				'statusCode' => 502,
				'body'       => array( 'success' => false, 'error' => $update_res->get_error_message() ),
			);
		}
		$update_code = (int) wp_remote_retrieve_response_code( $update_res );
		$update_data = json_decode( wp_remote_retrieve_body( $update_res ), true );
		if ( $update_code < 200 || $update_code >= 300 || ! is_array( $update_data ) ) {
			$msg = is_array( $update_data ) && ! empty( $update_data['error']['message'] )
				? (string) $update_data['error']['message']
				: 'Could not update spreadsheet cells.';
			return array(
				'statusCode' => $update_code > 0 ? $update_code : 502,
				'body'       => array( 'success' => false, 'error' => $msg ),
			);
		}

		return array(
			'statusCode' => 200,
			'body'       => array( 'success' => true ),
		);
	}
}
