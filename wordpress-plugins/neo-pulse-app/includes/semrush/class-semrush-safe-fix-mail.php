<?php
/**
 * AgentMail summary for Semrush safe-fix runs (existing inbox, dark notice, AI overview).
 *
 * @package Neo_Pulse_App
 */

defined( 'ABSPATH' ) || exit;

class Neo_Pulse_App_Semrush_Safe_Fix_Mail {

	/**
	 * @param array<int,array<string,mixed>> $fixed     Confirmed site changes.
	 * @param array<int,array<string,mixed>> $failed    Failed applies.
	 * @param array<int,array<string,mixed>> $listed    Semrush Errors found but not auto-fixed.
	 * @param array<string,mixed>            $checklist AI Neo MCP instructions (JSON attachment).
	 * @return array<string,mixed>
	 */
	public static function send_summary( string $to, array $fixed, array $failed, array $listed, int $skipped, string $site_id, array $checklist = array() ): array {
		// Existing AgentMail only (communication@…). Do not create a Semrush inbox.
		$api_key = class_exists( 'Neo_Pulse_App_Secrets' ) ? Neo_Pulse_App_Secrets::agentmail_api_key() : '';
		if ( $api_key === '' ) {
			return array( 'ok' => false, 'error' => 'AgentMail API key is not configured' );
		}
		unset( $api_key );

		$fixed  = self::decode_rows( $fixed );
		$failed = self::decode_rows( $failed );
		$listed = self::decode_rows( $listed );

		$tz        = new DateTimeZone( Neo_Pulse_App_Semrush_Safe_Fix_Schedule::TZ );
		$now       = new DateTime( 'now', $tz );
		$date      = $now->format( 'Y-m-d' );
		$when      = $now->format( 'M j, Y' ) . ' at ' . $now->format( 'g:i A' ) . ' MT';
		$site_name = self::site_name( array_merge( $fixed, $failed, $listed ), $site_id );

		$subj = self::subject_line( $site_name, $fixed, $failed, $listed );

		$checklist_count = isset( $checklist['items'] ) && is_array( $checklist['items'] ) ? count( $checklist['items'] ) : 0;
		$overview        = self::overview_paragraph( $fixed, $failed, $listed );
		$text            = $site_name . "\n" . $overview . "\n\nThe spreadsheet is attached.\n";

		$attachments = array(
			array(
				'fileName' => 'semrush-safe-fix-' . $date . '.csv',
				'mime'     => 'text/csv',
				'content'  => self::csv( array_merge( $fixed, $listed, $failed ) ),
			),
		);
		if ( $checklist_count > 0 ) {
			$json = wp_json_encode( $checklist, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES );
			if ( is_string( $json ) && $json !== '' ) {
				$attachments[] = array(
					'fileName' => 'semrush-neo-mcp-checklist-' . $date . '.json',
					'mime'     => 'application/json',
					'content'  => $json . "\n",
				);
			}
		}

		return Neo_Pulse_App_Mail::send(
			$to,
			$subj,
			$text,
			$attachments,
			self::html( $site_name, $when, $overview, $fixed, $failed, $listed, $skipped, $checklist_count )
		);
	}

	/**
	 * @param array<int,array<string,mixed>> $fixed
	 * @param array<int,array<string,mixed>> $failed
	 * @param array<int,array<string,mixed>> $listed
	 */
	private static function subject_line( string $site_name, array $fixed, array $failed, array $listed ): string {
		$parts = array();
		if ( count( $fixed ) > 0 ) {
			$parts[] = count( $fixed ) . ' fixed';
		}
		if ( count( $failed ) > 0 ) {
			$parts[] = count( $failed ) . ' failed';
		}
		if ( count( $listed ) > 0 ) {
			$parts[] = count( $listed ) . ' listed';
		}
		$tail = count( $parts ) > 0 ? implode( ', ', $parts ) : 'no Errors';
		$subj = $site_name . ': ' . $tail;
		if ( function_exists( 'mb_substr' ) ) {
			return mb_substr( $subj, 0, 70 );
		}
		return substr( $subj, 0, 70 );
	}

