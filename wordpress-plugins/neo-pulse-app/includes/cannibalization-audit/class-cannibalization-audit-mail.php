<?php
/**
 * Drive sheet + AgentMail for Cannibalization Audit.
 *
 * @package Neo_Pulse_App
 */

defined( 'ABSPATH' ) || exit;

class Neo_Pulse_App_Cannibalization_Audit_Mail {

	const AUDITS_PARENT_FOLDER_ID = '1-I_na_4srNZR3VthtMEcbVPhJVUzkqnZ';

	/**
	 * @return array{ok:bool,folderId?:string,folderLink?:string,error?:string}
	 */
	public static function ensure_folder( string $site_name, int $run_id ): array {
		if ( ! class_exists( 'Neo_Pulse_App_Google_Drive_Upload' ) ) {
			return array( 'ok' => false, 'error' => 'Google Drive upload is not loaded' );
		}
		$tz    = new DateTimeZone( Neo_Pulse_App_Cannibalization_Audit_Schedule::TZ );
		$now   = new DateTime( 'now', $tz );
		$name  = trim( $site_name ) !== '' ? trim( $site_name ) : 'Cannibalization Audit';
		$label = $name . ' cannibalization audit ' . $now->format( 'Y-m-d Hi' ) . ' run ' . $run_id;
		$made  = Neo_Pulse_App_Google_Drive_Upload::ensure_child_folder( self::AUDITS_PARENT_FOLDER_ID, $label );
		$body  = isset( $made['body'] ) && is_array( $made['body'] ) ? $made['body'] : array();
		$id    = trim( (string) ( $body['folderId'] ?? '' ) );
		if ( (int) ( $made['statusCode'] ?? 500 ) !== 200 || $id === '' ) {
			return array(
				'ok'    => false,
				'error' => (string) ( $body['error'] ?? 'Could not create the Google Drive folder' ),
			);
		}
		return array(
			'ok'         => true,
			'folderId'   => $id,
			'folderLink' => 'https://drive.google.com/drive/folders/' . rawurlencode( $id ),
		);
	}

	/**
	 * One Pulse Redirect workbook. Blog rows on tab Blog; service-area rows on tab Service Areas when present.
	 *
	 * @param array<string,mixed> $map
	 * @return array{ok:bool,sheetLink?:string,fileId?:string,error?:string}
	 */
	public static function write_sheet( string $folder_id, array $map, string $file_name = 'Pulse Redirect' ): array {
		if ( ! class_exists( 'Neo_Pulse_App_Google_Drive_Upload' ) ) {
			return array( 'ok' => false, 'error' => 'Google Drive upload is not loaded' );
		}
		$answer         = trim( (string) ( $map['answer'] ?? '' ) );
		$service_answer = trim( (string) ( $map['serviceAnswer'] ?? '' ) );
		$blog_values    = $answer !== '' ? self::answer_rows( $answer ) : self::matrix( $map );
		$sheet          = Neo_Pulse_App_Google_Drive_Upload::upload_deliverable(
			array(
				'fileName'             => $file_name,
				'content'              => $answer !== '' ? $answer : self::csv( $map ),
				'folderId'             => $folder_id,
				'mime'                 => 'text/csv',
				'convertToGoogleSheet' => true,
				'convertToGoogleDoc'   => false,
				'alsoMatchNames'       => array( 'pulse-redirect.csv', 'redirect-map', 'redirect-map.csv' ),
				'sheetValues'          => $blog_values,
			)
		);
		$sheet_body = isset( $sheet['body'] ) && is_array( $sheet['body'] ) ? $sheet['body'] : array();
		if ( (int) ( $sheet['statusCode'] ?? 500 ) !== 200 ) {
			return array( 'ok' => false, 'error' => (string) ( $sheet_body['error'] ?? 'Could not write the Pulse Redirect sheet' ) );
		}
		$file_id    = trim( (string) ( $sheet_body['fileId'] ?? '' ) );
		$sheet_link = trim( (string) ( $sheet_body['webViewLink'] ?? '' ) );
		if ( $service_answer !== '' && $file_id !== '' ) {
			$tabs = Neo_Pulse_App_Google_Drive_Upload::write_spreadsheet_tabs(
				$file_id,
				array(
					array(
						'title'  => 'Blog',
						'values' => $blog_values,
					),
					array(
						'title'  => 'Service Areas',
						'values' => self::answer_rows( $service_answer ),
					),
				)
			);
			$tabs_body = isset( $tabs['body'] ) && is_array( $tabs['body'] ) ? $tabs['body'] : array();
			if ( (int) ( $tabs['statusCode'] ?? 500 ) !== 200 ) {
				return array( 'ok' => false, 'error' => (string) ( $tabs_body['error'] ?? 'Could not write workbook tabs' ) );
			}
			self::trash_named_sheet( $folder_id, 'Pulse Redirect Service Areas' );
		}
		return array(
			'ok'        => true,
			'sheetLink' => $sheet_link,
			'fileId'    => $file_id,
		);
	}

