<?php
/**
 * OpenRouter online search for official Google SEO updates, append dated archive entry, rewrite livePrompt.
 *
 * @package Neo_Pulse_App
 */

defined( 'ABSPATH' ) || exit;

class Neo_Pulse_App_Google_Seo_Updates_Runner {

	const TZ = 'America/Edmonton';

	/** Same online family as Fact Checker: live web search, no DataForSEO. */
	const WEB_MODEL = 'openai/gpt-6-sol:online';

	/**
	 * @param array{force?:bool,fromCron?:bool} $args
	 * @return array<string,mixed>|WP_Error
	 */
	public static function run( array $args = array() ) {
		$force     = ! empty( $args['force'] );
		$from_cron = ! empty( $args['fromCron'] );
		$state     = self::load_state();

		if ( $from_cron && ! $force ) {
			$due = self::is_monday_due( $state );
			if ( ! $due['due'] ) {
				return array(
					'ok'      => true,
					'skipped' => true,
					'reason'  => $due['reason'],
					'state'   => self::public_state( $state ),
				);
			}
			$run_key = $due['runKey'];
		} else {
			$run_key = self::manual_run_key();
		}

		try {
			$known   = self::known_source_urls( $state['entries'] );
			$extract = self::extract_online( $state, $known );
			$entry   = self::build_entry( $extract, $extract['sourcesChecked'] );
			$state['entries'] = array_merge( array( $entry ), $state['entries'] );
			if ( count( $entry['items'] ) > 0 ) {
				$state['livePrompt'] = self::rewrite_live_prompt( $state, $entry );
			}
			$state['updatedAt']    = gmdate( 'c' );
			$state['lastRunKey']   = $run_key;
			$state['lastRunError'] = '';
			self::save_state( $state );
			return array(
				'ok'    => true,
				'entry' => $entry,
				'state' => self::public_state( $state ),
			);
		} catch ( Exception $e ) {
			$state['lastRunError'] = substr( $e->getMessage(), 0, 500 );
			if ( $from_cron ) {
				$state['lastRunKey'] = $run_key;
			}
			self::save_state( $state );
			return new WP_Error(
				'neo-pulse_google_seo_run',
				$e->getMessage(),
				array( 'status' => 500 )
			);
		}
	}

	/**
	 * @return array<string,mixed>
	 */
	public static function load_state(): array {
		$bundle = Neo_Pulse_App_Skills_Library_Store::get_skill(
			Neo_Pulse_App_Skills_Library_Store::SKILL_GOOGLE_SEO_UPDATES
		);
		$defaults = Neo_Pulse_App_Skills_Library_Store::default_google_seo_updates_prompts();
		$prompts  = is_wp_error( $bundle ) ? $defaults : $bundle['prompts.json'];
		$archive  = Neo_Pulse_App_Skills_Library_Store::read_google_seo_archive();
		return self::normalize_state( array_merge( $prompts, $archive ) );
	}

	/**
	 * @param array<string,mixed> $state
	 */
	public static function save_state( array $state ): void {
		$state = self::normalize_state( $state );
		$result = Neo_Pulse_App_Skills_Library_Store::write_google_seo_archive(
			array(
				'entries'      => $state['entries'],
				'livePrompt'   => $state['livePrompt'],
				'updatedAt'    => $state['updatedAt'],
				'lastRunKey'   => $state['lastRunKey'],
				'lastRunError' => $state['lastRunError'],
			)
		);
		if ( is_wp_error( $result ) ) {
			throw new RuntimeException( $result->get_error_message() );
		}
	}

	/**
	 * @param array<string,mixed> $state
	 * @return array<string,mixed>
	 */
	public static function public_state( array $state ): array {
		$state = self::normalize_state( $state );
		return array(
			'entries'      => $state['entries'],
			'livePrompt'   => $state['livePrompt'],
			'updatedAt'    => $state['updatedAt'],
			'lastRunKey'   => $state['lastRunKey'],
			'lastRunError' => $state['lastRunError'],
		);
	}

