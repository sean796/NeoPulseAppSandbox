<?php
require '/var/www/wp-load.php';
Neo_Pulse_App_Agent_Runs_Store::install_tables();
global $wpdb;
$t = $wpdb->prefix . 'neo_pulse_agent_runs';
echo "table={$t}\n";
echo "count_before=" . (int) $wpdb->get_var( "SELECT COUNT(*) FROM {$t}" ) . "\n";
$run = Neo_Pulse_App_Agent_Runs_Store::create_run(
	1,
	1,
	array(
		'recipeKey' => 'cannibalization_audit',
		'title'     => 'tmp cannibal test',
		'source'    => 'pulse_assist',
		'context'   => array( 'siteId' => 'test' ),
		'plan'      => array( 'executionMode' => 'server' ),
	)
);
echo "create=" . wp_json_encode( $run ) . "\n";
echo "last_error=" . $wpdb->last_error . "\n";
echo "count_after=" . (int) $wpdb->get_var( "SELECT COUNT(*) FROM {$t}" ) . "\n";
echo "max_id=" . (string) $wpdb->get_var( "SELECT MAX(id) FROM {$t}" ) . "\n";
