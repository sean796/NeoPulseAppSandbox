<?php
/**
 * Inject window-treatments standing prompt beside the word blacklist for blinds clients.
 *
 * @package Neo_Pulse_App
 */

defined( 'ABSPATH' ) || exit;

class Neo_Pulse_App_Window_Treatments_Vertical_Inject {

	const BLACKLIST_MARKER = 'WORD BLACKLIST';
	const BLOCK_OPEN       = '=== WINDOW TREATMENTS RULES (READ ONLY: Hunter Douglas dealer rules; read fully before any output) ===';
	const BLOCK_CLOSE      = '=== END WINDOW TREATMENTS RULES ===';
	const SYSTEM_OBEY      = 'Obey the WINDOW TREATMENTS RULES block in the user message before any output. Apply those dealer, trademark, and country rules.';

	/** Hosts that sell blinds while tagged Interior design. */
	const EXTRA_BLINDS_HOSTS = array( 'tailoredinteriors', 'interiorsbylaura' );

	/**
	 * Known Window treatments hosts (Benchmark defaults). Used when the mirror tag is empty.
	 *
	 * @var array<string,bool>
	 */
	const WINDOW_TREATMENTS_HOSTS = array(
		'advanceblindsanddrapery' => true,
		'blindmagic'              => true,
		'blindmagic1stg'          => true,
		'blindswest'              => true,
		'customshadesoflondon'    => true,
		'dminteriorsanddesign'    => true,
		'eliteshadings'           => true,
		'intheshadeflorida'       => true,
		'lindseyblindsetc'        => true,
		'nightanddaydecor'        => true,
		'shutterspot'             => true,
		'superiorblinds'          => true,
	);

	/**
	 * @param array<int,array<string,mixed>> $messages
	 * @param array<string,mixed>            $body Request JSON (reads siteId).
	 * @return array<int,array<string,mixed>>
	 */
	public static function maybe_inject( array $messages, array $body = array() ): array {
		if ( ! self::messages_have_blacklist( $messages ) ) {
			return $messages;
		}
		if ( self::messages_have_block( $messages ) ) {
			return $messages;
		}
		$site_id = isset( $body['siteId'] ) ? trim( (string) $body['siteId'] ) : '';
		if ( $site_id === '' && isset( $body['site_id'] ) ) {
			$site_id = trim( (string) $body['site_id'] );
		}
		if ( $site_id === '' ) {
			return $messages;
		}
		$site = self::find_site( $site_id );
		if ( ! is_array( $site ) || ! self::site_uses_skill( $site ) ) {
			return $messages;
		}
		$live = self::live_prompt_text();
		if ( $live === '' ) {
			return $messages;
		}
		$block = self::BLOCK_OPEN . "\n" . $live . "\n" . self::BLOCK_CLOSE
			. "\n\nYou MUST read and obey the WINDOW TREATMENTS RULES above before writing anything.";

		$user_idx = -1;
		foreach ( $messages as $i => $message ) {
			if ( isset( $message['role'] ) && $message['role'] === 'user' ) {
				$user_idx = (int) $i;
				break;
			}
		}
		if ( $user_idx < 0 ) {
			return $messages;
		}

		$content = isset( $messages[ $user_idx ]['content'] ) && is_string( $messages[ $user_idx ]['content'] )
			? $messages[ $user_idx ]['content']
			: '';
		$messages[ $user_idx ]['content'] = $block . "\n\n" . $content;

		foreach ( $messages as $i => $message ) {
			if ( ! isset( $message['role'] ) || $message['role'] !== 'system' ) {
				continue;
			}
			$system = isset( $message['content'] ) && is_string( $message['content'] ) ? $message['content'] : '';
			if ( strpos( $system, self::SYSTEM_OBEY ) !== false ) {
				break;
			}
			$messages[ $i ]['content'] = self::SYSTEM_OBEY . "\n\n" . $system;
			break;
		}

		return $messages;
	}