	/**
	 * @param mixed $raw
	 * @return array<string,mixed>
	 */
	public static function normalize_state( $raw ): array {
		$defaults = Neo_Pulse_App_Skills_Library_Store::default_google_seo_updates_prompts();
		if ( ! is_array( $raw ) ) {
			return $defaults;
		}
		$entries = array();
		if ( isset( $raw['entries'] ) && is_array( $raw['entries'] ) ) {
			foreach ( $raw['entries'] as $entry ) {
				$normalized = self::normalize_entry( $entry );
				if ( $normalized !== null ) {
					$entries[] = $normalized;
				}
			}
		}
		$order = 0;
		foreach ( $entries as &$entry_row ) {
			$entry_row['_order'] = $order;
			$order++;
		}
		unset( $entry_row );
		usort(
			$entries,
			static function ( $a, $b ) {
				$by_date = strcmp( (string) ( $b['date'] ?? '' ), (string) ( $a['date'] ?? '' ) );
				if ( $by_date !== 0 ) {
					return $by_date;
				}
				return (int) ( $a['_order'] ?? 0 ) <=> (int) ( $b['_order'] ?? 0 );
			}
		);
		foreach ( $entries as &$entry_row ) {
			unset( $entry_row['_order'] );
		}
		unset( $entry_row );
		$rewrite = is_array( $raw['rewrite'] ?? null ) ? $raw['rewrite'] : $defaults['rewrite'];
		$topics  = isset( $raw['topics'] ) && is_array( $raw['topics'] ) && count( $raw['topics'] ) >= 5
			? $raw['topics']
			: $defaults['topics'];
		return array(
			'entries'      => $entries,
			'livePrompt'   => isset( $raw['livePrompt'] ) && is_string( $raw['livePrompt'] ) ? $raw['livePrompt'] : '',
			'updatedAt'    => isset( $raw['updatedAt'] ) ? substr( trim( (string) $raw['updatedAt'] ), 0, 64 ) : '',
			'lastRunKey'   => isset( $raw['lastRunKey'] ) ? substr( trim( (string) $raw['lastRunKey'] ), 0, 64 ) : '',
			'lastRunError' => isset( $raw['lastRunError'] ) ? substr( trim( (string) $raw['lastRunError'] ), 0, 500 ) : '',
			'topics'       => $topics,
			'rewrite'      => array(
				'system'       => isset( $rewrite['system'] ) ? (string) $rewrite['system'] : (string) $defaults['rewrite']['system'],
				'userTemplate' => isset( $rewrite['userTemplate'] ) ? (string) $rewrite['userTemplate'] : (string) $defaults['rewrite']['userTemplate'],
			),
		);
	}

	/**
	 * @param array<string,mixed> $state
	 * @return array{due:bool,runKey:string,reason:string}
	 */
	public static function is_monday_due( array $state ): array {
		$tz  = new DateTimeZone( self::TZ );
		$now = new DateTime( 'now', $tz );
		if ( strtolower( $now->format( 'l' ) ) !== 'monday' ) {
			return array( 'due' => false, 'runKey' => '', 'reason' => 'not Monday' );
		}
		$due_min = 6 * 60;
		$now_min = ( (int) $now->format( 'G' ) * 60 ) + (int) $now->format( 'i' );
		if ( $now_min < $due_min ) {
			return array( 'due' => false, 'runKey' => '', 'reason' => 'before 06:00' );
		}
		$run_key = $now->format( 'o-\WW' ) . ':06:00';
		if ( (string) ( $state['lastRunKey'] ?? '' ) === $run_key ) {
			return array( 'due' => false, 'runKey' => $run_key, 'reason' => 'already ran this Monday' );
		}
		return array( 'due' => true, 'runKey' => $run_key, 'reason' => '' );
	}

	private static function manual_run_key(): string {
		$tz  = new DateTimeZone( self::TZ );
		$now = new DateTime( 'now', $tz );
		return 'manual:' . $now->format( 'Y-m-d\TH:i:s' );
	}

	/**
	 * @param array<int,array<string,mixed>> $entries
	 * @return string[]
	 */
	private static function known_source_urls( array $entries ): array {
		$urls = array();
		foreach ( $entries as $entry ) {
			$items = isset( $entry['items'] ) && is_array( $entry['items'] ) ? $entry['items'] : array();
			foreach ( $items as $item ) {
				$url = isset( $item['sourceUrl'] ) ? trim( (string) $item['sourceUrl'] ) : '';
				if ( $url !== '' ) {
					$urls[ $url ] = true;
				}
			}
		}
		return array_keys( $urls );
	}

