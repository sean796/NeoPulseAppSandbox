<?php
require '/var/www/wp-load.php';
global $wpdb;
$t = $wpdb->prefix . 'neo_pulse_agent_runs';
$rows = $wpdb->get_results(
	"SELECT id, team_id, status, recipe_key, title, created_at FROM {$t} WHERE id >= 2480 ORDER BY id DESC LIMIT 25",
	ARRAY_A
);
echo wp_json_encode( $rows, JSON_PRETTY_PRINT ) . "\n";

$one = $wpdb->get_row( $wpdb->prepare( "SELECT * FROM {$t} WHERE id = %d LIMIT 1", 2487 ), ARRAY_A );
echo "run2487=" . ( is_array( $one ) ? 'found team=' . $one['team_id'] . ' status=' . $one['status'] : 'missing' ) . "\n";

$one8 = $wpdb->get_row( $wpdb->prepare( "SELECT * FROM {$t} WHERE id = %d LIMIT 1", 2488 ), ARRAY_A );
echo "run2488=" . ( is_array( $one8 ) ? 'found team=' . $one8['team_id'] . ' status=' . $one8['status'] : 'missing' ) . "\n";
