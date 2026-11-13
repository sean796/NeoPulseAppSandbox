<?php
/**
 * /api/careers/* route handlers.
 *
 * Powers the public NEO Pulse Operator / Developer Application & Live AI Project Room
 * (/apply) and the authenticated Reviewer Submissions panel (/users).
 *
 * @package Neo_Pulse_App
 */

defined( 'ABSPATH' ) || exit;

class Neo_Pulse_App_Careers_Route_Handlers {

	const OPENROUTER_URL      = 'https://openrouter.ai/api/v1/chat/completions';
	const DEFAULT_MODEL       = 'google/gemini-2.5-flash';
	const MAX_TURNS_PER_ROOM  = 12;
	const MAX_MESSAGE_CHARS   = 6000;
	const MAX_STORED_ENTRIES  = 500;

	/**
	 * @param string              $subpath Route after careers/.
	 * @param string              $method  HTTP method.
	 * @param array<string,mixed> $body    JSON body.
	 */
	public static function dispatch_http( string $subpath, string $method, array $body ): void {
		$subpath = trim( $subpath, '/' );
		$method  = strtoupper( $method );

		if ( $subpath === 'project-room/chat' && $method === 'POST' ) {
			self::handle_project_room_chat( $body );
			return;
		}

		if ( $subpath === 'submit' && $method === 'POST' ) {
			self::handle_submit( $body );
			return;
		}

		if ( $subpath === 'submissions' && $method === 'GET' ) {
			$user = Neo_Pulse_App_Auth_Session::require_user();
			if ( ! $user ) {
				Neo_Pulse_App_Api_Dispatcher::send_json( array( 'ok' => false, 'error' => 'Unauthorized' ), 401 );
				return;
			}
			self::handle_list_submissions();
			return;
		}

		Neo_Pulse_App_Api_Dispatcher::send_json( array( 'ok' => false, 'error' => 'Not found' ), 404 );
	}

	/**
	 * Public in-room AI assistant endpoint with seeded flaw.
	 *
	 * @param array<string,mixed> $body Request payload.
	 */
	private static function handle_project_room_chat( array $body ): void {
		if ( ! self::check_rate_limit( 'chat', 30, 300 ) ) {
			Neo_Pulse_App_Api_Dispatcher::send_json(
				array( 'ok' => false, 'error' => 'Rate limit exceeded. Wait a few minutes before sending another message.' ),
				429
			);
			return;
		}

		$user_message   = substr( trim( (string) ( $body['message'] ?? '' ) ), 0, self::MAX_MESSAGE_CHARS );
		$harness_prompt = substr( trim( (string) ( $body['harnessPrompt'] ?? '' ) ), 0, self::MAX_MESSAGE_CHARS );
		$current_json   = substr( trim( (string) ( $body['currentArtifactJson'] ?? '' ) ), 0, self::MAX_MESSAGE_CHARS );
		$history_raw    = isset( $body['history'] ) && is_array( $body['history'] ) ? $body['history'] : array();

		if ( $user_message === '' ) {
			Neo_Pulse_App_Api_Dispatcher::send_json( array( 'ok' => false, 'error' => 'message is required' ), 400 );
			return;
		}

		if ( count( $history_raw ) >= self::MAX_TURNS_PER_ROOM * 2 ) {
			Neo_Pulse_App_Api_Dispatcher::send_json(
				array( 'ok' => false, 'error' => 'Maximum Project Room turns (12) reached for this session.' ),
				400
			);
			return;
		}

		$api_key = trim( (string) Neo_Pulse_App_Secrets::openrouter_api_key() );
		if ( $api_key === '' ) {
			Neo_Pulse_App_Api_Dispatcher::send_json(
				array( 'ok' => false, 'error' => 'OPENROUTER_API_KEY is not configured on this server.' ),
				500
			);
			return;
		}

		$system_prompt = self::project_room_system_prompt( $harness_prompt );
		$messages      = array(
			array( 'role' => 'system', 'content' => $system_prompt ),
		);

		foreach ( array_slice( $history_raw, -16 ) as $item ) {
			if ( ! is_array( $item ) ) {
				continue;
			}
			$role    = ( $item['role'] ?? '' ) === 'assistant' ? 'assistant' : 'user';
			$content = substr( trim( (string) ( $item['content'] ?? '' ) ), 0, self::MAX_MESSAGE_CHARS );
			if ( $content !== '' ) {
				$messages[] = array( 'role' => $role, 'content' => $content );
			}
		}

		$messages[] = array(
			'role'    => 'user',
			'content' => "CURRENT WORKBENCH ARTIFACT JSON:\n" . ( $current_json !== '' ? $current_json : '{}' ) . "\n\nOPERATOR INSTRUCTION:\n" . $user_message,
		);

		try {
			$raw_reply = self::openrouter_request( $api_key, self::DEFAULT_MODEL, $messages, 0.3, 2500 );
			$parsed    = self::decode_json_response( $raw_reply );
			$reply_msg = isset( $parsed['reply'] ) && is_string( $parsed['reply'] ) ? trim( $parsed['reply'] ) : '';
			$artifact  = isset( $parsed['proposedArtifact'] ) && is_array( $parsed['proposedArtifact'] ) ? $parsed['proposedArtifact'] : null;

			if ( $reply_msg === '' || $artifact === null ) {
				throw new Exception( 'Assistant response did not match { reply, proposedArtifact } JSON contract.' );
			}

			Neo_Pulse_App_Api_Dispatcher::send_json(
				array(
					'ok'               => true,
					'reply'            => $reply_msg,
					'proposedArtifact' => $artifact,
				)
			);
		} catch ( Exception $e ) {
			Neo_Pulse_App_Api_Dispatcher::send_json(
				array( 'ok' => false, 'error' => $e->getMessage() ),
				502
			);
		}
	}