	private static function trash_named_sheet( string $folder_id, string $name ): void {
		if ( ! class_exists( 'Neo_Pulse_App_Google_Mcp_Tokens' ) || ! class_exists( 'Neo_Pulse_App_Google_Drive_Upload' ) ) {
			return;
		}
		$token = Neo_Pulse_App_Google_Mcp_Tokens::get_valid_access_token();
		if ( is_wp_error( $token ) ) {
			return;
		}
		$list = Neo_Pulse_App_Google_Drive_Upload::named_files_in_folder( $token, $folder_id, $name );
		if ( (int) ( $list['statusCode'] ?? 500 ) !== 200 ) {
			return;
		}
		foreach ( (array) ( $list['files'] ?? array() ) as $file ) {
			if ( ! is_array( $file ) || empty( $file['id'] ) ) {
				continue;
			}
			Neo_Pulse_App_Google_Drive_Upload::trash_file( array( 'fileId' => (string) $file['id'] ) );
		}
	}

	/**
	 * @param array<string,mixed> $map
	 * @return array<string,mixed>
	 */
	public static function send_summary( string $to, array $map, string $folder_link = '' ): array {
		$api_key = class_exists( 'Neo_Pulse_App_Secrets' ) ? Neo_Pulse_App_Secrets::agentmail_api_key() : '';
		if ( $api_key === '' ) {
			return array( 'ok' => false, 'error' => 'AgentMail API key is not configured' );
		}
		unset( $api_key );

		$tz   = new DateTimeZone( Neo_Pulse_App_Cannibalization_Audit_Schedule::TZ );
		$now  = new DateTime( 'now', $tz );
		$date = $now->format( 'Y-m-d' );
		$name = trim( (string) ( $map['siteName'] ?? '' ) );
		if ( $name === '' ) {
			$name = trim( (string) ( $map['siteId'] ?? 'Cannibalization Audit' ) );
		}
		$redirects = (int) ( $map['redirectCount'] ?? count( (array) ( $map['redirects'] ?? array() ) ) );
		$leave     = (int) ( $map['leaveCount'] ?? count( (array) ( $map['leave'] ?? array() ) ) );
		$overview  = 'Suggested ' . $redirects . ' redirect(s). Left ' . $leave . ' URL(s) alone. Suggest only; do not apply until accepted.';
		$subj      = $name . ': ' . $redirects . ' redirect suggestions';
		if ( function_exists( 'mb_substr' ) ) {
			$subj = mb_substr( $subj, 0, 70 );
		} else {
			$subj = substr( $subj, 0, 70 );
		}
		$drive_line = trim( $folder_link ) !== '' ? ( "Drive folder: " . trim( $folder_link ) . "\n\n" ) : '';
		$text       = $name . "\n" . $overview . "\n\n" . $drive_line . "The Pulse Redirect CSV is attached.\n";

		return Neo_Pulse_App_Mail::send(
			$to,
			$subj,
			$text,
			array(
				array(
					'fileName' => 'pulse-redirect-' . $date . '.csv',
					'mime'     => 'text/csv',
					'content'  => trim( (string) ( $map['answer'] ?? '' ) ) !== '' ? (string) $map['answer'] : self::csv( $map ),
				),
			),
			self::html( $name, $overview, $redirects, $leave, $folder_link )
		);
	}

	/**
	 * @param array<string,mixed> $map
	 */
	private static function csv( array $map ): string {
		$lines = array( 'id,source,matching,destination,type,category,status,ignore' );
		foreach ( self::import_rows( $map ) as $row ) {
			$lines[] = self::csv_row( $row );
		}
		return implode( "\n", $lines ) . "\n";
	}

	/**
	 * @return array<int,array<int,string>>
	 */
	private static function answer_rows( string $answer ): array {
		$out = array();
		foreach ( preg_split( '/\r\n|\n|\r/', $answer ) as $line ) {
			$line = trim( (string) $line );
			if ( $line === '' ) {
				continue;
			}
			$out[] = str_getcsv( $line );
		}
		if ( $out === array() ) {
			$out[] = array( $answer );
		}
		return self::without_self_redirects( $out );
	}

	/**
	 * Drop rows where source path equals destination path. Keepers stay off the sheet.
	 * Re-number id after the header.
	 *
	 * @param array<int,array<int,string>> $rows
	 * @return array<int,array<int,string>>
	 */
	private static function without_self_redirects( array $rows ): array {
		$out = array();
		$id  = 1;
		foreach ( $rows as $i => $row ) {
			if ( ! is_array( $row ) ) {
				continue;
			}
			$source = isset( $row[1] ) ? (string) $row[1] : '';
			$dest   = isset( $row[3] ) ? (string) $row[3] : '';
			$is_hdr = $i === 0 && strtolower( trim( (string) ( $row[0] ?? '' ) ) ) === 'id';
			if ( $is_hdr ) {
				$out[] = $row;
				continue;
			}
			if ( self::is_self_redirect( $source, $dest ) ) {
				continue;
			}
			$row[0] = (string) $id;
			$out[]  = $row;
			++$id;
		}
		return $out;
	}