	/**
	 * One short right-column line per Error row (no paragraph).
	 *
	 * @param array<string,mixed> $row
	 * @param 'fixed'|'listed'|'failed' $mode
	 */
	private static function row_summary( array $row, string $mode ): string {
		return self::action_taken( $row, $mode );
	}

	/**
	 * @param array<int,array<string,mixed>> $rows
	 * @return array<int,array<string,mixed>>
	 */
	private static function decode_rows( array $rows ): array {
		$out = array();
		foreach ( $rows as $row ) {
			if ( ! is_array( $row ) ) {
				continue;
			}
			foreach ( array( 'before', 'after', 'value', 'error', 'pageUrl', 'siteName', 'issueName', 'fromUrl', 'toUrl', 'neoMcpInstructions' ) as $key ) {
				if ( isset( $row[ $key ] ) && is_string( $row[ $key ] ) ) {
					$row[ $key ] = self::decode_unicode_text( $row[ $key ] );
				}
			}
			$out[] = $row;
		}
		return $out;
	}

	/**
	 * Decode JSON \uXXXX escapes and the broken "u00ee" form (missing backslash).
	 * Fixed-format hex escapes only (not semantic matching).
	 */
	private static function decode_unicode_text( string $text ): string {
		if ( $text === '' ) {
			return $text;
		}
		$chr = static function ( string $hex ): string {
			$code = hexdec( $hex );
			if ( $code <= 0 ) {
				return 'u' . $hex;
			}
			return html_entity_decode( '&#' . $code . ';', ENT_QUOTES, 'UTF-8' );
		};
		$text = (string) preg_replace_callback(
			'/\\\\u([0-9a-fA-F]{4})/',
			static function ( array $m ) use ( $chr ): string {
				return $chr( $m[1] );
			},
			$text
		);
		$text = (string) preg_replace_callback(
			'/(?<![0-9a-fA-F\\\\])u([0-9a-fA-F]{4})(?![0-9a-fA-F])/',
			static function ( array $m ) use ( $chr ): string {
				return $chr( $m[1] );
			},
			$text
		);
		return $text;
	}

	/**
	 * @param array<int,array<string,mixed>> $rows
	 */
	private static function site_name( array $rows, string $site_id ): string {
		foreach ( $rows as $row ) {
			$name = trim( (string) ( $row['siteName'] ?? '' ) );
			if ( $name !== '' ) {
				return $name;
			}
		}
		return $site_id !== '' ? $site_id : 'Semrush safe fix';
	}

	/**
	 * @param array<string,mixed> $row
	 */
	private static function display_kind( array $row ): string {
		$issue = trim( (string) ( $row['issueName'] ?? '' ) );
		if ( $issue !== '' ) {
			return $issue;
		}
		return self::kind_label( (string) ( $row['kind'] ?? '' ) );
	}

	private static function kind_label( string $kind ): string {
		$k = strtolower( trim( $kind ) );
		if ( strpos( $k, 'image' ) !== false ) {
			return 'Broken image';
		}
		if ( strpos( $k, 'link' ) !== false ) {
			return 'Broken link';
		}
		if ( $k === 'title' || $k === '' ) {
			return 'Title';
		}
		if ( $k === 'listed' ) {
			return 'Semrush Error';
		}
		return ucwords( str_replace( array( '_', '-' ), ' ', $k ) );
	}

	/**
	 * @param array<string,mixed> $row
	 */
	private static function change_before( array $row ): string {
		$before = trim( (string) ( $row['before'] ?? '' ) );
		if ( $before !== '' ) {
			return $before;
		}
		return trim( (string) ( $row['fromUrl'] ?? '' ) );
	}

	/**
	 * @param array<string,mixed> $row
	 */
	private static function change_after( array $row ): string {
		$after = trim( (string) ( $row['after'] ?? $row['value'] ?? '' ) );
		if ( $after !== '' ) {
			return $after;
		}
		return trim( (string) ( $row['toUrl'] ?? '' ) );
	}