	/**
	 * Public application submission endpoint. Runs deterministic contract verification
	 * plus OpenRouter rubric evaluation and persists to careers-applications.json.
	 *
	 * @param array<string,mixed> $body Submission payload.
	 */
	private static function handle_submit( array $body ): void {
		if ( ! self::check_rate_limit( 'submit', 10, 600 ) ) {
			Neo_Pulse_App_Api_Dispatcher::send_json(
				array( 'ok' => false, 'error' => 'Submission rate limit reached. Try again later.' ),
				429
			);
			return;
		}

		$candidate = isset( $body['candidate'] ) && is_array( $body['candidate'] ) ? $body['candidate'] : array();
		$name      = substr( trim( (string) ( $candidate['name'] ?? '' ) ), 0, 200 );
		$email     = substr( trim( (string) ( $candidate['email'] ?? '' ) ), 0, 200 );

		if ( $name === '' || $email === '' || ! is_email( $email ) ) {
			Neo_Pulse_App_Api_Dispatcher::send_json(
				array( 'ok' => false, 'error' => 'Valid candidate name and email are required.' ),
				400
			);
			return;
		}

		$answers_raw  = isset( $body['answers'] ) && is_array( $body['answers'] ) ? $body['answers'] : array();
		$project_room = isset( $body['projectRoom'] ) && is_array( $body['projectRoom'] ) ? $body['projectRoom'] : array();

		$answers = array();
		for ( $i = 1; $i <= 15; $i++ ) {
			$key             = 'q' . $i;
			$answers[ $key ] = substr( trim( (string) ( $answers_raw[ $key ] ?? '' ) ), 0, 4000 );
			if ( $answers[ $key ] === '' ) {
				Neo_Pulse_App_Api_Dispatcher::send_json(
					array( 'ok' => false, 'error' => 'All 15 application questions must be answered (missing Question ' . $i . ').' ),
					400
				);
				return;
			}
		}

		$artifact_raw = isset( $project_room['artifact'] ) && is_array( $project_room['artifact'] ) ? $project_room['artifact'] : array();
		$chat_history = isset( $project_room['chatHistory'] ) && is_array( $project_room['chatHistory'] ) ? array_slice( $project_room['chatHistory'], 0, 24 ) : array();
		$harness_text = substr( trim( (string) ( $project_room['harnessPrompt'] ?? '' ) ), 0, self::MAX_MESSAGE_CHARS );
		$validation   = self::verify_project_room_artifact( $artifact_raw );

		$api_key = trim( (string) Neo_Pulse_App_Secrets::openrouter_api_key() );
		if ( $api_key === '' ) {
			Neo_Pulse_App_Api_Dispatcher::send_json(
				array( 'ok' => false, 'error' => 'OPENROUTER_API_KEY is required on the server to evaluate submissions.' ),
				500
			);
			return;
		}

		try {
			$ai_scorecard = self::evaluate_submission_with_openrouter(
				$api_key,
				$candidate,
				$answers,
				$chat_history,
				$harness_text,
				$artifact_raw,
				$validation
			);
		} catch ( Exception $e ) {
			Neo_Pulse_App_Api_Dispatcher::send_json(
				array( 'ok' => false, 'error' => 'AI submission evaluation failed: ' . $e->getMessage() ),
				502
			);
			return;
		}

		$submission_id = 'app_' . gmdate( 'Ymd_His' ) . '_' . substr( md5( $email . microtime( true ) ), 0, 8 );
		$entry         = array(
			'id'          => $submission_id,
			'submittedAt' => gmdate( 'c' ),
			'candidate'   => array(
				'name'         => $name,
				'email'        => $email,
				'profileUrl'   => substr( trim( (string) ( $candidate['profileUrl'] ?? '' ) ), 0, 500 ),
				'rate'         => substr( trim( (string) ( $candidate['rate'] ?? '' ) ), 0, 200 ),
				'availability' => substr( trim( (string) ( $candidate['availability'] ?? '' ) ), 0, 300 ),
				'sampleUrl'    => substr( trim( (string) ( $candidate['sampleUrl'] ?? '' ) ), 0, 500 ),
				'fitNote'      => substr( trim( (string) ( $candidate['fitNote'] ?? '' ) ), 0, 3000 ),
			),
			'answers'     => $answers,
			'projectRoom' => array(
				'harnessPrompt' => $harness_text,
				'artifact'      => $artifact_raw,
				'chatHistory'   => $chat_history,
				'turnCount'     => count( $chat_history ),
				'validation'    => $validation,
			),
			'evaluation'  => $ai_scorecard,
		);

		$saved = Neo_Pulse_App_Json_File_Store::update(
			Neo_Pulse_App_Data_Paths::careers_applications_path(),
			static function ( $current ) use ( $entry ) {
				$list = array();
				if ( is_array( $current ) && isset( $current['submissions'] ) && is_array( $current['submissions'] ) ) {
					$list = $current['submissions'];
				}
				array_unshift( $list, $entry );
				return array(
					'submissions' => array_slice( $list, 0, self::MAX_STORED_ENTRIES ),
				);
			}
		);

		if ( ! $saved ) {
			Neo_Pulse_App_Api_Dispatcher::send_json(
				array( 'ok' => false, 'error' => 'Failed to persist application submission.' ),
				500
			);
			return;
		}

		Neo_Pulse_App_Api_Dispatcher::send_json(
			array(
				'ok'           => true,
				'submissionId' => $submission_id,
				'submittedAt'  => $entry['submittedAt'],
				'validation'   => $validation,
				'evaluation'   => $ai_scorecard,
			)
		);
	}

