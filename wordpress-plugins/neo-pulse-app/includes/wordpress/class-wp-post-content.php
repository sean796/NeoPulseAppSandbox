<?php
/**
 * Fetch full post content by ID/slug (POST /get-post-content).
 *
 * @package Neo_Pulse_App
 */

defined( 'ABSPATH' ) || exit;

class Neo_Pulse_App_Wp_Post_Content {

	/** @var array<string,string[]> */
	private static $post_type_cache = array();

	/** @var array<string,string[]> */
	private static $available_types_cache = array();

	/**
	 * @param array<string,mixed> $body Request body.
	 * @return array{0:int,1:array<string,mixed>}
	 */
	public static function get_post_content( $body ) {
		$site_url     = isset( $body['siteUrl'] ) ? (string) $body['siteUrl'] : '';
		$username     = isset( $body['username'] ) ? (string) $body['username'] : '';
		$app_password = isset( $body['appPassword'] ) ? (string) $body['appPassword'] : '';
		$use_plugin   = ! empty( $body['useNeoPulsePluginEndpoint'] ) &&
			in_array( $body['useNeoPulsePluginEndpoint'], array( true, 'true', 1, '1' ), true );

		$post_ids = self::normalize_ids( $body['postIds'] ?? null );
		$slugs    = isset( $body['postSlugs'] ) && is_array( $body['postSlugs'] ) ? $body['postSlugs'] : array();
		$resolved = isset( $body['resolvedObjects'] ) && is_array( $body['resolvedObjects'] ) ? $body['resolvedObjects'] : array();

		if ( $site_url === '' || $username === '' || $app_password === '' ) {
			return array( 400, array( 'error' => 'Missing required fields: siteUrl, username, appPassword' ) );
		}
		if ( ! $post_ids && ! $slugs && ! $resolved ) {
			return array( 400, array( 'error' => 'Must provide either postIds, postSlugs, or resolvedObjects array' ) );
		}

		$normalized = Neo_Pulse_App_Wp_Url_Normalize::normalize_url( $site_url );

		if ( $use_plugin ) {
			return self::fetch_via_plugin( $normalized, $username, $app_password, $resolved, $post_ids, $slugs );
		}

		$entity_sm   = isset( $body['entitySitemapUrl'] ) ? $body['entitySitemapUrl'] : null;
		$hints       = isset( $body['restEndpointHints'] ) && is_array( $body['restEndpointHints'] ) ? $body['restEndpointHints'] : array();
		$hint_sm     = Neo_Pulse_App_Wp_Url_Normalize::endpoint_from_entity_sitemap_url( $entity_sm );
		$available   = self::discover_post_types( $normalized, $username, $app_password );
		$ordered     = array_values( array_unique( array_filter( array_merge( array( $hint_sm ), $hints, $available ) ) ) );
		if ( ! $ordered ) {
			$ordered = array( 'posts', 'pages' );
		}

		$posts  = array();
		$errors = array();
		$queue  = array_merge(
			$resolved,
			array_map(
				static function ( $id ) {
					return array( 'id' => $id, 'subtype' => 'post' );
				},
				$post_ids
			)
		);

		foreach ( $queue as $obj ) {
			if ( ! is_array( $obj ) ) {
				continue;
			}
			$id = isset( $obj['id'] ) ? (int) $obj['id'] : 0;
			if ( $id <= 0 ) {
				$errors[] = array( 'resolvedObject' => $obj, 'error' => 'Missing id in resolved object' );
				continue;
			}
			$row = self::fetch_post_by_id( $normalized, $username, $app_password, $id, $obj, $ordered );
			if ( ! empty( $row['error'] ) ) {
				$errors[] = array( 'resolvedObject' => $obj, 'error' => $row['error'] );
			} elseif ( ! empty( $row['post'] ) ) {
				$posts[] = $row['post'];
			}
		}

		foreach ( $slugs as $slug ) {
			$slug = (string) $slug;
			$found = self::fetch_post_by_slug( $normalized, $username, $app_password, $slug, $ordered );
			if ( $found ) {
				$posts[] = $found;
			} else {
				$errors[] = array( 'slug' => $slug, 'error' => 'No post or page found with slug "' . $slug . '" in any type' );
			}
		}

		$payload = array(
			'count' => count( $posts ),
			'posts' => $posts,
		);
		if ( $errors ) {
			$payload['errors'] = $errors;
		}
		return array( 200, $payload );
	}

