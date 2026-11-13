<?php
if ( ( $_GET['key'] ?? '' ) !== '48deee0e4fcdc56d6e98e5a21b410a84' ) { http_response_code(403); exit('forbidden'); }
header('Content-Type: application/json; charset=utf-8');
set_time_limit(180);
$dir = __DIR__;
$wp_load = '';
for ( $i = 0; $i < 8; $i++ ) {
  if ( is_readable( $dir . '/wp-load.php' ) ) { $wp_load = $dir . '/wp-load.php'; break; }
  $dir = dirname( $dir );
}
if ( $wp_load === '' ) { http_response_code(500); echo '{"error":"wp-load missing"}'; exit; }
require_once $wp_load;
$admins = get_users( array( 'role' => 'administrator', 'number' => 1 ) );
if ( empty( $admins ) ) {
  echo wp_json_encode( array( 'error' => 'no administrator' ) );
  @unlink( __FILE__ );
  exit;
}
wp_set_current_user( (int) $admins[0]->ID );
$post_id = 10203;
if ( ! class_exists( 'Neo_Pulse_Wp_Ai_Seo_Research' ) ) {
  echo wp_json_encode( array( 'error' => 'research class missing' ) );
  @unlink( __FILE__ );
  exit;
}
$app_login = "n83opjwj415s1rjnjtt";
$app_pass  = "9d29d6e67941c3bc";
if ( $app_login !== '' && $app_pass !== '' && class_exists( 'Neo_Pulse_Wp_Api' ) ) {
  Neo_Pulse_Wp_Api::save_agency_dataforseo_credentials( $app_login, $app_pass );
}
if ( $app_login === '' || $app_pass === '' ) {
  echo wp_json_encode( array(
    'error' => 'app dataforseo empty',
    'login_len' => strlen( $app_login ),
  ) );
  @unlink( __FILE__ );
  exit;
}
$result = Neo_Pulse_Wp_Ai_Seo_Research::build_brief( $post_id, 'Edmonton SEO', true );
if ( is_wp_error( $result ) ) {
  echo wp_json_encode( array( 'error' => $result->get_error_message() ) );
  @unlink( __FILE__ );
  exit;
}
$brief = isset( $result['seoResearch'] ) ? (string) $result['seoResearch'] : '';
echo wp_json_encode( array(
  'ok'        => true,
  'post_id'   => $post_id,
  'saved'     => isset( $result['saved'] ) ? $result['saved'] : array(),
  'steps'     => isset( $result['meta']['steps'] ) ? $result['meta']['steps'] : array(),
  'warnings'  => isset( $result['meta']['warnings'] ) ? $result['meta']['warnings'] : array(),
  'brief_len' => strlen( $brief ),
  'brief_head'=> substr( $brief, 0, 1200 ),
) );
@unlink( __FILE__ );