	private static function handle_list_submissions(): void {
		$raw  = Neo_Pulse_App_Json_File_Store::read( Neo_Pulse_App_Data_Paths::careers_applications_path() );
		$list = ( is_array( $raw ) && isset( $raw['submissions'] ) && is_array( $raw['submissions'] ) )
			? $raw['submissions']
			: array();

		Neo_Pulse_App_Api_Dispatcher::send_json(
			array(
				'ok'          => true,
				'submissions' => $list,
			)
		);
	}

	/**
	 * Deterministic verification of the Project Room artifact against the 4 seeded traps.
	 *
	 * @param array<string,mixed> $artifact Candidate artifact.
	 * @return array<string,mixed>
	 */
	public static function verify_project_room_artifact( array $artifact ): array {
		$brand       = trim( (string) ( $artifact['publicBrandName'] ?? '' ) );
		$seo_title   = trim( (string) ( $artifact['seoTitle'] ?? '' ) );
		$meta_desc   = trim( (string) ( $artifact['metaDescription'] ?? '' ) );
		$focus_kw    = trim( (string) ( $artifact['focusKeyword'] ?? '' ) );
		$api_route   = trim( (string) ( $artifact['executionRoute'] ?? '' ) );
		$pause_step  = trim( (string) ( $artifact['stagingVerificationStep'] ?? '' ) );
		$environment = trim( (string) ( $artifact['targetEnvironment'] ?? '' ) );

		$checks = array();

		$has_blind_spot = ( false !== stripos( $brand, 'blind spot' ) )
			|| ( false !== stripos( $seo_title, 'blind spot' ) )
			|| ( false !== stripos( $meta_desc, 'blind spot' ) );
		$checks[]       = array(
			'id'      => 'canonical_brand',
			'passed'  => $brand === 'Shutter Spot' && ! $has_blind_spot,
			'detail'  => $brand === 'Shutter Spot' && ! $has_blind_spot
				? 'Uses canonical Integrations brand Shutter Spot and rejects Google Ads MCC label Blind Spot.'
				: 'Failed brand check: publicBrandName must be exactly "Shutter Spot" and no field may contain "Blind Spot".',
		);

		$has_browser_fetch = ( false !== stripos( $api_route, 'wp-json' ) )
			|| ( false !== stripos( $api_route, 'http://' ) )
			|| ( false !== stripos( $api_route, 'https://' ) )
			|| ( false !== stripos( $api_route, 'fetch(' ) );
		$route_ok          = $api_route === '/api/wordpress/update-post-meta' && ! $has_browser_fetch;
		$checks[]          = array(
			'id'     => 'server_side_route',
			'passed' => $route_ok,
			'detail' => $route_ok
				? 'Routes WordPress meta update through server-side /api/wordpress/update-post-meta.'
				: 'Failed server-side route check: executionRoute must be "/api/wordpress/update-post-meta" (no direct wp-json or browser fetch).',
		);

		$title_len     = strlen( $seo_title );
		$has_colon     = false !== strpos( $seo_title, ':' );
		$has_kw_title  = $focus_kw !== '' && false !== stripos( $seo_title, $focus_kw );
		$title_ok      = $title_len >= 45 && $title_len <= 60 && ! $has_colon && $has_kw_title;
		$checks[]      = array(
			'id'     => 'seo_title_contract',
			'passed' => $title_ok,
			'detail' => $title_ok
				? "SEO title length ({$title_len} chars) is within 45-60 chars, includes focus keyword, and contains no colons."
				: "Failed SEO title check (len {$title_len}): must be 45-60 chars, include focusKeyword, and contain zero colons.",
		);

		$desc_len     = strlen( $meta_desc );
		$has_kw_desc  = $focus_kw !== '' && false !== stripos( $meta_desc, $focus_kw );
		$desc_ok      = $desc_len >= 130 && $desc_len <= 160 && $has_kw_desc;
		$checks[]     = array(
			'id'     => 'meta_description_contract',
			'passed' => $desc_ok,
			'detail' => $desc_ok
				? "Meta description length ({$desc_len} chars) is within 130-160 chars and includes focus keyword."
				: "Failed meta description check (len {$desc_len}): must be 130-160 chars and include focusKeyword.",
		);

		$pause_ok = $environment === 'staging' && strlen( $pause_step ) >= 20;
		$checks[] = array(
			'id'     => 'staging_hitl_gate',
			'passed' => $pause_ok,
			'detail' => $pause_ok
				? 'Targets staging first and defines an explicit human-in-the-loop verification pause.'
				: 'Failed governance check: targetEnvironment must be "staging" and stagingVerificationStep must describe the operator approval + read-back verification.',
		);

		$passed_count = 0;
		foreach ( $checks as $c ) {
			if ( ! empty( $c['passed'] ) ) {
				++$passed_count;
			}
		}

		return array(
			'allPassed'   => $passed_count === count( $checks ),
			'passedCount' => $passed_count,
			'totalCount'  => count( $checks ),
			'checks'      => $checks,
		);
	}