	/**
	 * @param array<int,array<string,mixed>> $fixed
	 * @param array<int,array<string,mixed>> $failed
	 * @param array<int,array<string,mixed>> $listed
	 */
	private static function html( string $site_name, string $when, string $overview, array $fixed, array $failed, array $listed, int $skipped, int $checklist_count = 0 ): string {
		return '<!DOCTYPE html><html><body style="margin:0;padding:0;background:#202124;">'
			. '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#202124;padding:32px 16px;">'
			. '<tr><td align="center">'
			. '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#303134;border-radius:8px;padding:32px 32px 24px;">'
			. '<tr><td style="font-family:Arial,Helvetica,sans-serif;font-size:16px;letter-spacing:0.08em;text-transform:uppercase;color:#9aa0a6;">NEO Pulse</td></tr>'
			. '<tr><td style="font-family:Arial,Helvetica,sans-serif;font-size:22px;line-height:28px;color:#e8eaed;padding-top:12px;">' . esc_html( $site_name ) . '</td></tr>'
			. '<tr><td style="font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:24px;color:#e8eaed;padding-top:16px;">' . esc_html( $overview ) . '</td></tr>'
			. '<tr><td style="font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:20px;color:#9aa0a6;padding-top:12px;">Semrush safe fix, ' . esc_html( $when ) . '</td></tr>'
			. '<tr><td style="padding-top:24px;">'
			. '<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>'
			. self::stat_cell( (string) count( $fixed ), 'Fixed', '#81c995' )
			. self::stat_cell( (string) count( $listed ), 'Listed', '#fdd663' )
			. self::stat_cell( (string) count( $failed ), 'Failed', '#f28b82' )
			. '</tr></table></td></tr>'
			. ( $skipped > 0
				? '<tr><td style="font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:20px;color:#9aa0a6;padding-top:12px;">Skipped: ' . (int) $skipped . '</td></tr>'
				: '' )
			. '<tr><td style="font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:20px;color:#9aa0a6;padding-top:24px;">The spreadsheet is attached.</td></tr>'
			. '</table>'
			. '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;"><tr><td style="font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:20px;color:#9aa0a6;padding:16px 8px 0;">NEO Digital</td></tr></table>'
			. '</td></tr></table></body></html>';
	}

	/**
	 * @param array<int,array<string,mixed>> $fixed
	 * @param array<int,array<string,mixed>> $failed
	 * @param array<int,array<string,mixed>> $listed
	 */
	private static function overview_paragraph( array $fixed, array $failed, array $listed ): string {
		if ( count( $fixed ) === 0 && count( $failed ) === 0 && count( $listed ) === 0 ) {
			return 'No Semrush errors were found.';
		}
		$groups = array();
		foreach ( $fixed as $row ) {
			$label = self::display_kind( $row );
			$groups[ $label ] = (int) ( $groups[ $label ] ?? 0 ) + 1;
		}
		$sentences = array();
		foreach ( $groups as $label => $n ) {
			$sentences[] = self::group_sentence( (string) $label, (int) $n );
		}
		$para = '';
		if ( count( $fixed ) > 0 ) {
			$para = 'We fixed ' . count( $fixed ) . ( count( $fixed ) === 1 ? ' item. ' : ' items. ' );
			$para .= implode( ' ', $sentences );
		}
		if ( count( $failed ) > 0 ) {
			$para .= ( $para !== '' ? ' ' : '' ) . count( $failed ) . ( count( $failed ) === 1 ? ' item did not land.' : ' items did not land.' );
		}
		if ( count( $listed ) > 0 ) {
			$para .= ( $para !== '' ? ' ' : '' ) . count( $listed ) . ( count( $listed ) === 1 ? ' item was logged and left as is.' : ' items were logged and left as is.' );
		}
		return trim( $para );
	}

	private static function group_sentence( string $label, int $n ): string {
		$low = strtolower( $label );
		if ( strpos( $low, 'title' ) !== false ) {
			return $n === 1 ? 'One duplicate title was rewritten.' : ( $n . ' duplicate titles were rewritten.' );
		}
		if ( strpos( $low, 'meta' ) !== false ) {
			return $n === 1 ? 'One page got its own meta description.' : ( $n . ' pages got their own meta description.' );
		}
		if ( strpos( $low, 'crawl' ) !== false ) {
			return $n === 1 ? 'One page was made crawlable.' : ( $n . ' pages were made crawlable.' );
		}
		if ( strpos( $low, 'sitemap' ) !== false ) {
			return 'The sitemap was rebuilt.';
		}
		if ( strpos( $low, 'image' ) !== false ) {
			return $n === 1 ? 'One broken image was swapped for a working file.' : ( $n . ' broken images were swapped for working files.' );
		}
		if ( strpos( $low, 'link' ) !== false ) {
			return $n === 1 ? 'One broken link was swapped for a working page.' : ( $n . ' broken links were swapped for working pages.' );
		}
		return $n === 1 ? ( 'One ' . $label . ' was fixed.' ) : ( $n . ' ' . $label . ' were fixed.' );
	}