	/**
	 * @param mixed $raw Raw postIds.
	 * @return int[]
	 */
	private static function normalize_ids( $raw ) {
		if ( is_array( $raw ) ) {
			$out = array();
			foreach ( $raw as $id ) {
				$n = (int) $id;
				if ( $n > 0 ) {
					$out[] = $n;
				}
			}
			return $out;
		}
		if ( $raw !== null && $raw !== '' ) {
			$n = (int) $raw;
			return $n > 0 ? array( $n ) : array();
		}
		return array();
	}

	/**
	 * @param string              $normalized Site URL.
	 * @param string              $username User.
	 * @param string              $app_password Password.
	 * @param array<int,array>    $resolved Resolved objects.
	 * @param int[]               $post_ids IDs.
	 * @param string[]            $slugs Slugs.
	 * @return array{0:int,1:array<string,mixed>}
	 */
	private static function fetch_via_plugin( $normalized, $username, $app_password, $resolved, $post_ids, $slugs ) {
		$queue = array_merge(
			$resolved,
			array_map(
				static function ( $id ) {
					return array( 'id' => $id, 'subtype' => 'post' );
				},
				$post_ids
			)
		);
		if ( $slugs && ! $queue ) {
			return array( 400, array( 'error' => 'useNeoPulsePluginEndpoint requires post IDs, not slugs only.' ) );
		}
		if ( ! $queue ) {
			return array( 400, array( 'error' => 'useNeoPulsePluginEndpoint requires at least one post ID.' ) );
		}

		$posts  = array();
		$errors = array();
		foreach ( $queue as $obj ) {
			$id = isset( $obj['id'] ) ? (int) $obj['id'] : 0;
			if ( $id <= 0 ) {
				$errors[] = array( 'resolvedObject' => $obj, 'error' => 'Missing id' );
				continue;
			}
			$resp = Neo_Pulse_App_Wp_Rest_Client::request(
				'GET',
				$normalized . '/wp-json/neo-pulse/v1/post-content/' . $id,
				$username,
				$app_password,
				array(
					'timeout'      => 25,
					'content_type' => false,
				)
			);
			if ( $resp['is_wp_error'] ) {
				$errors[] = array( 'resolvedObject' => $obj, 'error' => $resp['error'] );
				continue;
			}
			$st = (int) $resp['status'];
			if ( $st === 401 ) {
				$errors[] = array( 'resolvedObject' => $obj, 'error' => 'Authentication failed.' );
				continue;
			}
			if ( $st === 403 ) {
				$errors[] = array( 'resolvedObject' => $obj, 'error' => 'Permission denied.' );
				continue;
			}
			if ( $st === 404 ) {
				$errors[] = array( 'resolvedObject' => $obj, 'error' => 'Post not found at NEO Pulse plugin REST route (ID ' . $id . ').' );
				continue;
			}
			if ( $st !== 200 || ! is_array( $resp['body'] ) || empty( $resp['body']['id'] ) ) {
				$errors[] = array( 'resolvedObject' => $obj, 'error' => 'Plugin route returned HTTP ' . $st );
				continue;
			}
			$d       = $resp['body'];
			$posts[] = array(
				'id'               => (int) $d['id'],
				'slug'             => (string) ( $d['slug'] ?? '' ),
				'title'            => is_string( $d['title'] ?? null ) ? $d['title'] : Neo_Pulse_App_Wp_Url_Normalize::rendered_text( $d['title'] ?? '' ),
				'content'          => is_string( $d['content'] ?? null ) ? $d['content'] : Neo_Pulse_App_Wp_Url_Normalize::rendered_text( $d['content'] ?? '' ),
				'excerpt'          => is_string( $d['excerpt'] ?? null ) ? $d['excerpt'] : Neo_Pulse_App_Wp_Url_Normalize::rendered_text( $d['excerpt'] ?? '' ),
				'date_gmt'         => (string) ( $d['date_gmt'] ?? $d['date'] ?? '' ),
				'status'           => (string) ( $d['status'] ?? 'publish' ),
				'link'             => (string) ( $d['link'] ?? '' ),
				'categories'       => isset( $d['categories'] ) && is_array( $d['categories'] ) ? $d['categories'] : array(),
				'tags'             => isset( $d['tags'] ) && is_array( $d['tags'] ) ? $d['tags'] : array(),
				'postTypeEndpoint' => (string) ( $d['postTypeEndpoint'] ?? 'neo-pulse_plugin' ),
				'postTypeSubtype'  => (string) ( $d['postTypeSubtype'] ?? 'post' ),
				'fullData'         => isset( $d['fullData'] ) ? $d['fullData'] : $d,
			);
		}

		$payload = array( 'count' => count( $posts ), 'posts' => $posts );
		if ( $errors ) {
			$payload['errors'] = $errors;
		}
		return array( 200, $payload );
	}

