<?php
require '/var/www/wp-load.php';
$token = Neo_Pulse_App_Google_Mcp_Tokens::get_valid_access_token();
if ( is_wp_error( $token ) ) {
	echo 'TOKEN ERROR ' . $token->get_error_message() . "\n";
	exit( 1 );
}
$id = '1b3Vp8gbbQ9cSGRhIjT8vc90VL1L-UOeEnYMcVdL-mpQ';
$norm = static function ( string $value ): string {
	$value = trim( $value );
	if ( $value === '' ) {
		return '';
	}
	if ( stripos( $value, 'http://' ) === 0 || stripos( $value, 'https://' ) === 0 ) {
		$parts = wp_parse_url( $value );
		$value = is_array( $parts ) && isset( $parts['path'] ) ? (string) $parts['path'] : '';
	}
	$value = strtolower( (string) preg_replace( '#/+#', '/', $value ) );
	$value = ltrim( $value, '/' );
	if ( $value !== '' && substr( $value, -1 ) !== '/' ) {
		$value .= '/';
	}
	return $value;
};
foreach ( array( 'Blog', 'Service Areas' ) as $title ) {
	$quoted = str_replace( "'", "''", $title );
	$url    = Neo_Pulse_App_Google_Drive_Upload::SHEETS_API_URL . '/' . rawurlencode( $id ) . '/values/' . rawurlencode( "'" . $quoted . "'!A:ZZ" );
	$res    = wp_remote_get( $url, array( 'timeout' => 60, 'headers' => array( 'Authorization' => 'Bearer ' . $token ) ) );
	$data   = json_decode( wp_remote_retrieve_body( $res ), true );
	$rows   = isset( $data['values'] ) && is_array( $data['values'] ) ? $data['values'] : array();
	$self   = 0;
	for ( $i = 1; $i < count( $rows ); $i++ ) {
		$src = $norm( (string) ( $rows[ $i ][1] ?? '' ) );
		$dst = $norm( (string) ( $rows[ $i ][3] ?? '' ) );
		if ( $src !== '' && $src === $dst ) {
			++$self;
		}
	}
	echo $title . ' rows=' . count( $rows ) . ' self=' . $self . "\n";
}
