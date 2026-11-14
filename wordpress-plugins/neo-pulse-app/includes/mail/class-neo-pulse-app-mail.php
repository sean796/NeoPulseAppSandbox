<?php
/**
 * Team transactional mail (AgentMail, SMTP, or wp_mail) with explicit errors.
 *
 * @package Neo_Pulse_App
 */

defined( 'ABSPATH' ) || exit;

class Neo_Pulse_App_Mail {

	/**
	 * @param array<int,array{fileName:string,mime:string,content:string}> $attachments
	 * @return array{ok:bool,error?:string,transport?:string}
	 */
	public static function send( string $to, string $subject, string $message, array $attachments = array(), string $html = '' ): array {
		$to = sanitize_email( strtolower( trim( $to ) ) );
		if ( $to === '' || ! is_email( $to ) ) {
			return array( 'ok' => false, 'error' => 'Invalid email address' );
		}

		$agentmail_key = Neo_Pulse_App_Secrets::agentmail_api_key();
		if ( $agentmail_key !== '' ) {
			return self::send_via_agentmail( $agentmail_key, $to, $subject, $message, $attachments, $html );
		}

		$smtp = Neo_Pulse_App_Secrets::smtp();
		if ( $smtp['host'] !== '' ) {
			return self::send_via_wp_mail( $to, $subject, $message, $smtp, 'smtp', $attachments );
		}

		$result = self::send_via_wp_mail( $to, $subject, $message, null, 'wp_mail', $attachments );
		if ( ! $result['ok'] ) {
			$result['error'] = $result['error'] . ' Save AgentMail API key in Dashboard → API Keys, or set NEO_PULSE_APP_SMTP_HOST in wp-config.';
		}
		return $result;
	}

	/**
	 * @param array<int,array{fileName:string,mime:string,content:string}> $attachments
	 * @return array{ok:bool,error?:string,transport?:string}
	 */
	private static function send_via_agentmail( string $api_key, string $to, string $subject, string $message, array $attachments = array(), string $html = '' ): array {
		$inbox = Neo_Pulse_App_Secrets::agentmail_inbox();
		if ( $inbox === '' || ! is_email( $inbox ) ) {
			return array( 'ok' => false, 'error' => 'AgentMail inbox not configured. Set general email in API Keys.' );
		}

		$url = 'https://api.agentmail.to/v0/inboxes/' . rawurlencode( $inbox ) . '/messages/send';
		$payload = array(
			'to'      => $to,
			'subject' => $subject,
			'text'    => $message,
			'html'    => $html !== '' ? $html : '<p>' . nl2br( esc_html( $message ) ) . '</p>',
		);
		$encoded_attachments = self::encode_attachments_for_agentmail( $attachments );
		if ( count( $encoded_attachments ) > 0 ) {
			$payload['attachments'] = $encoded_attachments;
		}

		$body = wp_json_encode( $payload );

		$response = wp_remote_post(
			$url,
			array(
				'timeout' => 30,
				'headers' => array(
					'Authorization' => 'Bearer ' . $api_key,
					'Content-Type'  => 'application/json',
				),
				'body'    => $body,
			)
		);

		if ( is_wp_error( $response ) ) {
			return array( 'ok' => false, 'error' => $response->get_error_message() );
		}

		$code = (int) wp_remote_retrieve_response_code( $response );
		$raw  = (string) wp_remote_retrieve_body( $response );
		if ( $code >= 200 && $code < 300 ) {
			return array( 'ok' => true, 'transport' => 'agentmail' );
		}

		return array( 'ok' => false, 'error' => self::format_agentmail_error( $code, $raw ) );
	}

	private static function format_agentmail_error( int $code, string $raw ): string {
		$decoded = json_decode( $raw, true );
		if ( is_array( $decoded ) ) {
			foreach ( array( 'message', 'error', 'detail' ) as $key ) {
				if ( ! empty( $decoded[ $key ] ) && is_string( $decoded[ $key ] ) ) {
					return 'AgentMail: ' . $decoded[ $key ];
				}
			}
		}
		$snippet = trim( wp_strip_all_tags( $raw ) );
		if ( $snippet !== '' && strlen( $snippet ) <= 240 ) {
			return 'AgentMail send failed (' . $code . '): ' . $snippet;
		}
		return 'AgentMail send failed (' . $code . '). Check API key and inbox in API Keys.';
	}

