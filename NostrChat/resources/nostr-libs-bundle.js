/**
 * Entry point for bundling Nostr libraries
 * This file imports all the libraries needed by NostrChat
 */

// Import NDK main library
// NDK v2 uses default export and named exports
import NDK, { NDKEvent, NDKUser, NDKPrivateKeySigner } from '@nostr-dev-kit/ndk';

// Import crypto utilities
import * as secp256k1 from '@noble/secp256k1';

// Export everything for use in the extension
window.NostrLibs = {
	NDK: NDK,
	NDKEvent: NDKEvent,
	NDKUser: NDKUser,
	NDKPrivateKeySigner: NDKPrivateKeySigner,
	secp256k1: secp256k1
};

// Helper function for generating private keys
if ( secp256k1.utils && secp256k1.utils.randomPrivateKey ) {
	window.NostrLibs.generatePrivateKey = function() {
		const bytes = secp256k1.utils.randomPrivateKey();
		return Array.from( bytes ).map( b => b.toString( 16 ).padStart( 2, '0' ) ).join( '' );
	};
} else {
	// Fallback to Web Crypto API
	window.NostrLibs.generatePrivateKey = function() {
		const bytes = new Uint8Array( 32 );
		crypto.getRandomValues( bytes );
		return Array.from( bytes ).map( b => b.toString( 16 ).padStart( 2, '0' ) ).join( '' );
	};
}

// Dispatch event when libraries are loaded
window.dispatchEvent( new CustomEvent( 'nostrLibsReady', {
	detail: { source: 'bundled' }
} ) );