	/**
	 * @param array<string,mixed> $site
	 */
	public static function site_uses_skill( array $site ): bool {
		$host = self::host_label( $site );
		if ( $host !== '' && in_array( $host, self::EXTRA_BLINDS_HOSTS, true ) ) {
			return true;
		}
		if ( $host !== '' && isset( self::WINDOW_TREATMENTS_HOSTS[ $host ] ) ) {
			return true;
		}
		$tag = trim( (string) ( $site['benchmarkCustomTag'] ?? $site['benchmark_custom_tag'] ?? '' ) );
		if ( $tag !== '' && strcasecmp( $tag, 'Window treatments' ) === 0 ) {
			return true;
		}
		$vertical = trim( (string) ( $site['industryVertical'] ?? '' ) );
		if ( $vertical === '' ) {
			return false;
		}
		if ( strcasecmp( $vertical, 'Window treatments' ) === 0 ) {
			return true;
		}
		if ( class_exists( 'Neo_Pulse_App_Vertical_Benchmark_Taxonomy' ) ) {
			return Neo_Pulse_App_Vertical_Benchmark_Taxonomy::normalize( $vertical ) === 'window_treatments';
		}
		return false;
	}

	public static function live_prompt_text(): string {
		if ( ! class_exists( 'Neo_Pulse_App_Skills_Library_Store' ) ) {
			return '';
		}
		$bundle = Neo_Pulse_App_Skills_Library_Store::get_skill(
			Neo_Pulse_App_Skills_Library_Store::SKILL_WINDOW_TREATMENTS_VERTICAL
		);
		if ( ! is_wp_error( $bundle ) && is_array( $bundle['prompts.json'] ?? null ) ) {
			$live = trim( (string) ( $bundle['prompts.json']['livePrompt'] ?? '' ) );
			if ( $live !== '' ) {
				return $live;
			}
		}
		return trim( Neo_Pulse_App_Skills_Library_Store::default_window_treatments_vertical_live_prompt() );
	}

	/**
	 * @return array<string,mixed>|null
	 */
	private static function find_site( string $site_id ): ?array {
		if ( ! class_exists( 'Neo_Pulse_App_Sites_Sync' ) ) {
			return null;
		}
		$mirror = Neo_Pulse_App_Sites_Sync::load_mirror();
		if ( ! is_array( $mirror ) || ! isset( $mirror['sites'] ) || ! is_array( $mirror['sites'] ) ) {
			return null;
		}
		foreach ( $mirror['sites'] as $site ) {
			if ( is_array( $site ) && (string) ( $site['id'] ?? '' ) === $site_id ) {
				return $site;
			}
		}
		return null;
	}

	/**
	 * @param array<string,mixed> $site
	 */
	private static function host_label( array $site ): string {
		$raw = trim( (string) ( $site['productionSiteUrl'] ?? $site['siteUrl'] ?? $site['site_url'] ?? '' ) );
		if ( $raw === '' ) {
			return '';
		}
		if ( strpos( $raw, 'http' ) !== 0 ) {
			$raw = 'https://' . $raw;
		}
		$host = wp_parse_url( $raw, PHP_URL_HOST );
		if ( ! is_string( $host ) || $host === '' ) {
			return '';
		}
		$host = strtolower( $host );
		if ( strpos( $host, 'www.' ) === 0 ) {
			$host = substr( $host, 4 );
		}
		$parts = explode( '.', $host );
		return (string) ( $parts[0] ?? '' );
	}

	/**
	 * @param array<int,array<string,mixed>> $messages
	 */
	private static function messages_have_blacklist( array $messages ): bool {
		foreach ( $messages as $message ) {
			$content = isset( $message['content'] ) && is_string( $message['content'] ) ? $message['content'] : '';
			if ( strpos( $content, self::BLACKLIST_MARKER ) !== false ) {
				return true;
			}
		}
		return false;
	}

	/**
	 * @param array<int,array<string,mixed>> $messages
	 */
	private static function messages_have_block( array $messages ): bool {
		foreach ( $messages as $message ) {
			$content = isset( $message['content'] ) && is_string( $message['content'] ) ? $message['content'] : '';
			if ( strpos( $content, self::BLOCK_OPEN ) !== false ) {
				return true;
			}
		}
		return false;
	}
}
