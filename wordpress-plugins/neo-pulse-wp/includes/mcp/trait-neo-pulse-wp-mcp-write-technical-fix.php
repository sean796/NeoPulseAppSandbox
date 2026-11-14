<?php
/**
 * `apply-technical-fix`: one safe Semrush technical change per call.
 *
 * @package Neo_Pulse_Wp
 */

defined( 'ABSPATH' ) || exit;

trait Neo_Pulse_Wp_Mcp_Write_Trait_Technical_Fix {

	/**
	 * @param array<string,mixed> $args Arguments.
	 * @return array<string,mixed>|WP_Error
	 */
	private static function apply_technical_fix( array $args ) {
		$kind = sanitize_key( (string) ( $args['kind'] ?? '' ) );
		$allowed = array( 'title', 'meta_description', 'missing_alt', 'broken_internal_link', 'broken_internal_image' );
		if ( ! in_array( $kind, $allowed, true ) ) {
			return new WP_Error(
				'invalid_argument',
				'kind must be one of: ' . implode( ', ', $allowed ),
				array( 'status' => 400 )
			);
		}

		$post = Neo_Pulse_Wp_Mcp_Read::resolve_post( $args );
		if ( is_wp_error( $post ) ) {
			return $post;
		}
		if ( ! current_user_can( 'edit_post', $post->ID ) ) {
			return new WP_Error( 'forbidden', 'You do not have permission to edit this post.', array( 'status' => 403 ) );
		}

		if ( $kind === 'title' || $kind === 'meta_description' ) {
			return self::apply_seo_field_fix( $post, $kind, $args );
		}
		if ( $kind === 'missing_alt' ) {
			return self::apply_alt_fix( $post, $args );
		}
		return self::apply_url_swap_fix( $post, $kind, $args );
	}

	/**
	 * @param WP_Post             $post Post.
	 * @param array<string,mixed> $args Arguments.
	 * @return array<string,mixed>|WP_Error
	 */
	private static function apply_seo_field_fix( WP_Post $post, string $kind, array $args ) {
		$value = trim( (string) ( $args['value'] ?? '' ) );
		if ( $value === '' ) {
			return new WP_Error( 'invalid_argument', 'value is required', array( 'status' => 400 ) );
		}
		$meta_key = $kind === 'title' ? 'neo_pulse_seo_title' : 'neo_pulse_seo_description';
		$before   = get_post_meta( $post->ID, $meta_key, true );

		if ( ! empty( $args['dry_run'] ) ) {
			return array(
				'dry_run'      => true,
				'post_id'      => (int) $post->ID,
				'kind'         => $kind,
				'would_change' => (string) $before !== $value,
				'before'       => $before,
				'after'        => $value,
			);
		}

		$history = array(
			'kind'    => 'post_meta',
			'post_id' => (int) $post->ID,
			'meta'    => array( $meta_key => $before ),
		);
		if ( $kind === 'title' ) {
			$history['post_title'] = (string) $post->post_title;
		}
		$history_id = Neo_Pulse_Wp_Mcp_History::record(
			'apply-technical-fix',
			sprintf( 'Set %s on post #%d', $meta_key, (int) $post->ID ),
			$history
		);
		update_post_meta( $post->ID, $meta_key, $value );
		if ( $kind === 'title' && (string) $post->post_title !== $value ) {
			wp_update_post(
				array(
					'ID'         => (int) $post->ID,
					'post_title' => $value,
				)
			);
		}
		if ( Neo_Pulse_Wp_Seo_Settings::output_active() && class_exists( 'Neo_Pulse_Wp_Cache_Flush' ) ) {
			Neo_Pulse_Wp_Cache_Flush::purge_html_caches();
		}

		return array(
			'ok'         => true,
			'post_id'    => (int) $post->ID,
			'kind'       => $kind,
			'meta_key'   => $meta_key,
			'value'      => $value,
			'history_id' => $history_id,
		);
	}