	/**
	 * One OpenRouter :online call: search official Google SEO pages and return extract JSON.
	 *
	 * @param array<string,mixed> $state
	 * @param string[]            $known
	 * @return array{title:string,summary:string,items:array<int,array<string,string>>,sourcesChecked:string[]}
	 */
	private static function extract_online( array $state, array $known ): array {
		$tz     = new DateTimeZone( self::TZ );
		$now    = new DateTime( 'now', $tz );
		$year   = $now->format( 'Y' );
		$month  = $now->format( 'F' );
		$topics = isset( $state['topics'] ) && is_array( $state['topics'] ) ? $state['topics'] : array();
		$items  = array();
		$sources_checked = array();
		$summary_lines = array();
		unset( $known );
		foreach ( $topics as $topic ) {
			if ( ! is_array( $topic ) ) {
				continue;
			}
			$system = str_replace( array( '{year}', '{month}' ), array( $year, $month ), (string) ( $topic['system'] ?? '' ) );
			$user   = str_replace( array( '{year}', '{month}' ), array( $year, $month ), (string) ( $topic['userTemplate'] ?? '' ) );
			if ( $system === '' || $user === '' ) {
				continue;
			}
			$data = self::openrouter_json( self::WEB_MODEL, $system, $user, 4096 );
			$raw_items = isset( $data['items'] ) && is_array( $data['items'] ) ? $data['items'] : array();
			foreach ( $raw_items as $item ) {
				if ( ! is_array( $item ) ) {
					continue;
				}
				$source = isset( $item['sourceUrl'] ) ? trim( (string) $item['sourceUrl'] ) : '';
				if ( $source === '' || ! self::is_http_url( $source ) ) {
					continue;
				}
				$item_title = isset( $item['title'] ) ? trim( (string) $item['title'] ) : '';
				$what       = isset( $item['whatChanged'] ) ? trim( (string) $item['whatChanged'] ) : '';
				$rule       = isset( $item['postRule'] ) ? trim( (string) $item['postRule'] ) : '';
				if ( $item_title === '' || $what === '' || $rule === '' ) {
					continue;
				}
				$sources_checked[ $source ] = true;
				$items[] = array(
					'publishedAt' => isset( $item['publishedAt'] ) ? substr( trim( (string) $item['publishedAt'] ), 0, 32 ) : '',
					'sourceUrl'   => $source,
					'title'       => $item_title,
					'whatChanged' => $what,
					'postRule'    => $rule,
				);
				$first = strtok( $what, "\n" );
				if ( is_string( $first ) && trim( $first ) !== '' ) {
					$summary_lines[] = trim( $first );
				}
			}
		}
		if ( $items === array() ) {
			throw new RuntimeException( 'OpenRouter returned no topic sections' );
		}
		$title = $month . ' ' . $year . ' Google SEO bulletin';
		$summary = implode( "\n", $summary_lines );

		return array(
			'title'          => $title,
			'summary'        => $summary,
			'items'          => $items,
			'sourcesChecked' => array_keys( $sources_checked ),
		);
	}

	private static function is_http_url( string $url ): bool {
		$url = trim( $url );
		return strpos( $url, 'https://' ) === 0 || strpos( $url, 'http://' ) === 0;
	}

	/**
	 * @param array{title:string,items:array<int,array<string,string>>} $extract
	 * @param string[]                                                    $sources_checked
	 * @return array<string,mixed>
	 */
	private static function build_entry( array $extract, array $sources_checked ): array {
		$tz   = new DateTimeZone( self::TZ );
		$now  = new DateTime( 'now', $tz );
		$date = $now->format( 'Y-m-d' );
		return array(
			'id'             => $date . '-' . wp_generate_uuid4(),
			'date'           => $date,
			'title'          => $extract['title'],
			'summary'        => isset( $extract['summary'] ) ? (string) $extract['summary'] : '',
			'sourcesChecked' => array_values( $sources_checked ),
			'items'          => $extract['items'],
		);
	}

	/**
	 * @param array<string,mixed> $state
	 * @param array<string,mixed> $newest
	 */
	private static function rewrite_live_prompt( array $state, array $newest ): string {
		$model  = Neo_Pulse_App_Openrouter_Agent_Models::resolve( Neo_Pulse_App_Openrouter_Agent_Models::CATEGORY_RESEARCH );
		$system = (string) $state['rewrite']['system'];
		$user   = str_replace(
			'{entriesJson}',
			(string) wp_json_encode( $state['entries'], JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES ),
			(string) $state['rewrite']['userTemplate']
		);
		$data = self::openrouter_json( $model, $system, $user, 4096 );
		$prompt = isset( $data['livePrompt'] ) && is_string( $data['livePrompt'] )
			? trim( $data['livePrompt'] )
			: '';
		if ( $prompt === '' ) {
			throw new RuntimeException( 'Rewrite returned empty livePrompt' );
		}
		unset( $newest );
		return $prompt;
	}

