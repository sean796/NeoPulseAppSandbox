<?php
require '/var/www/wp-load.php';
global $wpdb;
$n = $wpdb->query(
	"DELETE FROM {$wpdb->options} WHERE option_name LIKE '_transient_neo_pulse_editorial_audit_finish_%'
	OR option_name LIKE '_transient_timeout_neo_pulse_editorial_audit_finish_%'
	OR option_name LIKE '_transient_neo_pulse_agent_run_lock_%'
	OR option_name LIKE '_transient_timeout_neo_pulse_agent_run_lock_%'"
);
echo 'cleared=' . (int) $n . PHP_EOL;
$path = '/var/www/wp-content/plugins/neo-pulse-app/includes/editorial-content-audit/class-editorial-content-audit-runner.php';
$src  = is_readable( $path ) ? file_get_contents( $path ) : '';
echo ( strpos( (string) $src, 'Client does not poll this recipe' ) !== false ? 'loop=yes' : 'loop=no' ) . PHP_EOL;
echo ( strpos( (string) $src, '|| $end === 1' ) === false ? 'no-drive-on-page1=yes' : 'no-drive-on-page1=no' ) . PHP_EOL;