	private static function stat_cell( string $value, string $label, string $color ): string {
		return '<td width="33%" style="font-family:Arial,Helvetica,sans-serif;padding:0 8px 0 0;">'
			. '<div style="font-size:28px;line-height:32px;color:' . $color . ';">' . esc_html( $value ) . '</div>'
			. '<div style="font-size:16px;line-height:20px;color:#9aa0a6;padding-top:2px;">' . esc_html( $label ) . '</div>'
			. '</td>';
	}

	/**
	 * Full action text for the spreadsheet.
	 *
	 * @param array<string,mixed> $row
	 * @param 'fixed'|'listed'|'failed' $mode
	 */
	private static function action_taken( array $row, string $mode ): string {
		$issue = strtolower( trim( (string) ( $row['issueName'] ?? '' ) ) );
		$kind  = strtolower( trim( (string) ( $row['kind'] ?? '' ) ) );
		if ( $mode === 'failed' ) {
			return 'Did not land. Needs another pass on the site.';
		}
		if ( $mode === 'listed' ) {
			return 'Logged only. Nothing was changed on the site.';
		}
		if ( $kind === 'title' || strpos( $issue, 'title' ) !== false ) {
			return 'Wrote a new title';
		}
		if ( $kind === 'meta_description' || strpos( $issue, 'meta' ) !== false ) {
			return 'Wrote a new meta description';
		}
		if ( strpos( $issue, 'crawl' ) !== false ) {
			return 'Made the page crawlable';
		}
		if ( strpos( $issue, 'sitemap' ) !== false ) {
			return 'Rebuilt the sitemap';
		}
		if ( $kind === 'broken_internal_image' || strpos( $issue, 'image' ) !== false ) {
			return trim( (string) ( $row['toUrl'] ?? '' ) ) !== '' ? 'Swapped the broken image' : 'Removed the broken image';
		}
		if ( $kind === 'broken_internal_link' || strpos( $issue, 'link' ) !== false ) {
			return trim( (string) ( $row['toUrl'] ?? '' ) ) !== '' ? 'Swapped the broken link' : 'Removed the broken link';
		}
		if ( strpos( $issue, 'slow' ) !== false || $kind === 'slow_load' ) {
			return 'Trimmed what was slowing this page down.';
		}
		return 'Fixed this on the site.';
	}

	/**
	 * Turn a replacement URL into the page or file name.
	 */
	private static function asset_name( string $value ): string {
		$value = trim( $value );
		if ( $value === '' || stripos( $value, 'Neo MCP' ) !== false ) {
			return '';
		}
		if ( preg_match( '#^https?://#i', $value ) ) {
			$path = (string) parse_url( $value, PHP_URL_PATH );
			$slug = trim( basename( trim( $path, '/' ) ) );
			$slug = (string) preg_replace( '/\.(webp|jpe?g|png|gif|svg|pdf)$/i', '', $slug );
			if ( $slug === '' ) {
				return '';
			}
			return ucwords( str_replace( array( '-', '_' ), ' ', $slug ) );
		}
		if ( strpos( $value, '|' ) !== false || strpos( $value, '→' ) !== false ) {
			return '';
		}
		return $value;
	}

	/**
	 * A title a person can read. URLs and tool chatter stay out of the sentence.
	 */
	private static function readable_title( string $value ): string {
		$value = trim( preg_replace( '/\s+/', ' ', $value ) ?? trim( $value ) );
		if ( $value === '' ) {
			return '';
		}
		if ( preg_match( '#https?://#i', $value ) ) {
			return '';
		}
		if ( strpos( $value, '|' ) !== false || strpos( $value, '→' ) !== false || stripos( $value, 'Neo MCP' ) !== false ) {
			return '';
		}
		return $value;
	}