	/**
	 * @return array<string,mixed>
	 */
	private static function openrouter_json( string $model, string $system, string $user, int $max_tokens ): array {
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

		$payload = array(
			'model'           => $model,
			'max_tokens'      => $max_tokens,
			'response_format' => array( 'type' => 'json_object' ),
			'messages'        => array(
				array( 'role' => 'system', 'content' => $system ),
				array( 'role' => 'user', 'content' => $user ),
			),
		);
		// gpt-6-sol rejects temperature; research models accept it.
		if ( strpos( $model, 'gpt-6-sol' ) === false ) {
			$payload['temperature'] = 0.2;
		} else {
			$payload['reasoning'] = array(
				'effort'  => 'none',
				'exclude' => true,
			);
		}

		$res = wp_remote_post(
			'https://openrouter.ai/api/v1/chat/completions',
			array(
				'timeout' => 180,
				'headers' => $headers,
				'body'    => wp_json_encode( $payload ),
			)
		);
		if ( is_wp_error( $res ) ) {
			throw new RuntimeException( 'OpenRouter failed: ' . $res->get_error_message() );
		}
		$code = (int) wp_remote_retrieve_response_code( $res );
		$json = json_decode( (string) wp_remote_retrieve_body( $res ), true );
		if ( $code < 200 || $code >= 300 || ! is_array( $json ) ) {
			$err = is_array( $json ) && isset( $json['error']['message'] )
				? (string) $json['error']['message']
				: 'OpenRouter HTTP ' . $code;
			throw new RuntimeException( $err );
		}
		$content = trim( (string) ( $json['choices'][0]['message']['content'] ?? '' ) );
		if ( $content === '' ) {
			throw new RuntimeException( 'OpenRouter returned empty content' );
		}
		$content = preg_replace( '/^```json\s*/i', '', $content );
		$content = preg_replace( '/```$/', '', (string) $content );
		$data    = json_decode( trim( (string) $content ), true );
		if ( ! is_array( $data ) ) {
			throw new RuntimeException( 'OpenRouter returned invalid JSON' );
		}
		return $data;
	}

	/**
	 * @param mixed $entry
	 * @return array<string,mixed>|null
	 */
	private static function normalize_entry( $entry ) {
		if ( ! is_array( $entry ) ) {
			return null;
		}
		$id    = isset( $entry['id'] ) ? trim( (string) $entry['id'] ) : '';
		$date  = isset( $entry['date'] ) ? trim( (string) $entry['date'] ) : '';
		$title = isset( $entry['title'] ) ? trim( (string) $entry['title'] ) : '';
		if ( $id === '' || $date === '' || $title === '' ) {
			return null;
		}
		$sources = array();
		if ( isset( $entry['sourcesChecked'] ) && is_array( $entry['sourcesChecked'] ) ) {
			foreach ( $entry['sourcesChecked'] as $url ) {
				if ( is_string( $url ) && trim( $url ) !== '' ) {
					$sources[] = trim( $url );
				}
			}
		}
		$items = array();
		if ( isset( $entry['items'] ) && is_array( $entry['items'] ) ) {
			foreach ( $entry['items'] as $item ) {
				if ( ! is_array( $item ) ) {
					continue;
				}
				$source = isset( $item['sourceUrl'] ) ? trim( (string) $item['sourceUrl'] ) : '';
				$ititle = isset( $item['title'] ) ? trim( (string) $item['title'] ) : '';
				$what   = isset( $item['whatChanged'] ) ? trim( (string) $item['whatChanged'] ) : '';
				$rule   = isset( $item['postRule'] ) ? trim( (string) $item['postRule'] ) : '';
				if ( $source === '' || $ititle === '' || $what === '' || $rule === '' ) {
					continue;
				}
				$items[] = array(
					'publishedAt' => isset( $item['publishedAt'] ) ? substr( trim( (string) $item['publishedAt'] ), 0, 32 ) : '',
					'sourceUrl'   => $source,
					'title'       => $ititle,
					'whatChanged' => $what,
					'postRule'    => $rule,
				);
			}
		}
		return array(
			'id'             => $id,
			'date'           => $date,
			'title'          => $title,
			'summary'        => isset( $entry['summary'] ) ? trim( (string) $entry['summary'] ) : '',
			'sourcesChecked' => $sources,
			'items'          => $items,
		);
	}
}
