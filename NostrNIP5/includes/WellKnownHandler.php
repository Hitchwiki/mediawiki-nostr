<?php
/**
 * Handler for .well-known/nostr.json requests
 *
 * @file
 * @ingroup Extensions
 */

namespace NostrNIP5;

use WebRequest;
use User;
use MediaWiki\MediaWikiServices;
use MediaWiki\User\UserOptionsLookup;

class WellKnownHandler {
	/**
	 * Build the response for the .well-known/nostr.json request.
	 *
	 * @param WebRequest $request
	 * @return array{status:int,body:array}
	 */
	public function getResponse( WebRequest $request ): array {
		$name = $request->getVal( 'name' );
		
		if ( !$name ) {
			return [ 'status' => 400, 'body' => [ 'error' => 'Missing name parameter' ] ];
		}

		// Sanitize username
		$name = preg_replace( '/[^a-zA-Z0-9_-]/', '', $name );
		if ( empty( $name ) || strlen( $name ) > 50 ) {
			return [ 'status' => 400, 'body' => [ 'error' => 'Invalid name parameter' ] ];
		}

		// Find user
		$user = User::newFromName( $name );
		if ( !$user || !$user->getId() ) {
			// Avoid user enumeration: return empty names object
			return [ 'status' => 200, 'body' => [ 'names' => [] ] ];
		}

		// Get pubkey from user preferences (prefer canonical hex, fallback to old npub field)
		$userOptionsLookup = MediaWikiServices::getInstance()->getUserOptionsLookup();
		$pubkey = $userOptionsLookup->getOption( $user, 'nostr-pubkey' ) 
			?: $userOptionsLookup->getOption( $user, 'nostr-npub' );
		if ( !$pubkey ) {
			// Return empty names object if no pubkey
			return [ 'status' => 200, 'body' => [ 'names' => [] ] ];
		}

		// Normalize to hex
		require_once __DIR__ . '/../../NostrUtils/includes/NostrUtils.php';
		$utils = new \NostrUtils\NostrUtils();
		$hex = $utils->normalizePubkeyToHex( $pubkey );

		if ( !$hex ) {
			return [ 'status' => 200, 'body' => [ 'names' => [] ] ];
		}

		// Return NIP-5 format response
		return [
			'status' => 200,
			'body' => [
				'names' => [
					$name => strtolower( $hex )
				]
			]
		];
	}
}

