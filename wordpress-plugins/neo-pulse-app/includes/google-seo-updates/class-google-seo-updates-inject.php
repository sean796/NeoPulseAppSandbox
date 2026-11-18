<?php
/**
 * Inject Google SEO livePrompt beside the word blacklist on content harness messages.
 *
 * @package Neo_Pulse_App
 */

defined( 'ABSPATH' ) || exit;

class Neo_Pulse_App_Google_Seo_Updates_Inject {

	const BLACKLIST_MARKER = 'WORD BLACKLIST';
	const SEO_OPEN         = '=== GOOGLE SEO RULES (READ ONLY: standing post rules with sources; read fully before any output) ===';
	const SEO_CLOSE        = '=== END GOOGLE SEO RULES ===';
	const SYSTEM_OBEY      = 'Obey the GOOGLE SEO RULES block in the user message before any output. Apply those standing post-writing rules with their cited sources.';

	/**
	 * @param array<int,array<string,mixed>> $messages
	 * @return array<int,array<string,mixed>>
	 */
	public static function maybe_inject( array $messages ): array {
		if ( self::messages_have_seo_block( $messages ) ) {
			return $messages;
		}
		$live = self::live_prompt_text();
		if ( $live === '' ) {
			return $messages;
		}
		$block = self::SEO_OPEN . "\n" . $live . "\n" . self::SEO_CLOSE
			. "\n\nYou MUST read and obey the GOOGLE SEO RULES above before writing anything.";

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

	private static function live_prompt_text(): string {
		if ( ! class_exists( 'Neo_Pulse_App_Google_Seo_Updates_Runner' ) ) {
			return '';
		}
		$state = Neo_Pulse_App_Google_Seo_Updates_Runner::load_state();
		$live = trim( (string) ( $state['livePrompt'] ?? '' ) );
		if ( $live !== '' ) {
			return $live;
		}
		$entries = isset( $state['entries'] ) && is_array( $state['entries'] ) ? $state['entries'] : array();
		if ( $entries === array() || ! is_array( $entries[0] ) ) {
			return '';
		}
		$entry = $entries[0];
		$parts = array();
		if ( isset( $entry['summary'] ) && trim( (string) $entry['summary'] ) !== '' ) {
			$parts[] = trim( (string) $entry['summary'] );
		}
		$items = isset( $entry['items'] ) && is_array( $entry['items'] ) ? $entry['items'] : array();
		foreach ( $items as $item ) {
			if ( ! is_array( $item ) ) {
				continue;
			}
			$parts[] = trim( (string) ( $item['title'] ?? '' ) ) . "\n" . trim( (string) ( $item['whatChanged'] ?? '' ) ) . "\n" . trim( (string) ( $item['postRule'] ?? '' ) );
		}
		return trim( implode( "\n\n", $parts ) );
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
	private static function messages_have_seo_block( array $messages ): bool {
		foreach ( $messages as $message ) {
			$content = isset( $message['content'] ) && is_string( $message['content'] ) ? $message['content'] : '';
			if ( strpos( $content, self::SEO_OPEN ) !== false ) {
				return true;
			}
		}
		return false;
	}
}