	/**
	 * @param WP_Post             $post Post.
	 * @param array<string,mixed> $args Arguments.
	 * @return array<string,mixed>|WP_Error
	 */
	private static function apply_alt_fix( WP_Post $post, array $args ) {
		$value    = trim( (string) ( $args['value'] ?? '' ) );
		$from_url = trim( (string) ( $args['fromUrl'] ?? $args['from_url'] ?? '' ) );
		if ( $value === '' ) {
			return new WP_Error( 'invalid_argument', 'value (alt text) is required', array( 'status' => 400 ) );
		}
		if ( $from_url === '' ) {
			return new WP_Error( 'invalid_argument', 'fromUrl is required for missing_alt', array( 'status' => 400 ) );
		}

		$attachment_id = attachment_url_to_postid( $from_url );
		$content       = (string) $post->post_content;
		$new_content   = self::set_img_alt_in_html( $content, $from_url, $value );
		$content_changed = $new_content !== $content;

		if ( ! empty( $args['dry_run'] ) ) {
			return array(
				'dry_run'           => true,
				'post_id'           => (int) $post->ID,
				'kind'              => 'missing_alt',
				'attachment_id'     => $attachment_id,
				'content_would_change' => $content_changed,
				'value'             => $value,
			);
		}

		$history_before = array(
			'kind'    => 'post_content_and_alt',
			'post_id' => (int) $post->ID,
			'content' => $content,
		);
		if ( $attachment_id > 0 ) {
			$history_before['attachment_alt'] = get_post_meta( $attachment_id, '_wp_attachment_image_alt', true );
		}
		$history_id = Neo_Pulse_Wp_Mcp_History::record(
			'apply-technical-fix',
			sprintf( 'Set image alt on post #%d', (int) $post->ID ),
			$history_before
		);

		if ( $attachment_id > 0 ) {
			update_post_meta( $attachment_id, '_wp_attachment_image_alt', $value );
		}
		if ( $content_changed ) {
			wp_update_post(
				array(
					'ID'           => (int) $post->ID,
					'post_content' => $new_content,
				)
			);
		}
		if ( Neo_Pulse_Wp_Seo_Settings::output_active() && class_exists( 'Neo_Pulse_Wp_Cache_Flush' ) ) {
			Neo_Pulse_Wp_Cache_Flush::purge_html_caches();
		}

		return array(
			'ok'            => true,
			'post_id'       => (int) $post->ID,
			'kind'          => 'missing_alt',
			'attachment_id' => $attachment_id,
			'value'         => $value,
			'history_id'    => $history_id,
		);
	}

	/**
	 * @param WP_Post             $post Post.
	 * @param array<string,mixed> $args Arguments.
	 * @return array<string,mixed>|WP_Error
	 */
	private static function apply_url_swap_fix( WP_Post $post, string $kind, array $args ) {
		$from = trim( (string) ( $args['fromUrl'] ?? $args['from_url'] ?? '' ) );
		$to   = trim( (string) ( $args['toUrl'] ?? $args['to_url'] ?? '' ) );
		if ( $from === '' || $to === '' ) {
			return new WP_Error( 'invalid_argument', 'fromUrl and toUrl are required', array( 'status' => 400 ) );
		}
		$content     = (string) $post->post_content;
		$new_content = str_replace( $from, $to, $content );
		if ( $new_content === $content ) {
			$from_esc = esc_url( $from );
			$to_esc   = esc_url( $to );
			if ( $from_esc !== '' && $from_esc !== $from ) {
				$new_content = str_replace( $from_esc, $to_esc !== '' ? $to_esc : $to, $content );
			}
		}
		if ( $new_content === $content ) {
			return new WP_Error( 'not_found', 'fromUrl was not found in post content', array( 'status' => 404 ) );
		}

		if ( ! empty( $args['dry_run'] ) ) {
			return array(
				'dry_run'      => true,
				'post_id'      => (int) $post->ID,
				'kind'         => $kind,
				'would_change' => true,
				'fromUrl'      => $from,
				'toUrl'        => $to,
			);
		}

		$history_id = Neo_Pulse_Wp_Mcp_History::record(
			'apply-technical-fix',
			sprintf( 'Swap URL on post #%d (%s)', (int) $post->ID, $kind ),
			array(
				'kind'    => 'post_content',
				'post_id' => (int) $post->ID,
				'content' => $content,
			)
		);
		wp_update_post(
			array(
				'ID'           => (int) $post->ID,
				'post_content' => $new_content,
			)
		);
		if ( Neo_Pulse_Wp_Seo_Settings::output_active() && class_exists( 'Neo_Pulse_Wp_Cache_Flush' ) ) {
			Neo_Pulse_Wp_Cache_Flush::purge_html_caches();
		}

		return array(
			'ok'         => true,
			'post_id'    => (int) $post->ID,
			'kind'       => $kind,
			'fromUrl'    => $from,
			'toUrl'      => $to,
			'history_id' => $history_id,
		);
	}

	private static function set_img_alt_in_html( string $html, string $src, string $alt ): string {
		$alt_attr = esc_attr( $alt );
		$patterns = array(
			$src,
			esc_url( $src ),
		);
		$out = $html;
		foreach ( array_unique( array_filter( $patterns ) ) as $needle ) {
			$quoted = preg_quote( $needle, '/' );
			$out    = preg_replace_callback(
				'/<img\b([^>]*\bsrc=["\']' . $quoted . '["\'][^>]*)>/i',
				static function ( array $m ) use ( $alt_attr ) {
					$attrs = $m[1];
					if ( preg_match( '/\balt=/i', $attrs ) ) {
						$attrs = preg_replace( '/\balt=["\'][^"\']*["\']/i', 'alt="' . $alt_attr . '"', $attrs, 1 );
					} else {
						$attrs .= ' alt="' . $alt_attr . '"';
					}
					return '<img' . $attrs . '>';
				},
				$out
			) ?? $out;
		}
		return $out;
	}
}