	/**
	 * @param string   $normalized Site URL.
	 * @param string   $username User.
	 * @param string   $app_password Password.
	 * @return string[]
	 */
	private static function discover_post_types( $normalized, $username, $app_password ) {
		if ( isset( self::$available_types_cache[ $normalized ] ) && self::$available_types_cache[ $normalized ] ) {
			return self::$available_types_cache[ $normalized ];
		}
		$system = array(
			'attachment', 'revision', 'nav_menu_item', 'custom_css', 'customize_changeset',
			'oembed_cache', 'user_request', 'wp_block', 'templates', 'template-parts',
			'global-styles', 'navigation', 'font-families', 'elementor_library', 'elementor_snippet',
		);
		$resp = Neo_Pulse_App_Wp_Rest_Client::request(
			'GET',
			$normalized . '/wp-json/wp/v2/types',
			$username,
			$app_password,
			array( 'timeout' => 25 )
		);
		$out = array( 'posts', 'pages' );
		if ( ! $resp['is_wp_error'] && (int) $resp['status'] === 200 && is_array( $resp['body'] ) ) {
			$filtered = array();
			foreach ( array_keys( $resp['body'] ) as $type ) {
				if ( in_array( $type, $system, true ) ) {
					continue;
				}
				$info     = $resp['body'][ $type ];
				$rest_base = is_array( $info ) && ! empty( $info['rest_base'] ) ? (string) $info['rest_base'] : (string) $type;
				if ( strpos( $rest_base, '(' ) !== false || strpos( $rest_base, '?P<' ) !== false ) {
					continue;
				}
				$filtered[] = $rest_base;
			}
			if ( $filtered ) {
				$out = array_values( array_unique( $filtered ) );
			}
		}
		self::$available_types_cache[ $normalized ] = $out;
		return $out;
	}

	/**
	 * @param string              $normalized Site URL.
	 * @param string              $username User.
	 * @param string              $app_password Password.
	 * @param int                 $id Post ID.
	 * @param array<string,mixed> $obj Resolved object.
	 * @param string[]            $types Endpoints to try.
	 * @return array{post?:array<string,mixed>,error?:string}
	 */
	private static function fetch_post_by_id( $normalized, $username, $app_password, $id, $obj, $types ) {
		$cache_key = $normalized . ':' . $id;
		if ( isset( self::$post_type_cache[ $cache_key ] ) ) {
			$cached = self::$post_type_cache[ $cache_key ];
			$row    = self::get_single( $normalized, $username, $app_password, $cached, $id );
			if ( $row ) {
				return array( 'post' => $row );
			}
			unset( self::$post_type_cache[ $cache_key ] );
		}

		$types_for_post = self::limited_types_for_object( $obj, $types );
		foreach ( $types_for_post as $endpoint ) {
			$row = self::get_single( $normalized, $username, $app_password, $endpoint, $id );
			if ( $row ) {
				self::$post_type_cache[ $cache_key ] = $endpoint;
				return array( 'post' => $row );
			}
		}
		return array( 'error' => 'Post with ID ' . $id . ' not found. Tried: ' . implode( ', ', $types_for_post ) );
	}

	/**
	 * @param array<string,mixed> $obj Object.
	 * @param string[]            $types All types.
	 * @return string[]
	 */
	private static function limited_types_for_object( $obj, $types ) {
		$subtype = isset( $obj['subtype'] ) ? strtolower( (string) $obj['subtype'] ) : '';
		if ( $subtype === 'post' ) {
			$hint = 'posts';
		} elseif ( $subtype === 'page' ) {
			$hint = 'pages';
		} elseif ( $subtype !== '' ) {
			$hint = (string) $obj['subtype'];
		} else {
			return $types;
		}
		return array_values( array_unique( array_merge( array( $hint ), array( 'posts', 'pages' ) ) ) );
	}

