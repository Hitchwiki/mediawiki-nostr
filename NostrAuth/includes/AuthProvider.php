<?php
/**
 * Authentication provider for Nostr
 *
 * @file
 * @ingroup Extensions
 */

namespace NostrAuth;

use User;
use MediaWiki\MediaWikiServices;
use MediaWiki\Logger\LoggerFactory;

class AuthProvider {
	/** @var \Psr\Log\LoggerInterface */
	private $logger;

	public function __construct() {
		$this->logger = LoggerFactory::getInstance( 'NostrAuth' );
	}

	/**
	 * Authenticate a user with Nostr
	 *
	 * @param string $pubkey Public key (hex from NIP-07, or npub bech32)
	 * @param string $challenge Challenge string
	 * @param string $signedEventJson Signed event JSON
	 * @return array ['success' => bool, 'user' => User|null, 'error' => string|null]
	 */
	public function authenticate( string $pubkey, string $challenge, string $signedEventJson ): array {
		// Load utilities
		require_once __DIR__ . '/../../NostrUtils/includes/NostrUtils.php';
		$utils = new \NostrUtils\NostrUtils();

		// Normalize pubkey to x-only hex (32 bytes)
		$pubkeyHex = $utils->normalizePubkeyToHex( $pubkey );
		if ( !$pubkeyHex ) {
			return [
				'success' => false,
				'user' => null,
				'error' => 'Invalid public key format'
			];
		}

		// Parse and verify signed event
		$signedEvent = json_decode( $signedEventJson, true );
		if (
			!$signedEvent ||
			!isset( $signedEvent['id'], $signedEvent['pubkey'], $signedEvent['sig'], $signedEvent['kind'], $signedEvent['created_at'], $signedEvent['content'], $signedEvent['tags'] )
		) {
			return [
				'success' => false,
				'user' => null,
				'error' => 'Invalid signed event'
			];
		}

		// Basic sanity checks
		if ( !is_array( $signedEvent['tags'] ) ) {
			return [
				'success' => false,
				'user' => null,
				'error' => 'Invalid signed event tags'
			];
		}

		// Verify signature
		if ( !$utils->verifySignature( $signedEvent ) ) {
			return [
				'success' => false,
				'user' => null,
				'error' => 'Invalid signature'
			];
		}

		// Verify challenge matches
		if ( $signedEvent['content'] !== $challenge ) {
			return [
				'success' => false,
				'user' => null,
				'error' => 'Challenge mismatch'
			];
		}

		// Verify pubkey matches signed event pubkey
		$signedPubkeyHex = $utils->normalizePubkeyToHex( (string)$signedEvent['pubkey'] );
		if ( !$signedPubkeyHex || strtolower( $pubkeyHex ) !== strtolower( $signedPubkeyHex ) ) {
			return [
				'success' => false,
				'user' => null,
				'error' => 'Public key mismatch'
			];
		}

		// Verify NIP-5 if domain restriction enabled
		global $wgNostrAllowedNIP5Domains;
		if ( $wgNostrAllowedNIP5Domains !== null && is_array( $wgNostrAllowedNIP5Domains ) ) {
			$verifier = new NIP5Verifier();
			$nip5Result = $verifier->verifyNIP5( $pubkeyHex, $wgNostrAllowedNIP5Domains );
			if ( !$nip5Result['verified'] ) {
				return [
					'success' => false,
					'user' => null,
					'error' => $nip5Result['error'] ?? 'NIP-5 verification failed'
				];
			}
		}

		// Find or create user
		$user = $this->findOrCreateUser( $pubkeyHex );

		if ( !$user ) {
			return [
				'success' => false,
				'user' => null,
				'error' => 'Failed to create user account'
			];
		}

		// Store canonical x-only pubkey hex in user preferences
		$user->setOption( 'nostr-pubkey', strtolower( $pubkeyHex ) );
		$user->saveSettings();

		return [
			'success' => true,
			'user' => $user,
			'error' => null
		];
	}

	/**
	 * Find existing user by pubkey hex or create new one
	 *
	 * @param string $pubkeyHex Public key (x-only 32 bytes hex)
	 * @return User|null
	 */
	private function findOrCreateUser( string $pubkeyHex ): ?User {
		$dbr = wfGetDB( DB_REPLICA );

		// Try to find existing user with this pubkey
		$userId = $dbr->selectField(
			'user_properties',
			'up_user',
			[ 'up_property' => 'nostr-pubkey', 'up_value' => strtolower( $pubkeyHex ) ],
			__METHOD__
		);

		if ( $userId ) {
			return User::newFromId( $userId );
		}

		// Create new user
		// Generate username from pubkey (first 16 chars of hex)
		$username = 'Nostr_' . substr( strtolower( $pubkeyHex ), 0, 16 );

		// Check if username exists, append number if needed
		$originalUsername = $username;
		$counter = 1;
		while ( User::idFromName( $username ) !== null ) {
			$username = $originalUsername . '_' . $counter;
			$counter++;
		}

		$user = User::createNew( $username );
		if ( !$user ) {
			return null;
		}

		return $user;
	}
}

