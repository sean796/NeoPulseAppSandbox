<?php
/**
 * One-shot for Blind Magic: apply Neo Pulse redirects + delete source posts.
 * Paste into: wp eval "$(cat this)" or run via neo-mcp with the $rows array.
 */
$rows = array(
	array( 'blog/hunter-douglas-prices/', 'https://blindmagic.com/blog/hunter-douglas-vs-alta/' ),
	array( 'blog/alt-shades-reviews/', 'https://blindmagic.com/blog/hunter-douglas-vs-alta/' ),
	array( 'blog/alt-shades/', 'https://blindmagic.com/blog/hunter-douglas-vs-alta/' ),
	array( 'blog/hunter-douglas-blinds-quality-style/', 'https://blindmagic.com/blog/hunter-douglas-vs-alta/' ),
	array( 'blog/hunter-douglas-guide/', 'https://blindmagic.com/blog/hunter-douglas-vs-alta/' ),
	array( 'blog/clean-fabric-blinds-cleaning/', 'https://blindmagic.com/blog/how-to-clean-blinds/' ),
	array( 'blog/clean-fabric-blinds/', 'https://blindmagic.com/blog/how-to-clean-blinds/' ),
	array( 'blog/how-clean-blinds/', 'https://blindmagic.com/blog/how-to-clean-blinds/' ),
	array( 'blog/blind-parts/', 'https://blindmagic.com/blog/blinds-replacement-parts/' ),
	array( 'blog/battery-wands-power-motorized-shades/', 'https://blindmagic.com/blog/battery-wand-repair/' ),
	array( 'blog/rechargeable-battery-wands/', 'https://blindmagic.com/blog/battery-wand-repair/' ),
	array( 'blog/motorized-blinds-edmonton/', 'https://blindmagic.com/blog/motorized-blinds-vs-manual/' ),
	array( 'blog/motorized-roller-blinds-benefits/', 'https://blindmagic.com/blog/motorized-blinds-vs-manual/' ),
	array( 'blog/motorised-roller-blinds/', 'https://blindmagic.com/blog/motorized-blinds-vs-manual/' ),
	array( 'blog/softtouch-motorization-benefits/', 'https://blindmagic.com/blog/motorized-blinds-vs-manual/' ),
	array( 'blog/roman-shades-cost/', 'https://blindmagic.com/blog/roman-shades/' ),
	array( 'blog/roman-shades-classic-modern/', 'https://blindmagic.com/blog/roman-shades/' ),
	array( 'blog/roman-shade/', 'https://blindmagic.com/blog/roman-shades/' ),
	array( 'blog/smart-blinds-automation/', 'https://blindmagic.com/blog/smart-blinds-comparison/' ),
	array( 'blog/powerview-vs-tahoma/', 'https://blindmagic.com/blog/smart-blinds-comparison/' ),
	array( 'blog/plantation-shutters-vs-blinds/', 'https://blindmagic.com/blog/blinds-comparison/' ),
	array( 'blog/duette-cellular-shades/', 'https://blindmagic.com/blog/honeycomb-shades-vs-solera-soft/' ),
	array( 'blog/aura-illuminated-shades/', 'https://blindmagic.com/blog/silhouette-blinds-vs-sheer-shades/' ),
	array( 'blog/hunter-douglas-top-down-bottom-up-shades-canada/', 'https://blindmagic.com/blog/privacy-light-top-down-bottom-up-blinds/' ),
	array( 'blog/window-covering-trends-2026/', 'https://blindmagic.com/blog/modern-window-treatments/' ),
	array( 'blog/moving-away-from-grey/', 'https://blindmagic.com/blog/modern-window-treatments/' ),
	array( 'blog/window-fashion-guide/', 'https://blindmagic.com/blog/modern-window-treatments/' ),
	array( 'blog/energy-efficient-window-coverings/', 'https://blindmagic.com/blog/science-behind-energy-efficient-windows/' ),
	array( 'blog/5-reasons-to-upgrade/', 'https://blindmagic.com/blog/science-behind-energy-efficient-windows/' ),
	array( 'blog/light-filtering-vs-room-darkening/', 'https://blindmagic.com/blog/are-blackout-shades-worth-it/' ),
	array( 'blog/commercial-blinds-enhance-business-space/', 'https://blindmagic.com/blog/commercial-blinds/' ),
	array( 'blog/best-blinds-styles-trends/', 'https://blindmagic.com/blog/blinds-edmonton/' ),
	array( 'blog/stony-plain/', 'https://blindmagic.com/blog/blinds-edmonton/' ),
	array( 'blog/spruce-grove/', 'https://blindmagic.com/blog/blinds-edmonton/' ),
	array( 'blog/devon/', 'https://blindmagic.com/blog/blinds-edmonton/' ),
	array( 'service-area/window-treatments-edmonton-84street/', 'https://blindmagic.com/service-area/hunter-douglas-blinds-edmonton-ab/' ),
	array( 'service-area/window-treatments-17-street-ab-edmonton/', 'https://blindmagic.com/service-area/hunter-douglas-blinds-edmonton-ab/' ),
	array( 'service-area/window-treatments-near-17-street-nw/', 'https://blindmagic.com/service-area/hunter-douglas-blinds-edmonton-ab/' ),
	array( 'service-area/window-treatments-near-91-street-edmonton/', 'https://blindmagic.com/service-area/hunter-douglas-blinds-edmonton-ab/' ),
	array( 'service-area/window-treatments-near-82-street-edmonton/', 'https://blindmagic.com/service-area/hunter-douglas-blinds-edmonton-ab/' ),
	array( 'service-area/window-treatments-near-50-street-edmonton/', 'https://blindmagic.com/service-area/hunter-douglas-blinds-edmonton-ab/' ),
	array( 'service-area/window-treatments-near-100-avenue-edmonton/', 'https://blindmagic.com/service-area/hunter-douglas-blinds-edmonton-ab/' ),
	array( 'service-area/window-treatments-near-23-avenue-edmonton/', 'https://blindmagic.com/service-area/hunter-douglas-blinds-edmonton-ab/' ),
	array( 'service-area/window-treatments-near-17-street-edmonton/', 'https://blindmagic.com/service-area/hunter-douglas-blinds-edmonton-ab/' ),
);

