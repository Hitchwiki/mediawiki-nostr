<?php
/**
 * User preferences for NostrNIP5
 *
 * @file
 * @ingroup Extensions
 */

namespace NostrNIP5;

use MediaWiki\Preferences\Hook\GetPreferencesHook;
use User;

class UserPreferences implements GetPreferencesHook {
	/**
	 * Add Nostr pubkey preference field (hex or npub).
	 * If another extension already added the preference (e.g. NostrAuth), do not override it.
	 *
	 * @param User $user
	 * @param array &$preferences
	 * @return bool|void
	 */
	public function onGetPreferences( $user, &$preferences ) {
		if ( isset( $preferences['nostr-pubkey'] ) ) {
			return;
		}

		$preferences['nostr-pubkey'] = [
			'type' => 'text',
			'section' => 'nostr/identity',
			'label-message' => 'nostrnip5-pubkey-label',
			'help-message' => 'nostrnip5-pubkey-help',
			'validation-callback' => [ $this, 'validatePubkey' ]
		];
	}

	/**
	 * Validate pubkey format (hex or npub)
	 *
	 * @param string $value
	 * @param array $alldata
	 * @param User $user
	 * @return bool|string True on success, error message on failure
	 */
	public function validatePubkey( $value, $alldata, $user ) {
		if ( empty( $value ) ) {
			return true; // Optional field
		}

		// Accept 64 hex characters (NIP-07 getPublicKey) or npub bech32
		if ( preg_match( '/^[0-9a-f]{64}$/i', $value ) ) {
			return true;
		}

		if ( preg_match( '/^npub1[0-9a-z]+$/i', $value ) ) {
			require_once __DIR__ . '/../../NostrUtils/includes/NostrUtils.php';
			$utils = new \NostrUtils\NostrUtils();
			if ( $utils->npubToHex( $value ) !== null ) {
				return true;
			}
		}

		return wfMessage( 'nostrnip5-pubkey-invalid' )->text();
	}
}

