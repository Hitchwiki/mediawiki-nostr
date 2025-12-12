/**
 * Entry point for bundling bech32 library
 * This file imports @scure/base for bech32 encoding/decoding
 */

import * as bech32 from '@scure/base';

// Export for use in the extension
window.Bech32Lib = bech32;

// Dispatch event when library is loaded
window.dispatchEvent( new CustomEvent( 'bech32LibReady', {
	detail: { source: 'bundled' }
} ) );

