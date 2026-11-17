<?php
/**
 * AgentMail follow-up report for money-page internal links (sean@neodigital.ca).
 *
 * @package Neo_Pulse_App
 */

defined( 'ABSPATH' ) || exit;

class Neo_Pulse_App_Money_Page_Internal_Links_Mail {

	/**
	 * @param array<int,array<string,mixed>> $applied Applied link rows.
	 * @param array<int,array<string,mixed>> $failed  Failed rows.
	 * @param array<int,array<string,mixed>> $skipped Skipped rows (already linked / no match).
	 * @return array<string,mixed>
	 */
	public static function send_summary(
		string $to,
		string $site_name,
		string $site_id,
		array $applied,
		array $failed,
		array $skipped,
		int $money_pages,
		int $planned
	): array {
		$api_key = class_exists( 'Neo_Pulse_App_Secrets' ) ? Neo_Pulse_App_Secrets::agentmail_api_key() : '';
		if ( $api_key === '' ) {
			return array( 'ok' => false, 'error' => 'AgentMail API key is not configured' );
		}
		unset( $api_key );

		$tz   = new DateTimeZone( Neo_Pulse_App_Money_Page_Internal_Links_Schedule::TZ );
		$now  = new DateTime( 'now', $tz );
		$date = $now->format( 'Y-m-d' );
		$when = $now->format( 'M j, Y' ) . ' at ' . $now->format( 'g:i A' ) . ' MT';
		$name = trim( $site_name ) !== '' ? trim( $site_name ) : ( $site_id !== '' ? $site_id : 'Money page links' );

		$subj = self::subject_line( $name, $applied, $failed );
		$overview = self::overview_paragraph( $applied, $failed, $skipped, $money_pages, $planned );
		$text     = $name . "\n" . $overview . "\n\nThe spreadsheet is attached.\n";

		$attachments = array(
			array(
				'fileName' => 'money-page-internal-links-' . $date . '.csv',
				'mime'     => 'text/csv',
				'content'  => self::csv( array_merge( $applied, $skipped, $failed ) ),
			),
		);

		return Neo_Pulse_App_Mail::send(
			$to,
			$subj,
			$text,
			$attachments,
			self::html( $name, $when, $overview, $applied, $failed, $skipped )
		);
	}

	/**
	 * @param array<int,array<string,mixed>> $applied
	 * @param array<int,array<string,mixed>> $failed
	 */
	private static function subject_line( string $site_name, array $applied, array $failed ): string {
		$parts = array();
		if ( count( $applied ) > 0 ) {
			$parts[] = count( $applied ) . ' linked';
		}
		if ( count( $failed ) > 0 ) {
			$parts[] = count( $failed ) . ' failed';
		}
		$tail = count( $parts ) > 0 ? implode( ', ', $parts ) : 'no new links';
		$subj = $site_name . ': ' . $tail;
		if ( function_exists( 'mb_substr' ) ) {
			return mb_substr( $subj, 0, 70 );
		}
		return substr( $subj, 0, 70 );
	}

	/**
	 * @param array<int,array<string,mixed>> $applied
	 * @param array<int,array<string,mixed>> $failed
	 * @param array<int,array<string,mixed>> $skipped
	 */
	private static function overview_paragraph(
		array $applied,
		array $failed,
		array $skipped,
		int $money_pages,
		int $planned
	): string {
		if ( count( $applied ) === 0 && count( $failed ) === 0 ) {
			return 'Reviewed ' . $money_pages . ' money pages. No new internal links were written'
				. ( count( $skipped ) > 0 ? ' (' . count( $skipped ) . ' skipped).' : '.' );
		}
		$para = 'Reviewed ' . $money_pages . ' money pages and planned ' . $planned . ' links. ';
		if ( count( $applied ) > 0 ) {
			$para .= 'Applied ' . count( $applied ) . ( count( $applied ) === 1 ? ' link' : ' links' )
				. ' from money pages to supporting blogs and related pages.';
		}
		if ( count( $failed ) > 0 ) {
			$para .= ' ' . count( $failed ) . ( count( $failed ) === 1 ? ' write failed.' : ' writes failed.' );
		}
		return trim( $para );
	}

	/**
	 * @param array<int,array<string,mixed>> $applied
	 * @param array<int,array<string,mixed>> $failed
	 * @param array<int,array<string,mixed>> $skipped
	 */
	private static function html(
		string $site_name,
		string $when,
		string $overview,
		array $applied,
		array $failed,
		array $skipped
	): string {
		return '<!DOCTYPE html><html><body style="margin:0;padding:0;background:#202124;">'
			. '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#202124;padding:32px 16px;">'
			. '<tr><td align="center">'
			. '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#303134;border-radius:8px;padding:32px 32px 24px;">'
			. '<tr><td style="font-family:Arial,Helvetica,sans-serif;font-size:16px;letter-spacing:0.08em;text-transform:uppercase;color:#9aa0a6;">NEO Pulse</td></tr>'
			. '<tr><td style="font-family:Arial,Helvetica,sans-serif;font-size:22px;line-height:28px;color:#e8eaed;padding-top:12px;">' . esc_html( $site_name ) . '</td></tr>'
			. '<tr><td style="font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:24px;color:#e8eaed;padding-top:16px;">' . esc_html( $overview ) . '</td></tr>'
			. '<tr><td style="font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:20px;color:#9aa0a6;padding-top:12px;">Money page internal links, ' . esc_html( $when ) . '</td></tr>'
			. '<tr><td style="padding-top:24px;">'
			. '<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>'
			. self::stat_cell( (string) count( $applied ), 'Linked', '#81c995' )
			. self::stat_cell( (string) count( $skipped ), 'Skipped', '#fdd663' )
			. self::stat_cell( (string) count( $failed ), 'Failed', '#f28b82' )
			. '</tr></table></td></tr>'
			. '<tr><td style="font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:20px;color:#9aa0a6;padding-top:24px;">The spreadsheet is attached.</td></tr>'
			. '</table>'
			. '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;"><tr><td style="font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:20px;color:#9aa0a6;padding:16px 8px 0;">NEO Digital</td></tr></table>'
			. '</td></tr></table></body></html>';
	}

	private static function stat_cell( string $value, string $label, string $color ): string {
		return '<td width="33%" align="center" style="padding:8px;">'
			. '<div style="font-family:Arial,Helvetica,sans-serif;font-size:28px;line-height:32px;color:' . esc_attr( $color ) . ';">' . esc_html( $value ) . '</div>'
			. '<div style="font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:20px;color:#9aa0a6;padding-top:4px;">' . esc_html( $label ) . '</div>'
			. '</td>';
	}

	/**
	 * @param array<int,array<string,mixed>> $rows
	 */
	private static function csv( array $rows ): string {
		$lines   = array();
		// anchorText = exact phrase inside the live <a>…</a> (Ctrl+F in page source). anchorHint = plan suggestion only.
		$lines[] = 'status,moneyUrl,targetUrl,anchorText,snippet,anchorHint,error';
		foreach ( $rows as $row ) {
			if ( ! is_array( $row ) ) {
				continue;
			}
			$lines[] = self::csv_line(
				array(
					(string) ( $row['status'] ?? '' ),
					(string) ( $row['moneyUrl'] ?? '' ),
					(string) ( $row['targetUrl'] ?? $row['supportUrl'] ?? '' ),
					(string) ( $row['anchorText'] ?? '' ),
					(string) ( $row['snippet'] ?? '' ),
					(string) ( $row['anchorHint'] ?? '' ),
					(string) ( $row['error'] ?? '' ),
				)
			);
		}
		return implode( "\n", $lines ) . "\n";
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
