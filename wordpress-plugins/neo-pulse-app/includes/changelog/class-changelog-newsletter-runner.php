<?php
/**
 * Server-side changelog generate + AgentMail newsletter send.
 *
 * @package Neo_Pulse_App
 */

defined( 'ABSPATH' ) || exit;

class Neo_Pulse_App_Changelog_Newsletter_Runner {

	const REPO           = 'neodigitalca/neo-pulse';
	const WRITER_MODEL   = 'deepseek/deepseek-v4.1-flash';
	const INTRO_MODEL    = 'deepseek/deepseek-v4.1-flash';
	const WEB_MODEL      = 'openai/gpt-4o:online';
	const FULL_URL       = 'https://neo-pulse-static.onrender.com/changelog';
	const ACCENT         = '#84bd00';
	const BG             = '#02050a';
	const PANEL          = '#0c0f14';
	const WELL           = '#12161e';
	const TEXT           = '#ffffff';
	const MAX_WIDTH      = 720;
	const INBOX_USERNAME = 'neo-pulse-changelog';

	/**
	 * @param array<string,mixed> $opts force => bool
	 * @return array<string,mixed>
	 */
	public static function run( array $opts = array() ): array {
		$force = ! empty( $opts['force'] );
		$state = Neo_Pulse_App_Changelog_Route_Handlers::read_state();
		$sched = Neo_Pulse_App_Changelog_Schedule::normalize( $state['schedule'] ?? null );

		if ( ! $force && ! Neo_Pulse_App_Changelog_Schedule::is_due_now( $sched ) ) {
			return array(
				'ok'    => false,
				'error' => 'Schedule is not due now',
				'skip'  => true,
			);
		}

		$run_key = Neo_Pulse_App_Changelog_Schedule::run_key( $sched );
		try {
			$commits = self::fetch_github_commits( $state );
			if ( count( $commits ) === 0 ) {
				throw new RuntimeException( 'No new commits since last covered entry. Refusing empty send.' );
			}
			self::ingest_commits( $commits );
			$entry = self::write_and_save_entry( $commits, $state );
			$pack  = self::newsletter_pack( $entry, $commits );
			$email = self::build_and_send_newsletter( $pack, (string) $sched['to'] );
			self::mark_run( $run_key, true, '' );
			return array(
				'ok'        => true,
				'entry'     => $entry,
				'messageId' => $email['messageId'] ?? '',
				'to'        => $sched['to'],
			);
		} catch ( Throwable $e ) {
			self::mark_run( $run_key, false, $e->getMessage() );
			return array(
				'ok'    => false,
				'error' => $e->getMessage(),
			);
		}
	}

	/**
	 * @param array<string,mixed> $state
	 * @return array<int,array<string,mixed>>
	 */
	private static function fetch_github_commits( array $state ): array {
		$covered = null;
		foreach ( $state['entries'] as $entry ) {
			$to = isset( $entry['rangeTo'] ) && is_string( $entry['rangeTo'] ) ? $entry['rangeTo'] : '';
			if ( $to !== '' && ( $covered === null || strcmp( $to, $covered ) > 0 ) ) {
				$covered = $to;
			}
		}
		$since = $covered
			? gmdate( 'c', strtotime( $covered . 'T00:00:00Z' ) + 86400 )
			: gmdate( 'c', time() - 14 * 86400 );

		$token = self::github_token();
		$url   = 'https://api.github.com/repos/' . self::REPO . '/commits?since=' . rawurlencode( $since ) . '&per_page=100';
		$args  = array(
			'timeout' => 45,
			'headers' => array(
				'Accept'     => 'application/vnd.github+json',
				'User-Agent' => 'NeoPulseChangelogRunner',
			),
		);
		if ( $token !== '' ) {
			$args['headers']['Authorization'] = 'Bearer ' . $token;
		}
		$res = wp_remote_get( $url, $args );
		if ( is_wp_error( $res ) ) {
			throw new RuntimeException( 'GitHub commits request failed: ' . $res->get_error_message() );
		}
		$code = (int) wp_remote_retrieve_response_code( $res );
		$body = (string) wp_remote_retrieve_body( $res );
		if ( $code < 200 || $code >= 300 ) {
			throw new RuntimeException( 'GitHub commits HTTP ' . $code );
		}
		$data = json_decode( $body, true );
		if ( ! is_array( $data ) ) {
			throw new RuntimeException( 'GitHub commits JSON invalid' );
		}
		$out = array();
		foreach ( $data as $row ) {
			if ( ! is_array( $row ) ) {
				continue;
			}
			$hash = isset( $row['sha'] ) ? substr( (string) $row['sha'], 0, 40 ) : '';
			$msg  = isset( $row['commit']['message'] ) ? (string) $row['commit']['message'] : '';
			$date = isset( $row['commit']['author']['date'] ) ? substr( (string) $row['commit']['author']['date'], 0, 10 ) : '';
			if ( $hash === '' || $msg === '' || $date === '' ) {
				continue;
			}
			$parts   = preg_split( "/\r?\n/", $msg, 2 );
			$subject = trim( (string) ( $parts[0] ?? '' ) );
			$body_t  = isset( $parts[1] ) ? trim( (string) $parts[1] ) : '';
			if ( $subject === '' ) {
				continue;
			}
			$out[] = array(
				'hash'    => $hash,
				'date'    => $date,
				'subject' => substr( $subject, 0, 300 ),
				'body'    => substr( $body_t, 0, 2000 ),
				'files'   => array(),
			);
		}
		usort(
			$out,
			static function ( $a, $b ) {
				return strcmp( (string) $a['date'], (string) $b['date'] );
			}
		);
		return array_slice( $out, 0, 490 );
	}

