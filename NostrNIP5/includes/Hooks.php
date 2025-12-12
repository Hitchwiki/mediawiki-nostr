<?php
/**
 * Hook handlers for NostrNIP5
 *
 * @file
 * @ingroup Extensions
 */

namespace NostrNIP5;

use MediaWiki\Hook\BeforeInitializeHook;
use Title;
use WebRequest;

class Hooks implements BeforeInitializeHook {
	/**
	 * Handle .well-known/nostr.json requests
	 *
	 * @param Title $title
	 * @param mixed $unused
	 * @param \OutputPage $output
	 * @param \User $user
	 * @param WebRequest $request
	 * @param \MediaWiki $mediaWiki
	 * @return bool|void
	 */
	public function onBeforeInitialize( $title, $unused, $output, $user, $request, $mediaWiki ) {
		global $wgNostrNIP5Enabled;

		if ( !$wgNostrNIP5Enabled ) {
			return;
		}

		// Check if this is a .well-known/nostr.json request
		// NOTE: Under Apache mod_rewrite, REQUEST_URI may already be rewritten to /index.php.
		// Prefer REDIRECT_URL (original path) when available.
		$path =
			( is_string( $_SERVER['REDIRECT_URL'] ?? null ) ? $_SERVER['REDIRECT_URL'] : null ) ??
			( is_string( $_SERVER['REQUEST_URI'] ?? null ) ? parse_url( $_SERVER['REQUEST_URI'], PHP_URL_PATH ) : null ) ??
			$request->getRequestURL();

		if ( is_string( $path ) && (
			$path === '/.well-known/nostr.json' ||
			strpos( $path, '/.well-known/nostr.json' ) === 0 ||
			strpos( $path, '.well-known/nostr.json' ) !== false
		) ) {
			$handler = new WellKnownHandler();
			$handler->handleRequest( $request );
			return false; // Stop further processing
		}
	}
}

