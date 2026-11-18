<?php
require '/var/www/wp-load.php';
global $wpdb;
$t = $wpdb->prefix . 'neo_pulse_agent_runs';
$max = $wpdb->get_var( "SELECT MAX(id) FROM {$t}" );
$count = $wpdb->get_var( "SELECT COUNT(*) FROM {$t}" );
echo "max_id={$max} count={$count}\n";
$rows = $wpdb->get_results(
	"SELECT id, team_id, status, recipe_key, title, created_at FROM {$t} ORDER BY id DESC LIMIT 15",
	ARRAY_A
);
echo wp_json_encode( $rows, JSON_PRETTY_PRINT ) . "\n";

$cann = $wpdb->get_results(
	$wpdb->prepare(
		"SELECT id, team_id, status, recipe_key, title, created_at FROM {$t} WHERE recipe_key = %s ORDER BY id DESC LIMIT 10",
		'cannibalization_audit'
	),
	ARRAY_A
);
echo "cannibalization_audit rows:\n" . wp_json_encode( $cann, JSON_PRETTY_PRINT ) . "\n";
