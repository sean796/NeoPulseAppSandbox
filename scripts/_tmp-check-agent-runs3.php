<?php
require '/var/www/wp-load.php';
global $wpdb;
$t = $wpdb->prefix . 'neo_pulse_agent_runs';
echo 'prefix=' . $wpdb->prefix . PHP_EOL;
echo 'max=' . $wpdb->get_var( "SELECT MAX(id) FROM {$t}" ) . ' count=' . $wpdb->get_var( "SELECT COUNT(*) FROM {$t}" ) . PHP_EOL;
$rows = $wpdb->get_results(
	"SELECT id, team_id, status, recipe_key, title, created_at FROM {$t} ORDER BY id DESC LIMIT 20",
	ARRAY_A
);
echo wp_json_encode( $rows, JSON_PRETTY_PRINT ) . PHP_EOL;
foreach ( array( 2487, 2488, 2490 ) as $id ) {
	$one = $wpdb->get_row( $wpdb->prepare( "SELECT id, team_id, status, recipe_key FROM {$t} WHERE id = %d", $id ), ARRAY_A );
	echo "id{$id}=" . ( is_array( $one ) ? wp_json_encode( $one ) : 'MISSING' ) . PHP_EOL;
}