$ok_redirect = 0;
$fail_redirect = 0;
$deleted = 0;
$missing = 0;
$errors = array();

foreach ( $rows as $pair ) {
	$source = ltrim( (string) $pair[0], '/' );
	$dest   = (string) $pair[1];
	if ( $source === '' || $dest === '' ) {
		continue;
	}

	$save = Neo_Pulse_Wp_Redirects::save(
		array(
			'source'      => $source,
			'matching'    => 'exact',
			'destination' => $dest,
			'type'        => 301,
			'status'      => 'active',
			'category'    => '',
		)
	);
	if ( empty( $save['ok'] ) ) {
		++$fail_redirect;
		$errors[] = $source . ' redirect: ' . (string) ( $save['error'] ?? 'fail' );
	} else {
		++$ok_redirect;
	}

	$url = home_url( '/' . $source );
	$id  = url_to_postid( $url );
	if ( ! $id ) {
		$slug = basename( untrailingslashit( $source ) );
		$type = ( strpos( $source, 'service-area/' ) === 0 ) ? 'service-area' : 'post';
		$found = get_posts(
			array(
				'name'           => $slug,
				'post_type'      => $type,
				'post_status'    => 'any',
				'posts_per_page' => 1,
				'fields'         => 'ids',
			)
		);
		$id = ! empty( $found[0] ) ? (int) $found[0] : 0;
	}
	if ( $id > 0 ) {
		$gone = wp_delete_post( $id, true );
		if ( $gone ) {
			++$deleted;
		} else {
			$errors[] = $source . ' delete failed id=' . $id;
		}
	} else {
		++$missing;
	}
}

wp_cache_flush();
if ( function_exists( 'nitropack_sdk_purge_local' ) ) {
	@nitropack_sdk_purge_local();
}

echo 'redirects_ok=' . $ok_redirect . "\n";
echo 'redirects_fail=' . $fail_redirect . "\n";
echo 'deleted=' . $deleted . "\n";
echo 'missing_posts=' . $missing . "\n";
if ( $errors ) {
	echo "errors:\n" . implode( "\n", $errors ) . "\n";
}
echo "done\n";
