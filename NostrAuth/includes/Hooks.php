<?php
/**
 * Hook handlers for NostrAuth
 *
 * @file
 * @ingroup Extensions
 */

namespace NostrAuth;

use MediaWiki\Output\Hook\BeforePageDisplayHook;
use MediaWiki\Output\OutputPage;
use MediaWiki\Preferences\Hook\GetPreferencesHook;
use MediaWiki\Skin\Skin;
use User;

class Hooks implements GetPreferencesHook, BeforePageDisplayHook {
	/**
	 * Add Nostr pubkey preference field
	 *
	 * @param User $user
	 * @param array &$preferences
	 * @return bool|void
	 */
	public function onGetPreferences( $user, &$preferences ) {
		$preferences['nostr-pubkey'] = [
			'type' => 'text',
			'section' => 'nostr/identity',
			'label-message' => 'nostrauth-pubkey-label',
			'help-message' => 'nostrauth-pubkey-help',
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

		return wfMessage( 'nostrauth-pubkey-invalid' )->text();
	}

	/**
	 * Load NIP-07 import module on Preferences page
	 *
	 * @param OutputPage $out
	 * @param Skin $skin
	 * @return void
	 */
	public function onBeforePageDisplay( $out, $skin ): void {
		// Only load on Special:Preferences
		$title = $out->getTitle();
		if ( !$title || !$title->isSpecial( 'Preferences' ) ) {
			return;
		}

		$out->addModules( 'ext.nostrAuth.prefs' );
	}
}