	/**
	 * @param string $normalized Site URL.
	 * @param string $username User.
	 * @param string $app_password Password.
	 * @param string $endpoint REST collection.
	 * @param int    $id Post ID.
	 * @return array<string,mixed>|null
	 */
	private static function get_single( $normalized, $username, $app_password, $endpoint, $id ) {
		$resp = Neo_Pulse_App_Wp_Rest_Client::request(
			'GET',
			$normalized . '/wp-json/wp/v2/' . rawurlencode( $endpoint ) . '/' . $id,
			$username,
			$app_password,
			array(
				'timeout' => 25,
				'params'  => array(
					'_embed' => 'wp:featuredmedia',
				),
			)
		);
		if ( $resp['is_wp_error'] || (int) $resp['status'] !== 200 || ! is_array( $resp['body'] ) ) {
			return null;
		}
		return self::map_post( $resp['body'], $endpoint, $normalized );
	}

	/**
	 * @param string   $normalized Site URL.
	 * @param string   $username User.
	 * @param string   $app_password Password.
	 * @param string   $slug Slug.
	 * @param string[] $types Endpoints.
	 * @return array<string,mixed>|null
	 */
	private static function fetch_post_by_slug( $normalized, $username, $app_password, $slug, $types ) {
		foreach ( $types as $endpoint ) {
			$resp = Neo_Pulse_App_Wp_Rest_Client::request(
				'GET',
				$normalized . '/wp-json/wp/v2/' . rawurlencode( $endpoint ),
				$username,
				$app_password,
				array(
					'timeout' => 15,
					'params'  => array( 'slug' => $slug ),
				)
			);
			if ( $resp['is_wp_error'] || (int) $resp['status'] !== 200 || ! is_array( $resp['body'] ) || ! $resp['body'] ) {
				continue;
			}
			$post = $resp['body'][0];
			if ( is_array( $post ) ) {
				return self::map_post( $post, $endpoint, $normalized );
			}
		}
		return null;
	}

	/**
	 * @param array<string,mixed> $post Raw WP post.
	 * @param string              $endpoint Endpoint used.
	 * @param string              $normalized Site URL.
	 * @return array<string,mixed>
	 */
	private static function map_post( $post, $endpoint, $normalized ) {
		$subtype = $endpoint === 'posts' ? 'post' : ( $endpoint === 'pages' ? 'page' : $endpoint );
		$featured_url = '';
		$embedded     = isset( $post['_embedded']['wp:featuredmedia'] ) ? $post['_embedded']['wp:featuredmedia'] : null;
		if ( is_array( $embedded ) && isset( $embedded[0] ) && is_array( $embedded[0] ) ) {
			$candidate = (string) ( $embedded[0]['source_url'] ?? '' );
			if ( strpos( $candidate, 'http' ) === 0 ) {
				$featured_url = $candidate;
			}
		}
		return array(
			'id'               => (int) ( $post['id'] ?? 0 ),
			'slug'             => (string) ( $post['slug'] ?? '' ),
			'title'            => Neo_Pulse_App_Wp_Url_Normalize::rendered_text( $post['title'] ?? '' ),
			'content'          => Neo_Pulse_App_Wp_Url_Normalize::rendered_text( $post['content'] ?? '' ),
			'excerpt'          => Neo_Pulse_App_Wp_Url_Normalize::rendered_text( $post['excerpt'] ?? '' ),
			'date_gmt'         => (string) ( $post['date_gmt'] ?? $post['date'] ?? '' ),
			'status'           => (string) ( $post['status'] ?? 'publish' ),
			'link'             => (string) ( $post['link'] ?? ( $normalized . '/' . ( $post['slug'] ?? '' ) ) ),
			'categories'       => isset( $post['categories'] ) && is_array( $post['categories'] ) ? $post['categories'] : array(),
			'tags'             => isset( $post['tags'] ) && is_array( $post['tags'] ) ? $post['tags'] : array(),
			'postTypeEndpoint' => $endpoint,
			'postTypeSubtype'  => $subtype,
			'featuredImageUrl' => $featured_url,
			'fullData'         => $post,
		);
	}
}