	/**
	 * @param array<int,array{fileName:string,mime:string,content:string}> $attachments
	 * @return array{ok:bool,error?:string,transport?:string}
	 */
	private static function send_via_wp_mail( string $to, string $subject, string $message, ?array $smtp, string $transport, array $attachments = array() ): array {
		$configure = null;
		if ( is_array( $smtp ) && $smtp['host'] !== '' ) {
			$configure = static function ( $phpmailer ) use ( $smtp, $attachments ) {
				$phpmailer->isSMTP();
				$phpmailer->Host       = $smtp['host'];
				$phpmailer->Port       = $smtp['port'];
				$phpmailer->SMTPAuth   = $smtp['user'] !== '';
				$phpmailer->Username   = $smtp['user'];
				$phpmailer->Password   = $smtp['password'];
				$phpmailer->SMTPSecure = $smtp['secure'] !== '' ? $smtp['secure'] : 'tls';
				if ( $smtp['fromEmail'] !== '' ) {
					$phpmailer->setFrom( $smtp['fromEmail'], $smtp['fromName'] );
				}
				foreach ( $attachments as $attachment ) {
					$phpmailer->addStringAttachment(
						(string) $attachment['content'],
						(string) $attachment['fileName'],
						'base64',
						(string) $attachment['mime']
					);
				}
			};
			add_action( 'phpmailer_init', $configure );
		} elseif ( count( $attachments ) > 0 ) {
			$configure = static function ( $phpmailer ) use ( $attachments ) {
				foreach ( $attachments as $attachment ) {
					$phpmailer->addStringAttachment(
						(string) $attachment['content'],
						(string) $attachment['fileName'],
						'base64',
						(string) $attachment['mime']
					);
				}
			};
			add_action( 'phpmailer_init', $configure );
		}

		$error_message = '';
		$on_failed     = static function ( $wp_error ) use ( &$error_message ) {
			if ( is_wp_error( $wp_error ) ) {
				$error_message = $wp_error->get_error_message();
			}
		};

		add_action( 'wp_mail_failed', $on_failed );
		$sent = wp_mail( $to, $subject, $message );
		remove_action( 'wp_mail_failed', $on_failed );
		if ( $configure ) {
			remove_action( 'phpmailer_init', $configure );
		}

		if ( $sent ) {
			return array( 'ok' => true, 'transport' => $transport );
		}

		global $phpmailer;
		if ( $error_message === '' && isset( $phpmailer ) && is_object( $phpmailer ) && ! empty( $phpmailer->ErrorInfo ) ) {
			$error_message = (string) $phpmailer->ErrorInfo;
		}

		return array(
			'ok'    => false,
			'error' => $error_message !== '' ? $error_message : 'Mail could not be sent.',
		);
	}

	/**
	 * @param mixed $raw
	 * @return array<int,array{fileName:string,mime:string,content:string}>
	 */
	public static function normalize_attachments( $raw ): array {
		if ( ! is_array( $raw ) ) {
			return array();
		}
		$out = array();
		foreach ( $raw as $item ) {
			if ( ! is_array( $item ) ) {
				continue;
			}
			$file_name = isset( $item['fileName'] ) ? sanitize_file_name( (string) $item['fileName'] ) : '';
			$mime      = isset( $item['mime'] ) ? sanitize_mime_type( (string) $item['mime'] ) : '';
			$content   = isset( $item['content'] ) ? (string) $item['content'] : '';
			if ( $file_name === '' || $content === '' ) {
				continue;
			}
			if ( $mime === '' ) {
				$mime = 'application/octet-stream';
			}
			$out[] = array(
				'fileName' => $file_name,
				'mime'     => $mime,
				'content'  => $content,
			);
		}
		return $out;
	}

	/**
	 * @param array<int,array{fileName:string,mime:string,content:string}> $attachments
	 * @return array<int,array<string,string>>
	 */
	private static function encode_attachments_for_agentmail( array $attachments ): array {
		$out = array();
		foreach ( $attachments as $attachment ) {
			$out[] = array(
				'filename'            => (string) $attachment['fileName'],
				'content_type'        => (string) $attachment['mime'],
				'content_disposition' => 'attachment',
				'content'             => base64_encode( (string) $attachment['content'] ),
			);
		}
		return $out;
	}
}