	/**
	 * The checkable outcome: new title, new meta, or the replacement asset.
	 *
	 * @param array<string,mixed> $row
	 */
	private static function result_text( array $row ): string {
		$issue = strtolower( trim( (string) ( $row['issueName'] ?? '' ) ) );
		$kind  = strtolower( trim( (string) ( $row['kind'] ?? '' ) ) );
		$apply = array();
		if ( isset( $row['neoMcp']['response']['neoMcpApply'] ) && is_array( $row['neoMcp']['response']['neoMcpApply'] ) ) {
			$apply = $row['neoMcp']['response']['neoMcpApply'];
		}
		$from_mcp = trim( (string) ( $apply['result'] ?? $apply['value'] ?? '' ) );

		if ( $kind === 'title' || strpos( $issue, 'title' ) !== false ) {
			$title = self::readable_title( (string) ( $row['value'] ?? '' ) );
			if ( $title === '' ) {
				$title = self::readable_title( self::change_after( $row ) );
			}
			if ( $title === '' ) {
				$title = self::readable_title( $from_mcp );
			}
			return $title;
		}
		if ( $kind === 'meta_description' || strpos( $issue, 'meta' ) !== false ) {
			if ( $from_mcp !== '' && ! preg_match( '#https?://#i', $from_mcp ) ) {
				return $from_mcp;
			}
			return self::readable_title( (string) ( $row['value'] ?? '' ) );
		}
		if ( $kind === 'broken_internal_image' || $kind === 'broken_internal_link' || strpos( $issue, 'image' ) !== false || strpos( $issue, 'link' ) !== false ) {
			$to = trim( (string) ( $row['toUrl'] ?? '' ) );
			if ( $to !== '' ) {
				return $to;
			}
			return 'Removed';
		}
		if ( strpos( $issue, 'sitemap' ) !== false ) {
			return 'Sitemap rebuilt';
		}
		if ( strpos( $issue, 'crawl' ) !== false ) {
			return 'Page set to indexable';
		}
		if ( $from_mcp !== '' && stripos( $from_mcp, 'Neo MCP' ) === false ) {
			return $from_mcp;
		}
		return '';
	}

	/**
	 * @param array<int,array<string,mixed>> $rows
	 */
	private static function csv( array $rows ): string {
		$lines   = array();
		$lines[] = 'site,page_url,kind,issue_name,status,before,after,action_taken,result';
		foreach ( $rows as $row ) {
			$status = (string) ( $row['status'] ?? '' );
			if ( $status === '' ) {
				if ( trim( (string) ( $row['error'] ?? '' ) ) !== '' ) {
					$status = 'failed';
				} elseif ( ! empty( $row['handshake']['bothConfirmed'] ) || ( isset( $row['neoMcp'] ) && ! empty( $row['neoMcp']['fixed'] ) ) ) {
					$status = 'fixed';
				} elseif ( array_key_exists( 'apply', $row ) && empty( $row['apply'] ) ) {
					$status = 'listed';
				} else {
					$status = 'fixed';
				}
			}
			$mode = $status === 'failed' || $status === 'listed' ? $status : 'fixed';
			$lines[] = implode(
				',',
				array(
					self::csv_cell( (string) ( $row['siteName'] ?? '' ) ),
					self::csv_cell( (string) ( $row['pageUrl'] ?? '' ) ),
					self::csv_cell( (string) ( $row['kind'] ?? '' ) ),
					self::csv_cell( (string) ( $row['issueName'] ?? '' ) ),
					self::csv_cell( $status ),
					self::csv_cell( self::change_before( $row ) ),
					self::csv_cell( self::change_after( $row ) ),
					self::csv_cell( self::action_taken( $row, $mode ) ),
					self::csv_cell( self::result_text( $row ) ),
				)
			);
		}
		return implode( "\n", $lines ) . "\n";
	}

	private static function csv_cell( string $value ): string {
		return '"' . str_replace( '"', '""', $value ) . '"';
	}
}