	private static function github_token(): string {
		foreach ( array( 'GITHUB_TOKEN', 'GH_TOKEN', 'NEO_GITHUB_TOKEN' ) as $key ) {
			$val = getenv( $key );
			if ( is_string( $val ) && trim( $val ) !== '' ) {
				return trim( $val );
			}
		}
		return '';
	}

	/**
	 * @param array<int,array<string,mixed>> $commits
	 */
	private static function ingest_commits( array $commits ): void {
		$by_hash = array();
		foreach ( $commits as $c ) {
			$by_hash[ (string) $c['hash'] ] = $c;
		}
		Neo_Pulse_App_Changelog_Route_Handlers::mutate_state(
			static function ( array &$state ) use ( $by_hash ): void {
				$existing = array();
				foreach ( $state['commits'] as $commit ) {
					$existing[ (string) $commit['hash'] ] = $commit;
				}
				foreach ( $by_hash as $hash => $commit ) {
					$existing[ $hash ] = $commit;
				}
				$state['commits'] = array_values( $existing );
			}
		);
	}

	/**
	 * @param array<int,array<string,mixed>> $commits
	 * @param array<string,mixed>            $state
	 * @return array<string,mixed>
	 */
	private static function write_and_save_entry( array $commits, array $state ): array {
		$covered = null;
		foreach ( $state['entries'] as $entry ) {
			$d = isset( $entry['date'] ) ? (string) $entry['date'] : '';
			if ( $d !== '' && ( $covered === null || strcmp( $d, $covered ) > 0 ) ) {
				$covered = $d;
			}
		}
		$lines = array();
		foreach ( $commits as $c ) {
			$files = ! empty( $c['files'] ) ? ' [files: ' . implode( ', ', array_slice( (array) $c['files'], 0, 8 ) ) . ']' : '';
			$lines[] = '- ' . $c['date'] . ' ' . $c['subject'] . $files;
		}
		$from = (string) $commits[0]['date'];
		$to   = (string) $commits[ count( $commits ) - 1 ]['date'];
		$user = "Covered period: {$from} to {$to} (" . count( $commits ) . " commits). Previous archive coverage ended: " . ( $covered ?? 'never (first entry)' ) . ".\n\nCommit pack (oldest first):\n" . implode( "\n", $lines ) . "\n\nWrite the changelog entry JSON now.";

		$system = 'You write one changelog entry for the Neo Pulse web app, for the agency owner. Ground only in the commit pack. No intro paragraph. Include highlights (5-8) and sections New/Improved/Fixed/Behind the scenes when supported. Never use the em dash. Output JSON only: {"title":"...","highlights":["..."],"sections":[{"heading":"New","items":["..."]}]}';

		$raw = self::openrouter_json( self::WRITER_MODEL, $system, $user, 0.3, 8192 );
		$title = isset( $raw['title'] ) ? trim( (string) $raw['title'] ) : '';
		if ( $title === '' ) {
			throw new RuntimeException( 'Changelog writer returned empty title' );
		}
		$entry_date = gmdate( 'Y-m-d' );
		$entry      = array(
			'id'          => $entry_date . '-' . wp_generate_uuid4(),
			'date'        => $entry_date,
			'rangeFrom'   => $from,
			'rangeTo'     => $to,
			'commitCount' => count( $commits ),
			'title'       => substr( $title, 0, 300 ),
			'highlights'  => self::string_list( $raw['highlights'] ?? array() ),
			'sections'    => self::sections( $raw['sections'] ?? array() ),
			'createdAt'   => gmdate( 'c' ),
		);
		Neo_Pulse_App_Changelog_Route_Handlers::mutate_state(
			static function ( array &$state ) use ( $entry ): void {
				$kept = array();
				foreach ( $state['entries'] as $existing ) {
					if ( (string) ( $existing['id'] ?? '' ) !== $entry['id'] ) {
						$kept[] = $existing;
					}
				}
				$kept[]           = $entry;
				$state['entries'] = $kept;
			}
		);
		return $entry;
	}

