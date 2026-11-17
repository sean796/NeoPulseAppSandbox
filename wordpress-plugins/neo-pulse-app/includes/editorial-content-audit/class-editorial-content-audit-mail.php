<?php
/**
 * AgentMail handoff for editorial content audits (sean@neodigital.ca).
 *
 * @package Neo_Pulse_App
 */

defined( 'ABSPATH' ) || exit;

class Neo_Pulse_App_Editorial_Content_Audit_Mail {

	/** Website audits folder the handoffs already live in. */
	const AUDITS_PARENT_FOLDER_ID = '1-I_na_4srNZR3VthtMEcbVPhJVUzkqnZ';

	/**
	 * One folder per run, under Website audits.
	 *
	 * @return array{ok:bool,folderId?:string,folderLink?:string,error?:string}
	 */
	public static function ensure_folder( string $site_name, int $run_id ): array {
		if ( ! class_exists( 'Neo_Pulse_App_Google_Drive_Upload' ) ) {
			return array( 'ok' => false, 'error' => 'Google Drive upload is not loaded' );
		}
		$tz    = new DateTimeZone( Neo_Pulse_App_Editorial_Content_Audit_Schedule::TZ );
		$now   = new DateTime( 'now', $tz );
		$name  = trim( $site_name ) !== '' ? trim( $site_name ) : 'Editorial audit';
		$label = $name . ' editorial audit ' . $now->format( 'Y-m-d Hi' ) . ' run ' . $run_id;
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
	 * Rewrite the findings CSV in the run folder. Pages with no error are omitted.
	 *
	 * @param array<int,array<string,mixed>> $findings
	 * @return array{ok:bool,sheetLink?:string,error?:string}
	 */
	public static function write_progress( string $folder_id, array $findings ): array {
		if ( ! class_exists( 'Neo_Pulse_App_Google_Drive_Upload' ) ) {
			return array( 'ok' => false, 'error' => 'Google Drive upload is not loaded' );
		}
		$errors        = self::error_rows( $findings );
		$sheet_started = microtime( true );
		$sheet         = Neo_Pulse_App_Google_Drive_Upload::upload_deliverable(
			array(
				'fileName'             => 'findings',
				'content'              => self::csv( $errors ),
				'folderId'             => $folder_id,
				'mime'                 => 'text/csv',
				'convertToGoogleSheet' => true,
				'convertToGoogleDoc'   => false,
				'alsoMatchNames'       => array( 'findings.csv' ),
				'sheetValues'          => self::findings_matrix( $errors ),
			)
		);
		$sheet_ms = (int) round( ( microtime( true ) - $sheet_started ) * 1000 );
		if ( class_exists( 'Neo_Pulse_App_Editorial_Content_Audit_Worker' ) ) {
			$sheet_ok = (int) ( $sheet['statusCode'] ?? 500 ) === 200;
			Neo_Pulse_App_Editorial_Content_Audit_Worker::note_api(
				array(
					'kind'    => $sheet_ok ? 'publish' : 'publish_fail',
					'url'     => 'https://www.googleapis.com/upload/drive/v3/files',
					'status'  => (int) ( $sheet['statusCode'] ?? 0 ),
					'seconds' => $sheet_ms / 1000,
					'label'   => 'Drive findings sheet',
					'error'   => $sheet_ok ? '' : 'upload failed',
				)
			);
		}
		$sheet_body = isset( $sheet['body'] ) && is_array( $sheet['body'] ) ? $sheet['body'] : array();
		if ( (int) ( $sheet['statusCode'] ?? 500 ) !== 200 ) {
			return array( 'ok' => false, 'error' => (string) ( $sheet_body['error'] ?? 'Could not write the findings CSV' ) );
		}
		return array(
			'ok'        => true,
			'sheetLink' => trim( (string) ( $sheet_body['webViewLink'] ?? '' ) ),
		);
	}

	/**
	 * @param array<int,array<string,mixed>> $findings
	 * @param array<string,mixed>            $rollup
	 * @return array<string,mixed>
	 */
	public static function send_summary(
		string $to,
		string $site_name,
		string $site_id,
		array $findings,
		array $rollup,
		string $folder_link = ''
	): array {
		$api_key = class_exists( 'Neo_Pulse_App_Secrets' ) ? Neo_Pulse_App_Secrets::agentmail_api_key() : '';
		if ( $api_key === '' ) {
			return array( 'ok' => false, 'error' => 'AgentMail API key is not configured' );
		}
		unset( $api_key );

		$tz   = new DateTimeZone( Neo_Pulse_App_Editorial_Content_Audit_Schedule::TZ );
		$now  = new DateTime( 'now', $tz );
		$date = $now->format( 'Y-m-d' );
		$when = $now->format( 'M j, Y' ) . ' at ' . $now->format( 'g:i A' ) . ' MT';
		$name = trim( $site_name ) !== '' ? trim( $site_name ) : ( $site_id !== '' ? $site_id : 'Editorial content audit' );

		$counts   = isset( $rollup['counts'] ) && is_array( $rollup['counts'] ) ? $rollup['counts'] : array();
		$subj     = self::subject_line( $name, $counts );
		$overview = trim( (string) ( $rollup['summary'] ?? '' ) );
		if ( $overview === '' ) {
			$overview = 'Audited ' . (int) ( $counts['pagesAudited'] ?? 0 ) . ' pages with '
				. (int) ( $counts['findingCount'] ?? count( $findings ) ) . ' findings.';
		}
		$drive_line = trim( $folder_link ) !== '' ? ( "Drive folder: " . trim( $folder_link ) . "\n\n" ) : '';
		$text = $name . "\n" . $overview . "\n\n"
			. $drive_line
			. self::plain_sections( $rollup )
			. "\nThe CSV of errors is attached.\n";

		$attachments = array(
			array(
				'fileName' => 'editorial-content-audit-' . $date . '.csv',
				'mime'     => 'text/csv',
				'content'  => self::csv( $findings ),
			),
		);

		return Neo_Pulse_App_Mail::send(
			$to,
			$subj,
			$text,
			$attachments,
			self::html( $name, $when, $overview, $counts, $rollup, $folder_link )
		);
	}

	/**
	 * @param array<string,mixed> $counts
	 */
	private static function subject_line( string $site_name, array $counts ): string {
		$high = (int) ( $counts['high'] ?? 0 );
		$med  = (int) ( $counts['medium'] ?? 0 );
		$low  = (int) ( $counts['low'] ?? 0 );
		$total = (int) ( $counts['findingCount'] ?? ( $high + $med + $low ) );
		$tail  = $total > 0
			? ( $total . ' findings (' . $high . ' high)' )
			: 'no findings';
		$subj = $site_name . ': ' . $tail;
		if ( function_exists( 'mb_substr' ) ) {
			return mb_substr( $subj, 0, 70 );
		}
		return substr( $subj, 0, 70 );
	}

	/**
	 * @param array<string,mixed> $rollup
	 */
	private static function plain_sections( array $rollup ): string {
		$parts = array();
		$gsc   = trim( (string) ( $rollup['gscNote'] ?? '' ) );
		if ( $gsc !== '' ) {
			$parts[] = $gsc;
		}
		$main = isset( $rollup['mainProblems'] ) && is_array( $rollup['mainProblems'] ) ? $rollup['mainProblems'] : array();
		if ( count( $main ) > 0 ) {
			$parts[] = "Main problems:\n- " . implode( "\n- ", array_map( 'strval', $main ) );
		}
		$patterns = isset( $rollup['patterns'] ) && is_array( $rollup['patterns'] ) ? $rollup['patterns'] : array();
		if ( count( $patterns ) > 0 ) {
			$parts[] = "Repeated patterns:\n- " . implode( "\n- ", array_map( 'strval', $patterns ) );
		}
		$next = isset( $rollup['nextSteps'] ) && is_array( $rollup['nextSteps'] ) ? $rollup['nextSteps'] : array();
		if ( count( $next ) > 0 ) {
			$parts[] = "What needs to happen:\n- " . implode( "\n- ", array_map( 'strval', $next ) );
		}
		return implode( "\n\n", $parts );
	}

	/**
	 * @param array<string,mixed> $counts
	 * @param array<string,mixed> $rollup
	 */
	private static function html(
		string $site_name,
		string $when,
		string $overview,
		array $counts,
		array $rollup,
		string $folder_link = ''
	): string {
		$body = '<!DOCTYPE html><html><body style="margin:0;padding:0;background:#202124;">'
			. '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#202124;padding:32px 16px;">'
			. '<tr><td align="center">'
			. '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#303134;border-radius:8px;padding:32px 32px 24px;">'
			. '<tr><td style="font-family:Arial,Helvetica,sans-serif;font-size:16px;letter-spacing:0.08em;text-transform:uppercase;color:#9aa0a6;">NEO Pulse</td></tr>'
			. '<tr><td style="font-family:Arial,Helvetica,sans-serif;font-size:22px;line-height:28px;color:#e8eaed;padding-top:12px;">' . esc_html( $site_name ) . '</td></tr>'
			. '<tr><td style="font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:24px;color:#e8eaed;padding-top:16px;">' . esc_html( $overview ) . '</td></tr>'
			. '<tr><td style="font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:20px;color:#9aa0a6;padding-top:12px;">Editorial content audit, ' . esc_html( $when ) . '</td></tr>'
			. '<tr><td style="padding-top:24px;">'
			. '<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>'
			. self::stat_cell( (string) (int) ( $counts['pagesAudited'] ?? 0 ), 'Pages', '#e8eaed' )
			. self::stat_cell( (string) (int) ( $counts['high'] ?? 0 ), 'High', '#f28b82' )
			. self::stat_cell( (string) (int) ( $counts['findingCount'] ?? 0 ), 'Findings', '#fdd663' )
			. '</tr></table></td></tr>';

		$gsc = trim( (string) ( $rollup['gscNote'] ?? '' ) );
		if ( $gsc !== '' ) {
			$body .= '<tr><td style="font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:20px;color:#9aa0a6;padding-top:16px;">' . esc_html( $gsc ) . '</td></tr>';
		}
		$folder_link = trim( $folder_link );
		if ( $folder_link !== '' ) {
			$body .= '<tr><td style="font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:24px;padding-top:20px;"><a href="' . esc_url( $folder_link ) . '" style="color:#8ab4f8;">Open the Drive folder</a></td></tr>';
		}
		$body .= '<tr><td style="font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:20px;color:#9aa0a6;padding-top:24px;">The CSV of errors is attached.</td></tr>'
			. '</table>'
			. '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;"><tr><td style="font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:20px;color:#9aa0a6;padding:16px 8px 0;">NEO Digital</td></tr></table>'
			. '</td></tr></table></body></html>';
		return $body;
	}

	private static function stat_cell( string $value, string $label, string $color ): string {
		return '<td width="33%" align="center" style="padding:8px;">'
			. '<div style="font-family:Arial,Helvetica,sans-serif;font-size:28px;line-height:32px;color:' . esc_attr( $color ) . ';">' . esc_html( $value ) . '</div>'
			. '<div style="font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:20px;color:#9aa0a6;padding-top:4px;">' . esc_html( $label ) . '</div>'
			. '</td>';
	}

	/**
	 * Drop blank rows. A page with no error never becomes a row.
	 *
	 * @param array<int,array<string,mixed>> $rows
	 * @return array<int,array<string,mixed>>
	 */
	private static function error_rows( array $rows ): array {
		$errors = array();
		foreach ( $rows as $row ) {
			if ( ! is_array( $row ) ) {
				continue;
			}
			if ( trim( (string) ( $row['problem'] ?? '' ) ) === '' ) {
				continue;
			}
			$errors[] = $row;
		}
		return $errors;
	}

	/**
	 * @param array<int,array<string,mixed>> $rows
	 * @return array<int,array<int,string>>
	 */
	private static function findings_matrix( array $rows ): array {
		$sorted   = self::error_rows( $rows );
		$matrix   = array();
		$matrix[] = array( 'pageId', 'url', 'title', 'status', 'type', 'severity', 'certainty', 'quote', 'problem', 'fix' );
		foreach ( $sorted as $row ) {
			$matrix[] = array(
				(string) (int) ( $row['pageId'] ?? 0 ),
				(string) ( $row['url'] ?? '' ),
				(string) ( $row['title'] ?? '' ),
				(string) ( $row['status'] ?? '' ),
				(string) ( $row['type'] ?? '' ),
				(string) ( $row['severity'] ?? '' ),
				(string) ( $row['certainty'] ?? '' ),
				(string) ( $row['quote'] ?? '' ),
				(string) ( $row['problem'] ?? '' ),
				(string) ( $row['fix'] ?? '' ),
			);
		}
		return $matrix;
	}

	/**
	 * @param array<int,array<string,mixed>> $rows
	 */
	private static function csv( array $rows ): string {
		$matrix = self::findings_matrix( $rows );
		$lines  = array();
		foreach ( $matrix as $cols ) {
			$lines[] = self::csv_line( $cols );
		}
		return implode( "\n", $lines ) . "\n";
	}

	private static function severity_rank( string $severity ): int {
		$severity = strtolower( trim( $severity ) );
		if ( $severity === 'high' ) {
			return 3;
		}
		if ( $severity === 'medium' ) {
			return 2;
		}
		if ( $severity === 'low' ) {
			return 1;
		}
		return 0;
	}

	/**
	 * @param array<int,string> $cols
	 */
	private static function csv_line( array $cols ): string {
		$out = array();
		foreach ( $cols as $col ) {
			$col    = str_replace( '"', '""', $col );
			$out[]  = '"' . $col . '"';
		}
		return implode( ',', $out );
	}
}
