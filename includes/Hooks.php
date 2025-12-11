<?php
/**
 * Hook handlers for NostrChat
 *
 * @file
 * @ingroup Extensions
 */

namespace NostrChat;

use MediaWiki\Config\Config;
use MediaWiki\Output\Hook\BeforePageDisplayHook;
use MediaWiki\Output\OutputPage;
use MediaWiki\Skin\Skin;

class Hooks implements BeforePageDisplayHook {
	/**
	 * Add chat widget to sidebar
	 *
	 * @param OutputPage $out
	 * @param Skin $skin
	 * @return void
	 */
	public function onBeforePageDisplay( $out, $skin ): void {
		// Always add for testing - remove checks temporarily
		$out->addModules( 'ext.nostrChat' );
		
		$config = $out->getConfig();
		
		// Check if chat is enabled
		$enabled = $config->get( 'NostrChatEnabled' );
		if ( !$enabled ) {
			return;
		}
		
		// Only add to Vector skin (or compatible skins)
		$skinName = $skin->getSkinName();
		if ( $skinName !== 'vector' && $skinName !== 'vector-2022' ) {
			return;
		}
		
		// Add config as data attributes in a script tag (for JS to read)
		$channel = $config->get( 'NostrChatChannel' ) ?: $config->get( 'wgNostrChatChannel' ) ?: 'hitchwiki';
		$relays = $config->get( 'NostrChatRelays' ) ?: $config->get( 'wgNostrChatRelays' ) ?: [ 'wss://relay.trustroots.org', 'wss://relay.nomadwiki.org' ];
		$relaysJson = json_encode( $relays );
		$channelEscaped = htmlspecialchars( $channel, ENT_QUOTES );
		$relaysEscaped = htmlspecialchars( $relaysJson, ENT_QUOTES );
		
		// Add config script tag
		$out->addHTML( 
			'<script type="application/json" id="mw-nostr-chat-config" data-nostr-chat-channel="' . 
			$channelEscaped . '" data-nostr-chat-relays="' . $relaysEscaped . '"></script>'
		);
		
		// Add chat HTML (will be created by JS if not present)
		$out->addHTML( self::getChatHtml( $config ) );
	}
	
	/**
	 * Generate chat widget HTML
	 *
	 * @param Config $config
	 * @return string
	 */
	private static function getChatHtml( Config $config ): string {
		$channel = $config->get( 'NostrChatChannel' );
		$relays = $config->get( 'NostrChatRelays' );
		$relaysJson = json_encode( $relays );
		
		// Escape for HTML attribute
		$channelEscaped = htmlspecialchars( $channel, ENT_QUOTES );
		$relaysEscaped = htmlspecialchars( $relaysJson, ENT_QUOTES );
		
		return <<<HTML
<div id="mw-nostr-chat-trigger" class="mw-nostr-chat-trigger" title="Chat">
	<div class="mw-nostr-chat-icon"></div>
</div>
<div id="mw-nostr-chat-widget" 
     data-channel="{$channelEscaped}" 
     data-relays="{$relaysEscaped}"
     class="mw-nostr-chat-widget-hidden">
</div>
HTML;
	}
}