	/**
	 * @param array<string,mixed>            $entry
	 * @param array<int,array<string,mixed>> $commits
	 * @return array<string,mixed>
	 */
	private static function newsletter_pack( array $entry, array $commits ): array {
		$subjects = array();
		foreach ( $commits as $c ) {
			$subjects[] = (string) $c['subject'];
		}
		$highlights = self::string_list( $entry['highlights'] ?? array() );
		$pack_lines = array();
		foreach ( $highlights as $h ) {
			$pack_lines[] = '- ' . $h;
		}
		$pack = "Neo Pulse update: {$entry['title']}\nDate: {$entry['date']}\nCommits: {$entry['commitCount']}\n\nHighlights:\n" . implode( "\n", $pack_lines );

		$intro_system = 'You write the Neo Pulse product newsletter in a Morning Brew voice. Write from PULSE point of view. Never client-owned framing. Plain English for a CEO who does not code. Banned jargon: commit, module, refactor, schema, API, pipeline, CI. Hook max 8 words and 48 chars. Never em dash. JSON only: {"hook":"...","body":"...","highlights":["..."]}';
		$intro        = self::openrouter_json( self::INTRO_MODEL, $intro_system, $pack . "\n\nWrite hook, body, highlights. Pulse is the actor.", 0.45, 3072 );

		$pulse_seeds = array(
			array(
				'title' => "Don't wait for the SEO report to tell clients something's wrong",
				'url'   => 'https://searchengineland.com/seo-report-client-wrong-500715',
				'date'  => 'Nov 5, 2026',
			),
			array(
				'title' => 'Inside Google Maps: 72 ranking signals and the architecture behind local search',
				'url'   => 'https://searchengineland.com/inside-google-maps-72-ranking-signals-and-the-architecture-behind-local-search-486906',
				'date'  => 'Oct 15, 2026',
			),
			array(
				'title' => 'Google Search Console performance report data bug Nov 9 -11',
				'url'   => 'https://searchengineland.com/google-search-console-performance-report-data-bug-nov-9-11-501899',
				'date'  => 'Nov 12, 2026',
			),
		);
		$industry_seeds = array(
			array(
				'title' => 'NVIDIA Announces CEO Transition',
				'url'   => 'https://nvidianews.nvidia.com/news/nvidia-announces-ceo-transition',
				'date'  => 'Nov 12, 2026',
			),
			array(
				'title' => 'Anthropic launches Claude Meetings',
				'url'   => 'https://techcrunch.com/2026/11/10/anthropic-launches-claude-meetings-to-turn-workplace-discussions-into-plans-and-tasks/',
				'date'  => 'Nov 10, 2026',
			),
			array(
				'title' => 'Google November 2026 core update rolling out now',
				'url'   => 'https://searchengineland.com/google-november-2026-core-update-rolling-out-now-501348',
				'date'  => 'Nov 12, 2026',
			),
		);

		$pulse_cards = self::article_cards( $pack, $pulse_seeds, true );
		$ind_cards   = self::article_cards( $pack, $industry_seeds, false );

		return array(
			'title'             => (string) $entry['title'],
			'date'              => (string) $entry['date'],
			'commitCount'       => (int) $entry['commitCount'],
			'hook'              => trim( (string) ( $intro['hook'] ?? '' ) ),
			'body'              => trim( (string) ( $intro['body'] ?? '' ) ),
			'highlights'        => self::string_list( $intro['highlights'] ?? $highlights ),
			'articles'          => $pulse_cards,
			'industryArticles'  => $ind_cards,
			'changelogUrl'      => self::FULL_URL,
		);
	}

