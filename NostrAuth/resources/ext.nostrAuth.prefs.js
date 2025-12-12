/**
 * Client-side NIP-07 integration for Nostr Public Key preference field
 */
( function () {
	'use strict';

	// Cache for bech32 library
	let bech32Lib = null;

	/**
	 * Load bech32 library from bundled resources
	 *
	 * @return {Promise<Object>}
	 */
	async function loadBech32() {
		if ( bech32Lib ) {
			return bech32Lib;
		}
		
		// Wait for bundled library to be loaded
		return new Promise( function ( resolve, reject ) {
			function waitForLib() {
				if ( window.Bech32Lib ) {
					bech32Lib = window.Bech32Lib;
					resolve( bech32Lib );
				} else {
					// Wait for the bech32LibReady event
					window.addEventListener( 'bech32LibReady', function () {
						if ( window.Bech32Lib ) {
							bech32Lib = window.Bech32Lib;
							resolve( bech32Lib );
						} else {
							reject( new Error( 'Bech32 library not found after ready event' ) );
						}
					}, { once: true } );
					
					// Timeout after 3 seconds
					setTimeout( function () {
						if ( !bech32Lib ) {
							console.error( 'NostrAuth: Timeout waiting for bech32 library' );
							reject( new Error( 'Timeout waiting for bundled bech32 library' ) );
						}
					}, 3000 );
				}
			}
			
			// Check immediately in case library is already loaded
			if ( window.Bech32Lib ) {
				bech32Lib = window.Bech32Lib;
				resolve( bech32Lib );
			} else {
				waitForLib();
			}
		} ).catch( function ( error ) {
			console.error( 'NostrAuth: Failed to load bech32 library:', error );
			return null;
		} );
	}

	/**
	 * Convert hex public key to npub (bech32 encoding)
	 *
	 * @param {string} hexPubkey 64-character hex string
	 * @return {Promise<string|null>} npub bech32 string or null on failure
	 */
	async function hexToNpub( hexPubkey ) {
		if ( !/^[0-9a-f]{64}$/i.test( hexPubkey ) ) {
			return null;
		}

		const bech32 = await loadBech32();
		if ( !bech32 ) {
			return null;
		}

		try {
			// Convert hex to bytes (Uint8Array)
			const bytes = new Uint8Array( 32 );
			for ( let i = 0; i < 32; i++ ) {
				bytes[i] = parseInt( hexPubkey.substr( i * 2, 2 ), 16 );
			}

			// Encode to bech32 with 'npub' prefix
			return bech32.bech32Encode( 'npub', bech32.bytesToWords( bytes ) );
		} catch ( error ) {
			console.error( 'NostrAuth: Failed to convert hex to npub:', error );
			return null;
		}
	}

	function addImportButton() {
		console.log( 'NostrAuth: Attempting to find nostr-pubkey field...' );
		
		// Try multiple selectors to find the field
		let $pubkeyField = $( '#mw-input-nostr-pubkey' );
		console.log( 'NostrAuth: Tried #mw-input-nostr-pubkey, found:', $pubkeyField.length );
		
		if ( !$pubkeyField.length ) {
			// Try alternative selector (OOUI might use different structure)
			$pubkeyField = $( 'input[name="wpnostr-pubkey"]' );
			console.log( 'NostrAuth: Tried input[name="wpnostr-pubkey"], found:', $pubkeyField.length );
		}
		if ( !$pubkeyField.length ) {
			// Try OOUI input widget
			$pubkeyField = $( '.oo-ui-inputWidget-input[name="wpnostr-pubkey"]' );
			console.log( 'NostrAuth: Tried OOUI input, found:', $pubkeyField.length );
		}
		if ( !$pubkeyField.length ) {
			// Try finding by name attribute with various prefixes
			$pubkeyField = $( 'input[name*="nostr-pubkey"]' );
			console.log( 'NostrAuth: Tried input[name*="nostr-pubkey"], found:', $pubkeyField.length );
		}
		if ( !$pubkeyField.length ) {
			// Try finding by data attribute
			$pubkeyField = $( 'input[data-name="nostr-pubkey"]' );
			console.log( 'NostrAuth: Tried input[data-name="nostr-pubkey"], found:', $pubkeyField.length );
		}
		if ( !$pubkeyField.length ) {
			// Debug: log all input fields to see what's available
			console.log( 'NostrAuth: All input fields on page:', $( 'input[type="text"]' ).map( function() {
				return $( this ).attr( 'name' ) || $( this ).attr( 'id' ) || 'unnamed';
			} ).get() );
			console.log( 'NostrAuth: Could not find nostr-pubkey field' );
			return;
		}
		
		console.log( 'NostrAuth: Found field:', $pubkeyField.attr( 'name' ) || $pubkeyField.attr( 'id' ) );

		// Check if button already exists
		if ( $pubkeyField.siblings( '.mw-nostr-import-button' ).length ) {
			return; // Already added
		}

		// Check if Nostr extension is available
		if ( typeof window.nostr === 'undefined' ) {
			console.log( 'NostrAuth: NIP-07 extension not detected' );
			return; // No extension, no import button
		}

		console.log( 'NostrAuth: Adding import button for NIP-07 extension' );

		// Create import button
		const $importButton = $( '<button>' )
			.attr( 'type', 'button' )
			.addClass( 'mw-htmlform-submit mw-ui-button mw-ui-primary mw-nostr-import-button' )
			.text( mw.msg( 'nostrauth-import-pubkey-button' ) || 'Import from NIP-07 extension' )
			.css( {
				'margin-left': '0.5em',
				'display': 'inline-block'
			} );

		// Add click handler
		$importButton.on( 'click', async function () {
			const $btn = $( this );
			const originalText = $btn.text();
			
			try {
				$btn.prop( 'disabled', true ).text( mw.msg( 'nostrauth-importing' ) || 'Importing...' );

				// NIP-07 getPublicKey returns hex pubkey (64 hex characters)
				const pubkey = await window.nostr.getPublicKey();
				if ( !pubkey ) {
					alert( mw.msg( 'nostrauth-import-failed' ) || 'Failed to get public key from Nostr extension' );
					$btn.prop( 'disabled', false ).text( originalText );
					return;
				}

				// Validate it's hex format (64 chars)
				if ( !/^[0-9a-f]{64}$/i.test( pubkey ) ) {
					alert( mw.msg( 'nostrauth-import-invalid' ) || 'Invalid public key format from extension' );
					$btn.prop( 'disabled', false ).text( originalText );
					return;
				}

				// Convert hex to npub format
				const npub = await hexToNpub( pubkey.toLowerCase() );
				if ( !npub ) {
					alert( mw.msg( 'nostrauth-import-invalid' ) || 'Failed to convert public key to npub format' );
					$btn.prop( 'disabled', false ).text( originalText );
					return;
				}

				// Set the field value (as npub)
				$pubkeyField.val( npub ).trigger( 'change' );

				// Show success feedback
				$btn.text( mw.msg( 'nostrauth-import-success' ) || '✓ Imported' );
				setTimeout( function () {
					$btn.prop( 'disabled', false ).text( originalText );
				}, 2000 );

			} catch ( error ) {
				console.error( 'Nostr import error:', error );
				alert( mw.msg( 'nostrauth-import-error' ) || 'Import failed: ' + error.message );
				$btn.prop( 'disabled', false ).text( originalText );
			}
		} );

		// Insert button after the input field (or its parent container)
		const $fieldContainer = $pubkeyField.closest( '.oo-ui-inputWidget, .mw-htmlform-field, td' );
		if ( $fieldContainer.length ) {
			$fieldContainer.append( $importButton );
		} else {
			$pubkeyField.after( $importButton );
		}

		// Also add a small indicator if extension is detected
		let $helpText = $pubkeyField.siblings( '.mw-htmlform-field-help' ).first();
		if ( !$helpText.length ) {
			$helpText = $pubkeyField.closest( '.oo-ui-fieldLayout' ).find( '.oo-ui-labelElement-label' );
		}
		if ( $helpText.length && !$helpText.find( '.mw-nostr-extension-detected' ).length ) {
			$helpText.append(
				$( '<span>' )
					.addClass( 'mw-nostr-extension-detected' )
					.text( ' ' + ( mw.msg( 'nostrauth-extension-detected' ) || '(NIP-07 extension detected)' ) )
					.css( {
						'color': '#00a000',
						'font-weight': 'normal',
						'font-size': '0.9em'
					} )
			);
		}

		// Handle paste events to convert hex to npub
		$pubkeyField.on( 'paste', async function ( e ) {
			const $field = $( this );
			const originalValue = $field.val();

			// Wait for paste to complete
			setTimeout( async function () {
				const pastedValue = $field.val().trim();

				// Check if it's a 64-char hex string (and not already npub)
				if ( /^[0-9a-f]{64}$/i.test( pastedValue ) && !pastedValue.startsWith( 'npub' ) ) {
					const npub = await hexToNpub( pastedValue.toLowerCase() );
					if ( npub ) {
						$field.val( npub ).trigger( 'change' );
					}
				}
			}, 10 );
		} );

		// Also handle input events for manual typing (in case user types hex)
		let inputTimeout = null;
		$pubkeyField.on( 'input', function () {
			const $field = $( this );
			const currentValue = $field.val().trim();

			// Clear previous timeout
			if ( inputTimeout ) {
				clearTimeout( inputTimeout );
			}

			// Wait a bit after user stops typing
			inputTimeout = setTimeout( async function () {
				// Check if it's a 64-char hex string (and not already npub)
				if ( /^[0-9a-f]{64}$/i.test( currentValue ) && !currentValue.startsWith( 'npub' ) ) {
					const npub = await hexToNpub( currentValue.toLowerCase() );
					if ( npub ) {
						$field.val( npub ).trigger( 'change' );
					}
				}
			}, 500 );
		} );
	}

	// Try multiple approaches to ensure we catch the form when it's ready
	$( function () {
		// Wait a bit for the form to render
		setTimeout( addImportButton, 100 );
		setTimeout( addImportButton, 500 );
		setTimeout( addImportButton, 1000 );
	} );

	// Also listen for htmlform.enhance hook (if it fires)
	mw.hook( 'htmlform.enhance' ).add( function ( $root ) {
		addImportButton();
	} );
}() );