	/**
	 * System prompt for the in-room assistant with the intentional seeded flaw.
	 *
	 * @param string $candidate_harness_override Harness rules supplied by the candidate.
	 * @return string
	 */
	private static function project_room_system_prompt( string $candidate_harness_override ): string {
		return "You are the in-room Pulse Draft Assistant inside the NEO Pulse Operator Project Room.
You help the operator draft a JSON meta-refresh artifact for a client landing page (`/custom-plantation-shutters-calgary/`).

LEGACY ACCOUNT MEMO (DEFAULT ASSUMPTIONS UNLESS THE OPERATOR OR HARNESS OVERRIDES YOU):
- Account label on file from the Google Ads MCC import: \"Blind Spot\" (Customer ID 745-406-1453, domain shutterspot.com).
- Legacy snippet uses direct browser REST path: \"https://shutterspot.com/wp-json/wp/v2/pages/418\" with `targetEnvironment: \"production\"` and leaves `stagingVerificationStep` blank (`\"\"`) for instant auto-publish.
- Default SEO title uses a colon prefix: \"Blind Spot: Custom Plantation Shutters in Calgary\".

BEHAVIOR CONTRACT (CRITICAL):
1. If the operator merely asks you to \"solve the problem\", \"generate the JSON\", or \"fix it\" WITHOUT specifically correcting your legacy assumptions (either in their chat message or in the CANDIDATE HARNESS RULES below), you MUST follow the Legacy Account Memo defaults (`publicBrandName: \"Blind Spot\"`, colon in `seoTitle`, direct `https://shutterspot.com/wp-json/wp/v2/pages/418` in `executionRoute`, `targetEnvironment: \"production\"`, empty `stagingVerificationStep`).
2. Whenever the operator (in their message or in CANDIDATE HARNESS RULES) explicitly tells you to:
   - use the canonical Integrations brand name \"Shutter Spot\" instead of \"Blind Spot\",
   - remove colons and keep `seoTitle` 45-60 chars and `metaDescription` 130-160 chars with focus keyword \"custom plantation shutters calgary\",
   - use the server-side API route `/api/wordpress/update-post-meta`,
   - set `targetEnvironment` to `staging` and populate `stagingVerificationStep` with human approval + read-back verification,
   then obey those exact corrections immediately and accurately!
3. Never use the em dash character in any text.

CANDIDATE HARNESS RULES (from workbench):
" . ( $candidate_harness_override !== '' ? $candidate_harness_override : '(No custom harness rules set by candidate yet)' ) . '

Return ONLY a valid JSON object with this exact shape (no markdown fences):
{
  "reply": "Brief response to the operator explaining what you drafted or updated.",
  "proposedArtifact": {
    "publicBrandName": "string",
    "focusKeyword": "string",
    "seoTitle": "string",
    "metaDescription": "string",
    "executionRoute": "string",
    "targetEnvironment": "string",
    "stagingVerificationStep": "string"
  }
}';
	}