	/**
	 * @param array<int,array<string,string>> $seeds
	 * @return array<int,array<string,string>>
	 */
	private static function article_cards( string $pack, array $seeds, bool $pulse ): array {
		$seed_block = '';
		foreach ( $seeds as $i => $s ) {
			$n = $i + 1;
			$seed_block .= "{$n}. {$s['title']} ({$s['date']})\n   {$s['url']}\n";
		}
		$kind   = $pulse ? 'More you know Pulse-relative' : 'Industry News fun';
		$system = "You write punchy {$kind} cards. Use ONLY the required https URLs exactly. Never invent URLs. Never em dash. JSON only: {\"articles\":[{\"title\":\"...\",\"summary\":\"...\",\"date\":\"...\",\"sourceUrl\":\"https://...\",\"whyItHelps\":\"...\"}]}";
		$user   = $pack . "\n\nRequired live stories:\n" . $seed_block . "\nReturn articles JSON. sourceUrl must match exactly.";
		$raw    = self::openrouter_json( self::WEB_MODEL, $system, $user, 0.3, 4096 );
		$arts   = isset( $raw['articles'] ) && is_array( $raw['articles'] ) ? $raw['articles'] : array();
		$out    = array();
		foreach ( $seeds as $i => $seed ) {
			$a = isset( $arts[ $i ] ) && is_array( $arts[ $i ] ) ? $arts[ $i ] : array();
			$out[] = array(
				'title'      => isset( $a['title'] ) ? trim( (string) $a['title'] ) : $seed['title'],
				'summary'    => isset( $a['summary'] ) ? trim( (string) $a['summary'] ) : $seed['title'],
				'date'       => $seed['date'],
				'sourceUrl'  => $seed['url'],
				'whyItHelps' => isset( $a['whyItHelps'] ) ? trim( (string) $a['whyItHelps'] ) : 'Worth knowing this week.',
			);
		}
		return $out;
	}

	/**
	 * @param array<string,mixed> $pack
	 * @return array<string,mixed>
	 */
	private static function build_and_send_newsletter( array $pack, string $to ): array {
		if ( $pack['hook'] === '' || $pack['body'] === '' ) {
			throw new RuntimeException( 'Newsletter intro missing hook/body' );
		}
		$html = self::build_html( $pack );
		$text = self::build_text( $pack );
		$subj = self::build_subject( (string) $pack['hook'] );

		$api_key = class_exists( 'Neo_Pulse_App_Secrets' ) ? Neo_Pulse_App_Secrets::agentmail_api_key() : '';
		if ( $api_key === '' ) {
			throw new RuntimeException( 'AgentMail API key is not configured on the server' );
		}

		$inbox = self::ensure_inbox( $api_key );
		$send  = wp_remote_post(
			'https://api.agentmail.to/v0/inboxes/' . rawurlencode( $inbox ) . '/messages/send',
			array(
				'timeout' => 60,
				'headers' => array(
					'Authorization' => 'Bearer ' . $api_key,
					'Content-Type'  => 'application/json',
					'Accept'        => 'application/json',
				),
				'body'    => wp_json_encode(
					array(
						'to'       => array( $to ),
						'reply_to' => array( 'sean@neodigital.ca' ),
						'subject'  => $subj,
						'text'     => $text,
						'html'     => $html,
						'labels'   => array( 'changelog-newsletter', 'scheduled' ),
					)
				),
			)
		);
		if ( is_wp_error( $send ) ) {
			throw new RuntimeException( 'AgentMail send failed: ' . $send->get_error_message() );
		}
		$code = (int) wp_remote_retrieve_response_code( $send );
		$data = json_decode( (string) wp_remote_retrieve_body( $send ), true );
		if ( $code < 200 || $code >= 300 ) {
			throw new RuntimeException( 'AgentMail send HTTP ' . $code );
		}
		return array(
			'messageId' => is_array( $data ) ? (string) ( $data['message_id'] ?? $data['messageId'] ?? '' ) : '',
		);
	}

