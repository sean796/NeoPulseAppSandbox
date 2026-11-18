<?php
/**
 * 301s for In The Shade pages unpublished by the Nov 2026 content audit.
 */

add_action(
	'template_redirect',
	function () {
		if ( ! is_404() ) {
			return;
		}
		$map = get_option( 'intheshade_audit_redirects' );
		if ( ! is_array( $map ) || ! $map ) {
			return;
		}
		$path   = trim( (string) parse_url( $_SERVER['REQUEST_URI'] ?? '', PHP_URL_PATH ), '/' );
		$target = $map[ $path ] ?? '';
		if ( ! is_string( $target ) || $target === '' ) {
			return;
		}
		wp_safe_redirect( home_url( $target ), 301 );
		exit;
	},
	0
);