	private static function is_self_redirect( string $source, string $destination ): bool {
		$src = self::norm_redirect_path( $source );
		$dst = self::norm_redirect_path( $destination );
		return $src !== '' && $dst !== '' && $src === $dst;
	}

	private static function norm_redirect_path( string $value ): string {
		$value = trim( $value );
		if ( $value === '' ) {
			return '';
		}
		if ( stripos( $value, 'http://' ) === 0 || stripos( $value, 'https://' ) === 0 ) {
			return self::source_path( $value );
		}
		$path = strtolower( (string) preg_replace( '#/+#', '/', $value ) );
		$path = ltrim( $path, '/' );
		if ( $path !== '' && substr( $path, -1 ) !== '/' ) {
			$path .= '/';
		}
		return $path;
	}

	/**
	 * @param array<string,mixed> $map
	 * @return array<int,array<int,string>>
	 */
	private static function matrix( array $map ): array {
		$out = array( array( 'id', 'source', 'matching', 'destination', 'type', 'category', 'status', 'ignore' ) );
		foreach ( self::import_rows( $map ) as $row ) {
			$out[] = $row;
		}
		return $out;
	}

	/**
	 * Pulse Redirect import rows. Same columns as Rank Math redirections.
	 *
	 * @param array<string,mixed> $map
	 * @return array<int,array<int,string>>
	 */
	private static function import_rows( array $map ): array {
		$out = array();
		$i   = 1;
		foreach ( (array) ( $map['redirects'] ?? array() ) as $row ) {
			if ( ! is_array( $row ) ) {
				continue;
			}
			$source = self::source_path( (string) ( $row['from'] ?? '' ) );
			$dest   = trim( (string) ( $row['to'] ?? '' ) );
			if ( $source === '' || $dest === '' || self::is_self_redirect( $source, $dest ) ) {
				continue;
			}
			$out[] = array(
				(string) $i,
				$source,
				'exact',
				$dest,
				'301',
				'',
				'active',
				'',
			);
			++$i;
		}
		return $out;
	}

	private static function source_path( string $url ): string {
		$parts = wp_parse_url( trim( $url ) );
		$path  = is_array( $parts ) && isset( $parts['path'] ) ? (string) $parts['path'] : '';
		$path  = strtolower( (string) preg_replace( '#/+#', '/', $path ) );
		$path  = ltrim( $path, '/' );
		if ( $path !== '' && substr( $path, -1 ) !== '/' ) {
			$path .= '/';
		}
		return $path;
	}

	/**
	 * @param array<int,string> $cols
	 */
	private static function csv_row( array $cols ): string {
		$out = array();
		foreach ( $cols as $col ) {
			$col = str_replace( '"', '""', (string) $col );
			$out[] = '"' . $col . '"';
		}
		return implode( ',', $out );
	}

	private static function html( string $site_name, string $overview, int $redirects, int $leave, string $folder_link ): string {
		$body = '<!DOCTYPE html><html><body style="margin:0;padding:0;background:#202124;">'
			. '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#202124;padding:32px 16px;">'
			. '<tr><td align="center">'
			. '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#303134;border-radius:8px;padding:32px;">'
			. '<tr><td style="font-family:Arial,Helvetica,sans-serif;font-size:16px;letter-spacing:0.08em;text-transform:uppercase;color:#9aa0a6;">NEO Pulse</td></tr>'
			. '<tr><td style="font-family:Arial,Helvetica,sans-serif;font-size:22px;line-height:28px;color:#e8eaed;padding-top:12px;">' . esc_html( $site_name ) . '</td></tr>'
			. '<tr><td style="font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:24px;color:#e8eaed;padding-top:16px;">' . esc_html( $overview ) . '</td></tr>'
			. '<tr><td style="padding-top:24px;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>'
			. '<td style="font-family:Arial,Helvetica,sans-serif;font-size:20px;color:#fdd663;padding-right:16px;">' . (int) $redirects . '<br><span style="font-size:14px;color:#9aa0a6;">Redirects</span></td>'
			. '<td style="font-family:Arial,Helvetica,sans-serif;font-size:20px;color:#e8eaed;">' . (int) $leave . '<br><span style="font-size:14px;color:#9aa0a6;">Left alone</span></td>'
			. '</tr></table></td></tr>';
		$folder_link = trim( $folder_link );
		if ( $folder_link !== '' ) {
			$body .= '<tr><td style="font-family:Arial,Helvetica,sans-serif;font-size:16px;padding-top:20px;"><a href="' . esc_url( $folder_link ) . '" style="color:#8ab4f8;">Open the Drive folder</a></td></tr>';
		}
		$body .= '<tr><td style="font-family:Arial,Helvetica,sans-serif;font-size:16px;color:#9aa0a6;padding-top:24px;">Suggest only. Apply redirects after you accept the map.</td></tr>'
			. '</table></td></tr></table></body></html>';
		return $body;
	}
}