	private static function ensure_inbox( string $api_key ): string {
		$res = wp_remote_post(
			'https://api.agentmail.to/v0/inboxes',
			array(
				'timeout' => 30,
				'headers' => array(
					'Authorization' => 'Bearer ' . $api_key,
					'Content-Type'  => 'application/json',
					'Accept'        => 'application/json',
				),
				'body'    => wp_json_encode(
					array(
						'username'     => self::INBOX_USERNAME,
						'display_name' => 'Neo Pulse',
						'client_id'    => 'neo-pulse-changelog',
					)
				),
			)
		);
		if ( is_wp_error( $res ) ) {
			throw new RuntimeException( 'AgentMail inbox failed: ' . $res->get_error_message() );
		}
		$data = json_decode( (string) wp_remote_retrieve_body( $res ), true );
		$id   = is_array( $data ) ? (string) ( $data['inbox_id'] ?? $data['inboxId'] ?? '' ) : '';
		if ( $id === '' ) {
			throw new RuntimeException( 'AgentMail inbox create returned no inbox_id' );
		}
		return $id;
	}

	/**
	 * @return array<string,mixed>
	 */
	private static function openrouter_json( string $model, string $system, string $user, float $temp, int $max_tokens ): array {
		$api_key = class_exists( 'Neo_Pulse_App_Secrets' ) ? Neo_Pulse_App_Secrets::openrouter_api_key() : '';
		if ( $api_key === '' ) {
			throw new RuntimeException( 'OpenRouter API key is not configured on the server' );
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
				'timeout' => 120,
				'headers' => $headers,
				'body'    => wp_json_encode(
					array(
						'model'           => $model,
						'temperature'     => $temp,
						'max_tokens'      => $max_tokens,
						'response_format' => array( 'type' => 'json_object' ),
						'messages'        => array(
							array( 'role' => 'system', 'content' => $system ),
							array( 'role' => 'user', 'content' => $user ),
						),
					)
				),
			)
		);
		if ( is_wp_error( $res ) ) {
			throw new RuntimeException( 'OpenRouter failed: ' . $res->get_error_message() );
		}
		$code = (int) wp_remote_retrieve_response_code( $res );
		$json = json_decode( (string) wp_remote_retrieve_body( $res ), true );
		if ( $code < 200 || $code >= 300 || ! is_array( $json ) ) {
			throw new RuntimeException( 'OpenRouter HTTP ' . $code );
		}
		$content = trim( (string) ( $json['choices'][0]['message']['content'] ?? '' ) );
		$content = preg_replace( '/^```json\s*/i', '', $content );
		$content = preg_replace( '/```$/', '', (string) $content );
		$data    = json_decode( trim( (string) $content ), true );
		if ( ! is_array( $data ) ) {
			throw new RuntimeException( 'OpenRouter returned invalid JSON' );
		}
		return $data;
	}

	private static function mark_run( string $run_key, bool $ok, string $error ): void {
		Neo_Pulse_App_Changelog_Route_Handlers::mutate_state(
			static function ( array &$state ) use ( $run_key, $ok, $error ): void {
				$sched                 = Neo_Pulse_App_Changelog_Schedule::normalize( $state['schedule'] ?? null );
				$sched['lastRunKey']   = $run_key;
				$sched['lastRunAt']    = gmdate( 'c' );
				$sched['lastRunOk']    = $ok;
				$sched['lastRunError'] = $ok ? '' : substr( $error, 0, 500 );
				$state['schedule']     = $sched;
			}
		);
	}

	/**
	 * @param mixed $value
	 * @return string[]
	 */
	private static function string_list( $value ): array {
		$out = array();
		if ( is_array( $value ) ) {
			foreach ( $value as $item ) {
				if ( is_string( $item ) && trim( $item ) !== '' ) {
					$out[] = trim( $item );
				}
			}
		}
		return $out;
	}

	/**
	 * @param mixed $value
	 * @return array<int,array{heading:string,items:string[]}>
	 */
	private static function sections( $value ): array {
		$out = array();
		if ( ! is_array( $value ) ) {
			return $out;
		}
		foreach ( $value as $section ) {
			if ( ! is_array( $section ) ) {
				continue;
			}
			$heading = isset( $section['heading'] ) ? trim( (string) $section['heading'] ) : '';
			$items   = self::string_list( $section['items'] ?? array() );
			if ( $heading !== '' && $items !== array() ) {
				$out[] = array(
					'heading' => $heading,
					'items'   => $items,
				);
			}
		}
		return $out;
	}

	private static function escape( string $value ): string {
		return htmlspecialchars( $value, ENT_QUOTES | ENT_HTML5, 'UTF-8' );
	}

	private static function build_subject( string $hook ): string {
		$prefix = 'Neo Pulse: ';
		$full   = $prefix . $hook;
		if ( strlen( $full ) <= 60 ) {
			return $full;
		}
		$budget = 60 - strlen( $prefix );
		$cut    = substr( $hook, 0, $budget );
		$space  = strrpos( $cut, ' ' );
		$safe   = $space > 12 ? substr( $cut, 0, $space ) : $cut;
		return $prefix . rtrim( $safe, '.,;:' );
	}

	/**
	 * @param array<string,mixed> $pack
	 */
	private static function framed( string $label, string $well, string $inner, int $top = 16 ): string {
		$label_row = $label !== ''
			? '<tr><td style="padding:0 0 12px 0;font-family:Arial,Helvetica,sans-serif;font-size:16px;font-weight:700;color:' . self::TEXT . ';letter-spacing:0.08em;text-transform:uppercase;">' . self::escape( $label ) . '</td></tr>'
			: '';
		return '<tr><td style="padding:' . $top . 'px 0 0 0;"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;background-color:' . $well . ';"><tr><td width="4" style="width:4px;background-color:' . self::ACCENT . ';font-size:0;line-height:0;">&nbsp;</td><td style="padding:22px 24px;"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">' . $label_row . $inner . '</table></td></tr></table></td></tr>';
	}

	/**
	 * @param array<string,mixed> $pack
	 */
	private static function build_html( array $pack ): string {
		$w     = self::MAX_WIDTH;
		$date  = self::escape( (string) $pack['date'] );
		$hook  = self::escape( (string) $pack['hook'] );
		$body  = self::escape( (string) $pack['body'] );
		$url   = self::escape( (string) $pack['changelogUrl'] );
		$count = (int) $pack['commitCount'];

		$lis = '';
		foreach ( (array) $pack['highlights'] as $h ) {
			$lis .= '<li style="margin:0 0 12px 0;font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:1.5;color:' . self::TEXT . ';">' . self::escape( (string) $h ) . '</li>';
		}
		$highlights = '<tr><td style="padding:0;"><ul style="margin:0;padding:0 0 0 20px;">' . $lis . '</ul></td></tr>';

		$summary = '<tr><td style="padding:0 0 12px 0;font-family:Arial,Helvetica,sans-serif;font-size:22px;font-weight:700;line-height:1.35;color:' . self::TEXT . ';">' . $hook . '</td></tr>'
			. '<tr><td style="padding:0 0 16px 0;font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:1.65;color:' . self::TEXT . ';">' . $body . '</td></tr>'
			. '<tr><td style="padding:0;font-family:Arial,Helvetica,sans-serif;font-size:16px;"><a href="' . $url . '" style="color:' . self::ACCENT . ';text-decoration:underline;font-weight:700;">Full changelog →</a></td></tr>';

		$more_exp = 'Why these reads: three articles that help explain what this Pulse update is really about, in plain English, so the ship makes sense beyond the product screen.';
		$ind_exp  = 'Fun stories from the wider industry this week. Skim for coffee, not homework.';

		return '<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>' . self::escape( self::build_subject( (string) $pack['hook'] ) ) . '</title></head><body style="margin:0;padding:0;background-color:' . self::BG . ';width:100%;"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;background-color:' . self::BG . ';"><tr><td align="center" style="padding:0;width:100%;"><table role="presentation" width="' . $w . '" cellspacing="0" cellpadding="0" border="0" style="width:100%;max-width:' . $w . 'px;background-color:' . self::BG . ';"><tr><td style="padding:28px 20px 20px 20px;"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;background-color:' . self::WELL . ';"><tr><td width="4" style="width:4px;background-color:' . self::ACCENT . ';">&nbsp;</td><td style="padding:22px 24px;"><span style="font-family:Arial,Helvetica,sans-serif;font-size:26px;font-weight:700;"><span style="color:' . self::ACCENT . ';">neo</span><span style="color:#ffffff;">pulse</span></span><div style="font-family:Arial,Helvetica,sans-serif;font-size:16px;color:' . self::TEXT . ';margin-top:8px;">' . $date . ' · ' . $count . ' commits</div></td></tr></table></td></tr><tr><td style="padding:0 20px 28px 20px;"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">'
			. self::framed( '', self::PANEL, $summary, 0 )
			. self::framed( 'Highlights', self::WELL, $highlights, 16 )
			. self::framed( 'More you know', self::PANEL, '<tr><td style="padding:0 0 16px 0;font-family:Arial,Helvetica,sans-serif;font-size:16px;color:' . self::TEXT . ';">' . self::escape( $more_exp ) . '</td></tr>' . self::articles_html( (array) $pack['articles'] ), 16 )
			. self::framed( 'Industry News', self::WELL, '<tr><td style="padding:0 0 16px 0;font-family:Arial,Helvetica,sans-serif;font-size:16px;color:' . self::TEXT . ';">' . self::escape( $ind_exp ) . '</td></tr>' . self::articles_html( (array) $pack['industryArticles'] ), 16 )
			. '<tr><td style="padding:24px 4px 8px 4px;font-family:Arial,Helvetica,sans-serif;font-size:16px;color:' . self::TEXT . ';">Sent by Neo Pulse. Reply to this email to reach sean@neodigital.ca.</td></tr></table></td></tr></table></td></tr></table></body></html>';
	}

	/**
	 * @param array<int,mixed> $articles
	 */
	private static function articles_html( array $articles ): string {
		$html  = '';
		$count = count( $articles );
		foreach ( $articles as $i => $a ) {
			if ( ! is_array( $a ) ) {
				continue;
			}
			$bottom = ( $i === $count - 1 ) ? '0' : '20';
			$html  .= '<tr><td style="padding:0 0 ' . $bottom . 'px 0;"><div style="font-family:Arial,Helvetica,sans-serif;font-size:16px;color:' . self::TEXT . ';">' . self::escape( (string) ( $a['date'] ?? '' ) ) . '</div><div style="font-family:Arial,Helvetica,sans-serif;font-size:18px;font-weight:700;color:' . self::TEXT . ';margin:4px 0 8px 0;">' . self::escape( (string) ( $a['title'] ?? '' ) ) . '</div><div style="font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:1.55;color:' . self::TEXT . ';margin:0 0 6px 0;">' . self::escape( (string) ( $a['summary'] ?? '' ) ) . '</div><div style="margin:8px 0 6px 0;font-family:Arial,Helvetica,sans-serif;font-size:16px;color:' . self::ACCENT . ';">' . self::escape( (string) ( $a['whyItHelps'] ?? '' ) ) . '</div><a href="' . self::escape( (string) ( $a['sourceUrl'] ?? '' ) ) . '" style="font-family:Arial,Helvetica,sans-serif;font-size:16px;color:' . self::ACCENT . ';text-decoration:underline;">Read →</a></td></tr>';
		}
		return $html;
	}

	/**
	 * @param array<string,mixed> $pack
	 */
	private static function build_text( array $pack ): string {
		$lines = array(
			'neopulse',
			$pack['date'] . ' · ' . $pack['commitCount'] . ' commits',
			'',
			$pack['hook'],
			'',
			$pack['body'],
			'',
			'Full changelog → ' . $pack['changelogUrl'],
			'',
			'HIGHLIGHTS',
		);
		foreach ( (array) $pack['highlights'] as $h ) {
			$lines[] = '- ' . $h;
		}
		$lines[] = '';
		$lines[] = 'MORE YOU KNOW';
		foreach ( (array) $pack['articles'] as $a ) {
			if ( ! is_array( $a ) ) {
				continue;
			}
			$lines[] = '- ' . $a['title'] . ' (' . $a['date'] . ')';
			$lines[] = '  ' . $a['summary'];
			$lines[] = '  ' . $a['whyItHelps'];
			$lines[] = '  ' . $a['sourceUrl'];
		}
		$lines[] = '';
		$lines[] = 'INDUSTRY NEWS';
		foreach ( (array) $pack['industryArticles'] as $a ) {
			if ( ! is_array( $a ) ) {
				continue;
			}
			$lines[] = '- ' . $a['title'] . ' (' . $a['date'] . ')';
			$lines[] = '  ' . $a['summary'];
			$lines[] = '  ' . $a['whyItHelps'];
			$lines[] = '  ' . $a['sourceUrl'];
		}
		$lines[] = '';
		$lines[] = 'Sent by Neo Pulse. Reply to reach sean@neodigital.ca.';
		return implode( "\n", $lines );
	}
}