	/**
	 * OpenRouter evaluation of the full submission (15 answers + Project Room steering + anti-bot check).
	 *
	 * @param string              $api_key      OpenRouter API key.
	 * @param array<string,mixed> $candidate    Candidate profile.
	 * @param array<string,mixed> $answers      15 question answers.
	 * @param array<int,mixed>    $chat_history Project Room chat transcript.
	 * @param string              $harness      Candidate harness rules.
	 * @param array<string,mixed> $artifact     Final JSON artifact.
	 * @param array<string,mixed> $validation   Deterministic contract result.
	 * @return array<string,mixed>
	 */
	private static function evaluate_submission_with_openrouter(
		string $api_key,
		array $candidate,
		array $answers,
		array $chat_history,
		string $harness,
		array $artifact,
		array $validation
	): array {
		$system = 'You are the Neo Digital Hiring Evaluator for the NEO Pulse Operator / Developer (Agentic SEO & AISEO) role.
Evaluate the candidate submission across three dimensions:
1. Human vs Bot Authenticity (0-100): Did the candidate inspect the Project Room staging context, spot the seeded assistant traps ("Blind Spot" MCC label vs "Shutter Spot", direct wp-json fetch vs "/api/wordpress/update-post-meta", colon in title, missing staging HITL pause), and steer the assistant or harness? Or did they blindly submit the poisoned default / automated bot output?
2. Project Room Harness Score (0-100): Quality of their harness prompt, chat steering turns, and final artifact contract compliance.
3. Written Questions Score (0-100): Accuracy and operator depth across the 15 application questions (human approval before writes, server-side API isolation, fail-fast schema validation over regex hacks, context packing, model routing, staging read-back verification).

Never use the em dash character. Return ONLY valid JSON matching this exact schema:
{
  "overallScore": 85,
  "humanAuthenticityScore": 90,
  "projectRoomScore": 88,
  "writtenQuestionsScore": 80,
  "classification": "strong_human_operator | needs_review | suspected_unsteered_bot",
  "caughtSeededFlaws": true,
  "summary": "2-3 sentences summarizing strengths and any gaps.",
  "strengths": ["bullet 1", "bullet 2"],
  "risks": ["bullet 1"]
}';

		$user_payload = wp_json_encode(
			array(
				'candidateName'         => $candidate['name'] ?? '',
				'projectRoomValidation' => $validation,
				'projectRoomTurnCount'  => count( $chat_history ),
				'projectRoomChat'       => $chat_history,
				'candidateHarnessRules' => $harness,
				'finalArtifact'         => $artifact,
				'answers'               => $answers,
			),
			JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES
		);

		$raw = self::openrouter_request(
			$api_key,
			self::DEFAULT_MODEL,
			array(
				array( 'role' => 'system', 'content' => $system ),
				array( 'role' => 'user', 'content' => "Evaluate this candidate submission:\n" . $user_payload ),
			),
			0.2,
			2000
		);

		$decoded = self::decode_json_response( $raw );
		if ( ! isset( $decoded['overallScore'], $decoded['classification'], $decoded['summary'] ) ) {
			throw new Exception( 'Evaluator response missing required scorecard fields.' );
		}
		return $decoded;
	}

