<?php
global $wpdb;
$table = $wpdb->prefix . "neo_pulse_agent_runs";
$steps = $wpdb->prefix . "neo_pulse_agent_run_steps";
$rows = $wpdb->get_results("SELECT id, status, error_message, title, updated_at FROM {$table} WHERE recipe_key = \"semrush_safe_fix\" ORDER BY id DESC LIMIT 3", ARRAY_A);
foreach ($rows as $row) {
  echo "RUN " . $row["id"] . " status=" . $row["status"] . " err=" . $row["error_message"] . " updated=" . $row["updated_at"] . "\n";
  $ss = $wpdb->get_results($wpdb->prepare("SELECT step_index, step_key, status, label FROM {$steps} WHERE run_id = %d ORDER BY id ASC", (int)$row["id"]), ARRAY_A);
  foreach ($ss as $s) {
    echo "  " . $s["step_key"] . " " . $s["status"] . " " . $s["label"] . "\n";
  }
}