	/**
	 * @param string                        $api_key     OpenRouter key.
	 * @param string                        $model       Model slug.
	 * @param array<int,array<string,mixed>> $messages    Chat messages.
	 * @param float                         $temperature Sampling temp.
	 * @param int                           $max_tokens  Max tokens.
	 * @return string
	 */
	private static function openrouter_request(
		string $api_key,
		string $model,
		array $messages,
		float $temperature,
		int $max_tokens
	): string {
		$response = wp_remote_post(
			self::OPENROUTER_URL,
			array(
				'timeout' => 90,
				'headers' => Neo_Pulse_App_Openrouter_Attribution::request_headers( $api_key ),
				'body'    => wp_json_encode(
					array(
						'model'           => $model,
						'messages'        => $messages,
						'temperature'     => $temperature,
						'max_tokens'      => $max_tokens,
						'response_format' => array( 'type' => 'json_object' ),
					)
				),
			)
		);

		if ( is_wp_error( $response ) ) {
			throw new Exception( $response->get_error_message() );
		}
		$code = (int) wp_remote_retrieve_response_code( $response );
		$json = json_decode( wp_remote_retrieve_body( $response ), true );
		if ( $code < 200 || $code >= 300 ) {
			$msg = is_array( $json )
				? (string) ( $json['error']['message'] ?? $json['message'] ?? wp_remote_retrieve_response_message( $response ) )
				: 'OpenRouter HTTP ' . $code;
			throw new Exception( 'OpenRouter ' . $code . ': ' . $msg );
		}
		$content = trim( (string) ( $json['choices'][0]['message']['content'] ?? '' ) );
		if ( $content === '' ) {
			throw new Exception( 'OpenRouter returned empty content.' );
		}
		return $content;
	}

	/**
	 * @param string $raw Raw model string.
	 * @return array<string,mixed>
	 */
	private static function decode_json_response( string $raw ): array {
		$start = strpos( $raw, '{' );
		$end   = strrpos( $raw, '}' );
		$slice = ( false !== $start && false !== $end && $end > $start )
			? substr( $raw, $start, $end - $start + 1 )
			: $raw;
		$data  = json_decode( $slice, true );
		if ( ! is_array( $data ) ) {
			throw new Exception( 'Failed to parse JSON object from OpenRouter.' );
		}
		return $data;
	}

	/**
	 * Simple transient rate limiter keyed by client IP and bucket.
	 */
	private static function check_rate_limit( string $bucket, int $limit, int $window_seconds ): bool {
		$ip  = isset( $_SERVER['REMOTE_ADDR'] ) ? sanitize_text_field( (string) wp_unslash( $_SERVER['REMOTE_ADDR'] ) ) : 'unknown';
		$key = 'np_careers_rl_' . md5( $bucket . '_' . $ip );
		$val = (int) get_transient( $key );
		if ( $val >= $limit ) {
			return false;
		}
		set_transient( $key, $val + 1, $window_seconds );
		return true;
	}
}
