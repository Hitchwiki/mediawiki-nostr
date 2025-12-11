/**
 * NostrChat - MediaWiki extension
 * Rewritten to use jQuery and OOJS instead of Alpine.js
 */

( function () {
	'use strict';

	mw.hook( 'wikipage.content' ).add( function ( $content ) {
		// Only initialize once
		if ( window.mwNostrChatInitialized ) {
			return;
		}
		window.mwNostrChatInitialized = true;
		initChat();
	} );

	// Also try to initialize on document ready as fallback
	$( function () {
		if ( !window.mwNostrChatInitialized ) {
			window.mwNostrChatInitialized = true;
			initChat();
		}
	} );

	function initChat() {
		console.log( 'NostrChat: Initializing' );

		// Get config from script tag or use defaults
		const configScript = document.getElementById( 'mw-nostr-chat-config' );
		let channel = 'hitchwiki';
		let relays = [ 'wss://relay.trustroots.org', 'wss://relay.nomadwiki.org' ];

		if ( configScript ) {
			channel = configScript.getAttribute( 'data-nostr-chat-channel' ) || channel;
			const relaysJson = configScript.getAttribute( 'data-nostr-chat-relays' );
			try {
				if ( relaysJson ) {
					const parsed = JSON.parse( relaysJson );
					if ( Array.isArray( parsed ) && parsed.length > 0 ) {
						relays = parsed;
					}
				}
			} catch ( e ) {
				console.error( 'NostrChat: Failed to parse relays:', e );
			}
		}

		// Create trigger button
		let $trigger = $( '#mw-nostr-chat-trigger' );
		if ( $trigger.length === 0 ) {
			$trigger = $( '<div>' )
				.attr( 'id', 'mw-nostr-chat-trigger' )
				.addClass( 'mw-nostr-chat-trigger' )
				.attr( 'title', 'Chat' )
				.html( '<div class="mw-nostr-chat-icon"></div>' )
				.appendTo( 'body' );
		}

		// Create widget container
		let $widget = $( '#mw-nostr-chat-widget' );
		if ( $widget.length === 0 ) {
			$widget = $( '<div>' )
				.attr( 'id', 'mw-nostr-chat-widget' )
				.addClass( 'mw-nostr-chat-widget-hidden' )
				.appendTo( 'body' );
		} else {
			$widget.addClass( 'mw-nostr-chat-widget-hidden' );
		}

		// Check if chat was open before
		const chatWasOpen = localStorage.getItem( 'hitchwiki_chat_open' ) === 'true';
		if ( chatWasOpen ) {
			$widget.removeClass( 'mw-nostr-chat-widget-hidden' );
			$trigger.addClass( 'mw-nostr-chat-trigger-active' );
		}

		// Load NDK first, then create chat widget
		loadNDK().then( function () {
			const chatWidget = new NostrChatWidget( {
				channel: channel,
				relays: relays,
				$container: $widget
			} );

			// Handle trigger click
			$trigger.on( 'click', function ( e ) {
				e.stopPropagation();
				const isHidden = $widget.hasClass( 'mw-nostr-chat-widget-hidden' );
				if ( isHidden ) {
					$widget.removeClass( 'mw-nostr-chat-widget-hidden' );
					$trigger.addClass( 'mw-nostr-chat-trigger-active' );
					localStorage.setItem( 'hitchwiki_chat_open', 'true' );
					chatWidget.scrollToBottom();
					// Focus the input field
					setTimeout( function () {
						chatWidget.focusInput();
					}, 100 );
				} else {
					$widget.addClass( 'mw-nostr-chat-widget-hidden' );
					$trigger.removeClass( 'mw-nostr-chat-trigger-active' );
					localStorage.setItem( 'hitchwiki_chat_open', 'false' );
				}
			} );

			// Close chat when clicking outside (but not on links)
			if ( !window.mwNostrChatOutsideClickHandler ) {
				window.mwNostrChatOutsideClickHandler = function ( e ) {
					if ( $widget.hasClass( 'mw-nostr-chat-widget-hidden' ) ) {
						return;
					}

					const isClickOnWidget = $widget[ 0 ].contains( e.target );
					const isClickOnTrigger = $trigger[ 0 ].contains( e.target );
					const isClickOnLink = $( e.target ).closest( 'a' ).length > 0;

					// If clicking on a link, allow navigation (don't prevent default)
					if ( isClickOnLink ) {
						// For hitchwiki.org links, close the chat when navigating
						const $link = $( e.target ).closest( 'a' );
						if ( $link.length && $link.attr( 'href' ) && $link.attr( 'href' ).includes( 'hitchwiki.org' ) ) {
							// Allow the link to navigate, chat will close naturally as page changes
							return;
						}
						// For other links, just allow navigation
						return;
					}

					if ( !isClickOnWidget && !isClickOnTrigger ) {
						$widget.addClass( 'mw-nostr-chat-widget-hidden' );
						$trigger.removeClass( 'mw-nostr-chat-trigger-active' );
						localStorage.setItem( 'hitchwiki_chat_open', 'false' );
					}
				};
				$( document ).on( 'click', window.mwNostrChatOutsideClickHandler );
			}

			// Close chat when pressing ESC key (global handler as fallback)
			if ( !window.mwNostrChatEscHandler ) {
				window.mwNostrChatEscHandler = function ( e ) {
					if ( ( e.key === 'Escape' || e.keyCode === 27 ) &&
						!$widget.hasClass( 'mw-nostr-chat-widget-hidden' ) ) {
						// Don't close if auth dialog is open
						if ( chatWidget.authDialog && chatWidget.authDialog.isVisible() ) {
							return;
						}
						// Don't close if user is typing in an input field elsewhere on the page
						if ( $( e.target ).is( 'input, textarea' ) && !$widget.find( e.target ).length ) {
							return;
						}
						$widget.addClass( 'mw-nostr-chat-widget-hidden' );
						$trigger.removeClass( 'mw-nostr-chat-trigger-active' );
						localStorage.setItem( 'hitchwiki_chat_open', 'false' );
						e.preventDefault();
						e.stopPropagation();
					}
				};
				$( document ).on( 'keydown', window.mwNostrChatEscHandler );
			}

			// Initialize chat if it was open
			if ( chatWasOpen ) {
				setTimeout( function () {
					chatWidget.scrollToBottom();
					chatWidget.focusInput();
				}, 500 );
			}
		} ).catch( function ( error ) {
			console.error( 'NostrChat: Failed to load NDK:', error );
		} );
	}

	function loadNDK() {
		return new Promise( function ( resolve, reject ) {
			if ( window.NDKModule ) {
				resolve();
				return;
			}

			async function loadNDKInternal() {
				try {
					const NDKModule = await import( 'https://esm.sh/@nostr-dev-kit/ndk@latest' );
					const NDK = NDKModule.default;
					let NDKEvent = NDKModule.NDKEvent || NDK?.NDKEvent;
					let NDKUser = NDKModule.NDKUser || NDK?.NDKUser;
					let NDKPrivateKeySigner = NDKModule.NDKPrivateKeySigner || NDK?.NDKPrivateKeySigner;

					if ( !NDKEvent ) {
						try {
							const eventModule = await import( 'https://esm.sh/@nostr-dev-kit/ndk@2.0.0/events' );
							NDKEvent = eventModule.NDKEvent || eventModule.default;
						} catch ( e ) {
							// Fallback failed
						}
					}

					if ( !NDKUser ) {
						try {
							const userModule = await import( 'https://esm.sh/@nostr-dev-kit/ndk@2.0.0/user' );
							NDKUser = userModule.NDKUser || userModule.default;
						} catch ( e ) {
							// Fallback failed
						}
					}

					if ( !NDKPrivateKeySigner ) {
						try {
							const signerModule = await import( 'https://esm.sh/@nostr-dev-kit/ndk@2.0.0/signers/private-key' );
							NDKPrivateKeySigner = signerModule.NDKPrivateKeySigner || signerModule.default;
						} catch ( e ) {
							// Fallback failed
						}
					}

					if ( !NDK || typeof NDK !== 'function' ) {
						throw new Error( 'NDK class not found' );
					}

					let generatePrivateKey = null;
					try {
						const cryptoUtils = await import( 'https://esm.sh/@noble/secp256k1@1.7.1' );
						if ( cryptoUtils && cryptoUtils.utils && cryptoUtils.utils.randomPrivateKey ) {
							generatePrivateKey = function () {
								const bytes = cryptoUtils.utils.randomPrivateKey();
								return Array.from( bytes ).map( b => b.toString( 16 ).padStart( 2, '0' ) ).join( '' );
							};
						}
					} catch ( e ) {
						// Fallback
					}

					if ( !generatePrivateKey ) {
						generatePrivateKey = function () {
							const bytes = new Uint8Array( 32 );
							crypto.getRandomValues( bytes );
							return Array.from( bytes ).map( b => b.toString( 16 ).padStart( 2, '0' ) ).join( '' );
						};
					}

					window.NDK = NDK;
					window.NDKModule = {
						NDK: NDK,
						NDKEvent: NDKEvent,
						NDKUser: NDKUser,
						NDKPrivateKeySigner: NDKPrivateKeySigner,
						generatePrivateKey: generatePrivateKey
					};

					window.dispatchEvent( new CustomEvent( 'ndkReady', {
						detail: { NDK: NDK, source: 'CDN (esm.sh)' }
					} ) );

					resolve();
				} catch ( error ) {
					console.error( 'Failed to load NDK:', error );
					reject( error );
				}
			}

			loadNDKInternal();
		} );
	}

	/**
	 * NostrChatWidget - Main chat widget using OOJS
	 */
	function NostrChatWidget( config ) {
		this.channel = config.channel;
		this.relays = config.relays;
		this.$container = config.$container;

		// State
		this.ndk = null;
		this.messages = [];
		this.messageInput = '';
		this.isAuthenticated = false;
		this.currentUserPubkey = null;
		this.currentUserNpub = null;
		this.currentUserPrivateKey = null;
		this.currentUserNsec = null;
		this.currentUserNip05 = null;
		this.usingNip07 = false;
		this.relayStatus = {};
		this.userProfiles = {};
		this.reactions = {};
		this.isLoading = true;
		this.isSending = false;
		this.showPrivateKey = false;
		this.useNip7Checkbox = false;
		this.manualKey = '';
		this.errorMessage = '';
		this.extensionDetected = false;
		this.detectedNostrProvider = null;
		this.authDialog = null;

		this.init();
	}

	NostrChatWidget.prototype.init = function () {
		this.render();
		this.attachEvents();
		this.loadCachedMessages();
		this.loadKeysFromStorage();

		// Initialize relay status
		this.relays.forEach( ( relay ) => {
			this.relayStatus[ relay ] = { status: 'connecting' };
		} );
		this.updateRelayStatus();

		if ( window.NDKModule ) {
			this.initializeNDK();
		} else {
			window.addEventListener( 'ndkReady', () => {
				this.initializeNDK();
			} );

			setTimeout( () => {
				if ( !this.ndk ) {
					this.setErrorMessage( 'Failed to load NDK library. Chat unavailable.' );
					this.isLoading = false;
					this.updateUI();
				}
			}, 5000 );
		}
	};

	NostrChatWidget.prototype.render = function () {
		const $container = this.$container;
		$container.empty().addClass( 'mw-nostr-chat-container' );

		// Header
		const $header = $( '<div>' ).addClass( 'mw-nostr-chat-header' );
		$header.append( $( '<h3>' ).addClass( 'mw-nostr-chat-title' ).text( 'Chat' ) );

		const $status = $( '<div>' ).addClass( 'mw-nostr-chat-status' );
		const $relayStatus = $( '<div>' ).addClass( 'mw-nostr-relay-status' );
		$status.append( $relayStatus );
		$status.append( $( '<button>' )
			.addClass( 'mw-nostr-auth-trigger' )
			.attr( 'title', 'Show key options' )
			.text( '🔑' )
			.on( 'click', () => this.showAuthDialog() ) );
		$status.append( $( '<button>' )
			.addClass( 'mw-nostr-chat-close' )
			.attr( 'title', 'Close chat' )
			.attr( 'aria-label', 'Close chat' )
			.html( '×' )
			.on( 'click', ( e ) => {
				e.stopPropagation();
				this.closeChat();
			} ) );
		$header.append( $status );
		$container.append( $header );

		// Messages container
		this.$messagesContainer = $( '<div>' )
			.addClass( 'mw-nostr-chat-messages' )
			.appendTo( $container );

		// Input area
		const $inputArea = $( '<div>' ).addClass( 'mw-nostr-chat-input-area' );
		this.$messageInput = $( '<textarea>' )
			.addClass( 'mw-nostr-chat-input' )
			.attr( 'placeholder', 'Type your message... (Enter to send, Shift+Enter for new line)' )
			.attr( 'rows', '1' )
			.appendTo( $inputArea );
		$container.append( $inputArea );

		this.updateUI();
	};

	NostrChatWidget.prototype.attachEvents = function () {
		const self = this;

		// Handle ESC key on message input
		this.$messageInput.on( 'keydown', function ( e ) {
			if ( e.key === 'Escape' || e.keyCode === 27 ) {
				e.preventDefault();
				e.stopPropagation();
				self.closeChat();
				return;
			}

			if ( e.key === 'Enter' && !e.shiftKey ) {
				e.preventDefault();
				self.sendMessage();
			}
		} );

		this.$messageInput.on( 'input', function () {
			self.messageInput = self.$messageInput.val();
		} );

		this.$messageInput.on( 'focus', function () {
			self.checkAuthOnFocus();
		} );

		// Handle ESC key on the widget container itself
		// This ensures ESC works when the chat is in focus but input might not be
		this.$container.attr( 'tabindex', '0' ).on( 'keydown', function ( e ) {
			if ( ( e.key === 'Escape' || e.keyCode === 27 ) && !self.$container.hasClass( 'mw-nostr-chat-widget-hidden' ) ) {
				// Don't close if auth dialog is open
				if ( self.authDialog && self.authDialog.isVisible() ) {
					return;
				}
				e.preventDefault();
				e.stopPropagation();
				self.closeChat();
			}
		} );
	};

	NostrChatWidget.prototype.updateUI = function () {
		this.updateRelayStatus();
		this.updateMessages();
		this.updateError();
		this.updateInput();
	};

	NostrChatWidget.prototype.updateRelayStatus = function () {
		const $status = this.$container.find( '.mw-nostr-chat-status .mw-nostr-relay-status' );
		$status.empty();

		if ( this.relays.length > 0 ) {
			this.relays.slice( 0, 2 ).forEach( ( relay ) => {
				const status = this.relayStatus[ relay ]?.status || 'disconnected';
				$( '<div>' )
					.addClass( 'mw-nostr-relay-dot' )
					.addClass( status )
					.attr( 'title', relay )
					.appendTo( $status );
			} );
		}
	};

	NostrChatWidget.prototype.updateMessages = function () {
		const $container = this.$messagesContainer;
		$container.empty();

		if ( this.errorMessage ) {
			$( '<div>' )
				.addClass( 'mw-nostr-error-message' )
				.text( this.errorMessage )
				.appendTo( $container );
		}

		if ( this.messages.length === 0 && !this.isLoading ) {
			$( '<div>' )
				.addClass( 'mw-nostr-loading' )
				.text( 'No messages yet. Be the first to chat!' )
				.appendTo( $container );
		}

		if ( this.isLoading ) {
			$( '<div>' )
				.addClass( 'mw-nostr-loading' )
				.text( 'Loading messages...' )
				.appendTo( $container );
		}

		this.messages.forEach( ( message, index ) => {
			const $wrapper = $( '<div>' ).addClass( 'mw-nostr-message-wrapper' );

			// Date separator
			if ( this.isNewDay( index ) ) {
				$( '<div>' )
					.addClass( 'mw-nostr-date-separator' )
					.append( $( '<span>' ).text( this.formatDate( message.created_at ) ) )
					.appendTo( $wrapper );
			}

			// Message
			const $message = $( '<div>' )
				.addClass( 'mw-nostr-message' )
				.toggleClass( 'mw-nostr-message-new-user', !this.isSameUserAsPrevious( index ) );

			if ( this.shouldShowTime( index ) ) {
				$( '<span>' )
					.addClass( 'mw-nostr-message-time' )
					.text( this.formatTime( message.created_at ) )
					.appendTo( $message );
			}

			if ( !this.isSameUserAsPrevious( index ) ) {
				$( '<span>' )
					.addClass( 'mw-nostr-message-username' )
					.text( this.getUsername( message.pubkey ) )
					.appendTo( $message );
			}

			$( '<span>' )
				.addClass( 'mw-nostr-message-content' )
				.html( this.formatMessageContent( message.content ) )
				.appendTo( $message );

			if ( this.isAuthenticated ) {
				const $actions = $( '<span>' ).addClass( 'mw-nostr-message-actions' );
				if ( message.pubkey !== this.currentUserPubkey ) {
					const reactionCount = this.getReactionCount( message.id, '👍' );
					$( '<span>' )
						.addClass( 'mw-nostr-message-action' )
						.html( '👍' + ( reactionCount ? '<span class="mw-nostr-reaction-count">' + reactionCount + '</span>' : '' ) )
						.on( 'click', () => this.reactToMessage( message.id, '👍' ) )
						.appendTo( $actions );
				}
				if ( message.pubkey === this.currentUserPubkey ) {
					$( '<span>' )
						.addClass( 'mw-nostr-message-action' )
						.text( '×' )
						.on( 'click', () => this.deleteMessage( message.id ) )
						.appendTo( $actions );
				}
				$message.append( $actions );
			}

			$wrapper.append( $message );
			$container.append( $wrapper );
		} );

		this.scrollToBottom();
	};

	NostrChatWidget.prototype.updateError = function () {
		// Error is shown in updateMessages
	};

	NostrChatWidget.prototype.updateInput = function () {
		this.$messageInput.val( this.messageInput );
	};

	NostrChatWidget.prototype.setErrorMessage = function ( message ) {
		this.errorMessage = message;
		this.updateUI();
		if ( message ) {
			setTimeout( () => {
				this.errorMessage = '';
				this.updateUI();
			}, 5000 );
		}
	};

	NostrChatWidget.prototype.scrollToBottom = function () {
		setTimeout( () => {
			if ( this.$messagesContainer.length ) {
				this.$messagesContainer[ 0 ].scrollTop = this.$messagesContainer[ 0 ].scrollHeight;
			}
		}, 100 );
	};

	NostrChatWidget.prototype.focusInput = function () {
		if ( this.$messageInput && this.$messageInput.length ) {
			setTimeout( () => {
				this.$messageInput[ 0 ].focus();
			}, 150 );
		}
	};

	NostrChatWidget.prototype.closeChat = function () {
		const $widget = $( '#mw-nostr-chat-widget' );
		const $trigger = $( '#mw-nostr-chat-trigger' );
		$widget.addClass( 'mw-nostr-chat-widget-hidden' );
		$trigger.removeClass( 'mw-nostr-chat-trigger-active' );
		localStorage.setItem( 'hitchwiki_chat_open', 'false' );
	};

	NostrChatWidget.prototype.showAuthDialog = function () {
		if ( this.authDialog ) {
			this.authDialog.open();
			return;
		}

		const dialog = new NostrAuthDialog( {
			chatWidget: this
		} );
		this.authDialog = dialog;
		dialog.open();
	};

	// Continue with NDK initialization and message handling methods...
	// (This is getting long, so I'll continue in the next part)

	NostrChatWidget.prototype.initializeNDK = async function () {
		try {
			if ( !window.NDKModule ) {
				throw new Error( 'NDK not available' );
			}

			const NDKClass = window.NDKModule.NDK;
			if ( typeof NDKClass !== 'function' ) {
				throw new Error( 'NDK class is not a constructor' );
			}

			if ( !this.relays || this.relays.length === 0 ) {
				throw new Error( 'No relays configured' );
			}

			try {
				this.ndk = new NDKClass( {
					explicitRelayUrls: this.relays
				} );
			} catch ( e ) {
				this.ndk = new NDKClass( {
					relays: this.relays
				} );
			}

			if ( this.ndk && this.ndk.addExplicitRelay ) {
				this.relays.forEach( ( relayUrl ) => {
					try {
						this.ndk.addExplicitRelay( relayUrl );
					} catch ( e ) {
						// Could not add relay
					}
				} );
			}

			await this.ndk.connect();

			if ( this.ndk.pool ) {
				this.ndk.pool.on( 'relay:connect', ( relay ) => {
					const relayUrl = relay.url || relay;
					if ( this.relays.includes( relayUrl ) ) {
						this.relayStatus[ relayUrl ] = { status: 'connected' };
						this.updateRelayStatus();
					}
				} );

				this.ndk.pool.on( 'relay:disconnect', ( relay ) => {
					const relayUrl = relay.url || relay;
					if ( this.relays.includes( relayUrl ) ) {
						this.relayStatus[ relayUrl ] = { status: 'disconnected' };
						this.updateRelayStatus();
					}
				} );
			}

			await new Promise( resolve => setTimeout( resolve, 1500 ) );
			this.startSubscriptions();

			if ( this.currentUserPrivateKey ) {
				await this.setupSigner();
			}

			if ( this.currentUserPubkey && !this.currentUserNpub ) {
				this.setUserPubkey( this.currentUserPubkey );
			}
		} catch ( error ) {
			console.error( 'NDK init error:', error );
			this.setErrorMessage( 'Failed to connect to relays: ' + error.message );
			this.isLoading = false;
			this.updateUI();
		}
	};

	NostrChatWidget.prototype.startSubscriptions = function () {
		try {
			if ( !this.ndk ) return;

			const messageFilter = {
				kinds: [ 1 ],
				'#t': [ this.channel ],
				limit: 100
			};

			const subscription = this.ndk.subscribe( messageFilter, { closeOnEose: false } );

			subscription.on( 'event', ( event ) => {
				try {
					this.handleMessageEvent( event );
					this.markRelaysConnected();
				} catch ( e ) {
					console.error( 'Error handling message event:', e );
				}
			} );

			subscription.on( 'eose', () => {
				this.isLoading = false;
				this.updateUI();
				this.markRelaysConnected();
			} );

			const profileSubscription = this.ndk.subscribe(
				{ kinds: [ 0 ] },
				{ closeOnEose: true }
			);

			profileSubscription.on( 'event', ( event ) => {
				try {
					this.handleProfileEvent( event );
				} catch ( e ) {
					console.error( 'Error handling profile event:', e );
				}
			} );

			const reactionSubscription = this.ndk.subscribe(
				{ kinds: [ 7 ] },
				{ closeOnEose: false }
			);

			reactionSubscription.on( 'event', ( event ) => {
				try {
					this.handleReactionEvent( event );
				} catch ( e ) {
					console.error( 'Error handling reaction event:', e );
				}
			} );
		} catch ( error ) {
			console.error( 'Subscription error:', error );
			this.setErrorMessage( 'Failed to subscribe to messages: ' + error.message );
			this.isLoading = false;
			this.updateUI();
		}
	};

	NostrChatWidget.prototype.handleMessageEvent = function ( event ) {
		const existingIndex = this.messages.findIndex( m => m.id === event.id );
		if ( existingIndex !== -1 ) {
			if ( this.messages[ existingIndex ].optimistic ) {
				this.messages[ existingIndex ] = {
					id: event.id,
					pubkey: event.pubkey,
					content: event.content,
					created_at: event.created_at,
					tags: event.tags
				};
				this.updateMessages();
			}
			return;
		}

		const tags = event.tags || [];
		const hasTag = tags.some( tag => tag[ 0 ] === 't' && tag[ 1 ] === this.channel );

		if ( !hasTag ) return;

		const message = {
			id: event.id,
			pubkey: event.pubkey,
			content: event.content,
			created_at: event.created_at,
			tags: event.tags
		};

		const insertIndex = this.messages.findIndex( m => m.created_at > event.created_at );
		if ( insertIndex === -1 ) {
			this.messages.push( message );
		} else {
			this.messages.splice( insertIndex, 0, message );
		}

		if ( this.messages.length > 200 ) {
			this.messages = this.messages.slice( -200 );
		}

		this.saveCachedMessages();
		this.updateMessages();
	};

	NostrChatWidget.prototype.handleProfileEvent = function ( event ) {
		try {
			const profile = JSON.parse( event.content );
			this.userProfiles[ event.pubkey ] = {
				name: profile.name || profile.display_name || 'Anonymous',
				picture: profile.picture || '',
				nip05: profile.nip05 || null
			};

			if ( this.currentUserPubkey && event.pubkey === this.currentUserPubkey ) {
				this.currentUserNip05 = profile.nip05 || null;
			}

			// Update messages to show new profile names
			this.updateMessages();
		} catch ( e ) {
			console.error( 'Error parsing profile:', e );
		}
	};

	NostrChatWidget.prototype.handleReactionEvent = function ( event ) {
		try {
			const tags = event.tags || [];
			const eventTag = tags.find( tag => tag[ 0 ] === 'e' );
			if ( !eventTag ) return;

			const eventId = eventTag[ 1 ];
			const content = event.content;

			if ( !this.reactions[ eventId ] ) {
				this.reactions[ eventId ] = {};
			}

			if ( !this.reactions[ eventId ][ content ] ) {
				this.reactions[ eventId ][ content ] = [];
			}

			if ( !this.reactions[ eventId ][ content ].includes( event.pubkey ) ) {
				this.reactions[ eventId ][ content ].push( event.pubkey );
			}

			this.updateMessages();
		} catch ( e ) {
			console.error( 'Error handling reaction:', e );
		}
	};

	NostrChatWidget.prototype.getUsername = function ( pubkey ) {
		if ( this.userProfiles[ pubkey ] ) {
			return this.userProfiles[ pubkey ].name;
		}
		const npub = this.hexToNpub( pubkey );
		return npub.substring( 0, 12 ) + '...';
	};

	NostrChatWidget.prototype.isSameUserAsPrevious = function ( index ) {
		if ( index === 0 ) return false;
		return this.messages[ index ].pubkey === this.messages[ index - 1 ].pubkey;
	};

	NostrChatWidget.prototype.shouldShowTime = function ( index ) {
		if ( index === 0 ) return true;
		const currentMsg = this.messages[ index ];
		const prevMsg = this.messages[ index - 1 ];
		if ( !currentMsg || !prevMsg ) return true;

		if ( currentMsg.pubkey !== prevMsg.pubkey ) return true;

		const timeDiff = currentMsg.created_at - prevMsg.created_at;
		const tenMinutes = 10 * 60;
		return timeDiff > tenMinutes;
	};

	NostrChatWidget.prototype.hexToNpub = function ( hex ) {
		try {
			return 'npub1' + hex.substring( 0, 58 );
		} catch ( e ) {
			return hex.substring( 0, 8 ) + '...';
		}
	};

	NostrChatWidget.prototype.getReactionCount = function ( eventId, emoji ) {
		if ( !this.reactions[ eventId ] || !this.reactions[ eventId ][ emoji ] ) {
			return '';
		}
		const count = this.reactions[ eventId ][ emoji ].length;
		return count > 0 ? count : '';
	};

	NostrChatWidget.prototype.formatTime = function ( timestamp ) {
		const date = new Date( timestamp * 1000 );
		const hours = date.getHours().toString().padStart( 2, '0' );
		const minutes = date.getMinutes().toString().padStart( 2, '0' );
		return `${hours}:${minutes}`;
	};

	NostrChatWidget.prototype.formatDate = function ( timestamp ) {
		const date = new Date( timestamp * 1000 );
		const today = new Date();
		const yesterday = new Date( today );
		yesterday.setDate( yesterday.getDate() - 1 );

		const isToday = date.toDateString() === today.toDateString();
		const isYesterday = date.toDateString() === yesterday.toDateString();

		if ( isToday ) {
			return 'Today';
		} else if ( isYesterday ) {
			return 'Yesterday';
		} else {
			const options = { weekday: 'long', month: 'short', day: 'numeric' };
			return date.toLocaleDateString( 'en-US', options );
		}
	};

	NostrChatWidget.prototype.isNewDay = function ( index ) {
		if ( index === 0 ) return true;
		const currentMsg = this.messages[ index ];
		const prevMsg = this.messages[ index - 1 ];
		if ( !currentMsg || !prevMsg ) return false;

		const currentDate = new Date( currentMsg.created_at * 1000 ).toDateString();
		const prevDate = new Date( prevMsg.created_at * 1000 ).toDateString();
		return currentDate !== prevDate;
	};

	NostrChatWidget.prototype.formatMessageContent = function ( content ) {
		if ( !content ) return '';

		// URL regex - matches http://, https://, or www.
		const urlRegex = /(https?:\/\/[^\s<>"']+|www\.[^\s<>"']+)/gi;
		const parts = [];
		let lastIndex = 0;
		let match;

		// Find all URLs and split the content
		while ( ( match = urlRegex.exec( content ) ) !== null ) {
			// Add text before the URL (escape HTML)
			if ( match.index > lastIndex ) {
				const textBefore = content.substring( lastIndex, match.index );
				parts.push( this.escapeHtml( textBefore ) );
			}

			// Process the URL
			const url = match[ 0 ];
			let fullUrl = url;
			if ( url.startsWith( 'www.' ) ) {
				fullUrl = 'https://' + url;
			}

			// For hitchwiki.org links, show without https://
			let displayText = url;
			if ( url.toLowerCase().includes( 'hitchwiki.org' ) ) {
				displayText = url.replace( /^https?:\/\//i, '' );
			}

			// Create clickable link (escape the URL for href attribute)
			const escapedUrl = this.escapeHtml( fullUrl );
			const escapedDisplay = this.escapeHtml( displayText );
			// Open in same window for hitchwiki.org links, new tab for others
			const target = url.toLowerCase().includes( 'hitchwiki.org' ) ? '_self' : '_blank';
			parts.push( '<a href="' + escapedUrl + '" target="' + target + '" rel="noopener noreferrer" class="mw-nostr-message-link">' + escapedDisplay + '</a>' );

			lastIndex = match.index + url.length;
		}

		// Add remaining text after last URL
		if ( lastIndex < content.length ) {
			parts.push( this.escapeHtml( content.substring( lastIndex ) ) );
		}

		return parts.length > 0 ? parts.join( '' ) : this.escapeHtml( content );
	};

	NostrChatWidget.prototype.escapeHtml = function ( text ) {
		if ( !text ) return '';
		const div = document.createElement( 'div' );
		div.textContent = text;
		return div.innerHTML;
	};

	NostrChatWidget.prototype.checkAuthOnFocus = async function () {
		if ( this.isAuthenticated ) return;

		await new Promise( r => setTimeout( r, 300 ) );
		if ( this.isAuthenticated ) return;

		if ( this.detectNostrExtension() ) {
			const success = await this.authenticateWithExtension();
			if ( success ) {
				return;
			}
		}
	};

	NostrChatWidget.prototype.sendMessage = async function () {
		if ( !this.isAuthenticated ) {
			if ( this.detectNostrExtension() ) {
				const success = await this.authenticateWithExtension();
				if ( !success ) {
					this.showAuthDialog();
					return;
				}
			} else {
				this.showAuthDialog();
				return;
			}
		}

		if ( !this.messageInput.trim() || !this.ndk || !this.ndk.signer ) {
			if ( !this.ndk || !this.ndk.signer ) {
				if ( this.usingNip07 || this.useNip7Checkbox ) {
					await this.setupSigner();
					if ( this.ndk && this.ndk.signer ) {
						// Continue
					} else {
						this.setErrorMessage( 'Extension signer not available. Please reconnect.' );
						return;
					}
				} else {
					this.setErrorMessage( 'Not connected. Please wait or refresh.' );
					return;
				}
			} else {
				return;
			}
		}

		try {
			this.isSending = true;

			if ( this.usingNip07 || this.useNip7Checkbox ) {
				await this.setupSigner();
				if ( !this.ndk.signer ) {
					throw new Error( 'Extension signer not available' );
				}
			}

			const messageContent = this.messageInput.trim();
			const NDKEvent = window.NDKModule?.NDKEvent;
			if ( !NDKEvent ) {
				throw new Error( 'NDKEvent not available' );
			}

			const expirationTimestamp = Math.floor( ( Date.now() + ( 30 * 24 * 60 * 60 * 1000 ) ) / 1000 );

			const event = new NDKEvent( this.ndk );
			event.kind = 1;
			event.content = messageContent;
			event.tags = [ [ 't', this.channel ] ];
			event.tags.push( [ 'expiration', expirationTimestamp.toString() ] );

			await event.sign();

			const eventId = event.id;

			const optimisticMessage = {
				id: eventId,
				pubkey: this.currentUserPubkey,
				content: messageContent,
				created_at: Math.floor( Date.now() / 1000 ),
				tags: event.tags,
				optimistic: true
			};

			const insertIndex = this.messages.findIndex( m => m.created_at > optimisticMessage.created_at );
			if ( insertIndex === -1 ) {
				this.messages.push( optimisticMessage );
			} else {
				this.messages.splice( insertIndex, 0, optimisticMessage );
			}

			this.updateMessages();
			this.messageInput = '';
			this.$messageInput.val( '' );

			await this.publishToOurRelays( event );

			if ( eventId ) {
				const messageIndex = this.messages.findIndex( m => m.id === eventId );
				if ( messageIndex !== -1 && this.messages[ messageIndex ].optimistic ) {
					this.messages[ messageIndex ].optimistic = false;
					this.updateMessages();
				}
			}
		} catch ( error ) {
			console.error( 'Send error:', error.message );
			this.setErrorMessage( 'Failed to send message: ' + error.message );
		} finally {
			this.isSending = false;
		}
	};

	NostrChatWidget.prototype.reactToMessage = async function ( eventId, emoji ) {
		if ( !this.isAuthenticated || !this.ndk || !this.ndk.signer ) return;

		try {
			const NDKEvent = window.NDKModule?.NDKEvent;
			if ( !NDKEvent ) return;

			const event = new NDKEvent( this.ndk );
			event.kind = 7;
			event.content = emoji;
			event.tags = [ [ 'e', eventId ] ];

			await event.sign();
			await this.publishToOurRelays( event );
		} catch ( error ) {
			console.error( 'Reaction error:', error );
		}
	};

	NostrChatWidget.prototype.deleteMessage = async function ( eventId ) {
		if ( !this.isAuthenticated || !this.ndk || !this.ndk.signer ) return;

		try {
			const NDKEvent = window.NDKModule?.NDKEvent;
			if ( !NDKEvent ) return;

			const event = new NDKEvent( this.ndk );
			event.kind = 5;
			event.tags = [ [ 'e', eventId ] ];

			await event.sign();
			await this.publishToOurRelays( event );

			this.messages = this.messages.filter( m => m.id !== eventId );
			this.saveCachedMessages();
			this.updateMessages();
		} catch ( error ) {
			console.error( 'Delete error:', error );
		}
	};

	NostrChatWidget.prototype.publishToOurRelays = async function ( event ) {
		const plainEvent = {
			id: event.id,
			kind: event.kind,
			created_at: event.created_at,
			tags: event.tags || [],
			content: event.content || '',
			sig: event.sig,
			pubkey: event.pubkey
		};

		const publishPromises = this.relays.map( relayUrl =>
			this.publishToRelayViaWebSocket( relayUrl, plainEvent )
				.catch( e => ( { error: e.message, relay: relayUrl } ) )
		);

		const results = await Promise.allSettled( publishPromises );

		const successes = results.filter( r =>
			r.status === 'fulfilled' &&
			r.value &&
			r.value.success
		);

		if ( successes.length === 0 ) {
			const errors = results
				.map( r => r.status === 'fulfilled' ? r.value?.error : r.reason?.message )
				.filter( Boolean );
			throw new Error( `Failed to publish to any relay: ${errors.join( ', ' )}` );
		}

		return { success: true, publishedTo: successes.length };
	};

	NostrChatWidget.prototype.publishToRelayViaWebSocket = async function ( relayUrl, plainEvent ) {
		return new Promise( async ( resolve, reject ) => {
			try {
				const ws = new WebSocket( relayUrl );

				ws.onopen = () => {
					const messageHandler = ( msg ) => {
						try {
							const data = JSON.parse( msg.data );
							if ( data[ 0 ] === 'OK' && data[ 1 ] === plainEvent.id ) {
								ws.removeEventListener( 'message', messageHandler );
								if ( data[ 2 ] ) {
									resolve( { success: true, relay: relayUrl } );
								} else {
									reject( new Error( `Relay rejected event: ${data[ 3 ] || 'unknown reason'}` ) );
								}
							}
						} catch ( e ) {
							// Not JSON or not relevant message
						}
					};

					ws.addEventListener( 'message', messageHandler );

					const eventMessage = JSON.stringify( [ 'EVENT', plainEvent ] );
					ws.send( eventMessage );

					setTimeout( () => {
						ws.removeEventListener( 'message', messageHandler );
						reject( new Error( `Publish timeout for ${relayUrl}` ) );
					}, 10000 );
				};

				ws.onerror = ( error ) => {
					reject( new Error( `WebSocket error for ${relayUrl}` ) );
				};

				setTimeout( () => {
					if ( ws.readyState !== WebSocket.OPEN ) {
						ws.close();
						reject( new Error( `WebSocket connection timeout for ${relayUrl}` ) );
					}
				}, 5000 );
			} catch ( e ) {
				reject( e );
			}
		} );
	};

	NostrChatWidget.prototype.setUserPubkey = function ( pubkey ) {
		this.currentUserPubkey = pubkey;
		if ( pubkey && !pubkey.includes( '...' ) && !pubkey.startsWith( 'npub' ) ) {
			try {
				const NDKUser = window.NDKModule?.NDKUser;
				if ( NDKUser ) {
					const user = new NDKUser( { pubkey: pubkey } );
					this.currentUserNpub = user.npub;
				}
			} catch ( e ) {
				// Could not convert
			}
		} else if ( pubkey && pubkey.startsWith( 'npub' ) ) {
			this.currentUserNpub = pubkey;
		}
	};

	NostrChatWidget.prototype.setUserPrivateKey = function ( privateKey ) {
		this.currentUserPrivateKey = privateKey;
		if ( privateKey && privateKey.startsWith( 'nsec' ) ) {
			this.currentUserNsec = privateKey;
		} else if ( privateKey && !privateKey.includes( '...' ) ) {
			try {
				const NDKPrivateKeySigner = window.NDKModule?.NDKPrivateKeySigner;
				if ( NDKPrivateKeySigner ) {
					const signer = new NDKPrivateKeySigner( privateKey );
					signer.user().then( user => {
						if ( user && user.nsec ) {
							this.currentUserNsec = user.nsec;
						}
					} ).catch( e => {
						// Could not get nsec
					} );
				}
			} catch ( e ) {
				// Could not convert
			}
		}
	};

	NostrChatWidget.prototype.detectNostrExtension = function () {
		if ( window.nostr && typeof window.nostr.getPublicKey === 'function' ) {
			this.extensionDetected = true;
			return true;
		}

		if ( window.webln && window.webln.nostr && typeof window.webln.nostr.getPublicKey === 'function' ) {
			this.extensionDetected = true;
			return true;
		}

		this.extensionDetected = false;
		return false;
	};

	NostrChatWidget.prototype.authenticateWithExtension = async function () {
		try {
			let nostrProvider = window.nostr;

			if ( !nostrProvider && window.webln && window.webln.nostr ) {
				nostrProvider = window.webln.nostr;
			}

			if ( !nostrProvider ) {
				this.useNip7Checkbox = false;
				this.setErrorMessage( 'No NIP-07 extension found' );
				return false;
			}

			if ( typeof nostrProvider.getPublicKey !== 'function' ) {
				this.useNip7Checkbox = false;
				this.setErrorMessage( 'Extension found but getPublicKey is not a function' );
				return false;
			}

			let pubkey;
			try {
				pubkey = await nostrProvider.getPublicKey();
			} catch ( e ) {
				this.setErrorMessage( 'Error getting public key: ' + e.message );
				this.useNip7Checkbox = false;
				return false;
			}

			if ( !pubkey ) {
				this.useNip7Checkbox = false;
				this.setErrorMessage( 'No public key returned from extension' );
				return false;
			}

			this.setUserPubkey( pubkey );
			this.isAuthenticated = true;
			this.usingNip07 = true;
			this.currentUserPrivateKey = null;
			this.currentUserNsec = null;
			this.useNip7Checkbox = true;

			if ( !this.ndk ) {
				await new Promise( ( resolve ) => {
					if ( this.ndk ) {
						resolve();
					} else {
						const checkNDK = setInterval( () => {
							if ( this.ndk ) {
								clearInterval( checkNDK );
								resolve();
							}
						}, 100 );
						setTimeout( () => {
							clearInterval( checkNDK );
							resolve();
						}, 5000 );
					}
				} );
			}

			this.detectedNostrProvider = nostrProvider;
			await this.setupSigner();
			this.fetchCurrentUserProfile();

			localStorage.setItem( 'hitchwiki_chat_pubkey', pubkey );
			localStorage.removeItem( 'hitchwiki_chat_private_key' );
			localStorage.setItem( 'hitchwiki_chat_using_nip07', 'true' );

			if ( this.authDialog ) {
				this.authDialog.updateUI();
			}

			return true;
		} catch ( error ) {
			this.useNip7Checkbox = false;
			this.setErrorMessage( 'Authentication error: ' + ( error.message || error.toString() ) );
			return false;
		}
	};

	NostrChatWidget.prototype.authenticateWithKey = async function () {
		try {
			if ( !this.manualKey.trim() ) {
				this.setErrorMessage( 'Please enter an nsec key' );
				return;
			}

			const key = this.manualKey.trim();

			if ( !key.startsWith( 'nsec' ) ) {
				this.setErrorMessage( 'Only nsec private keys are accepted. Please enter an nsec1... key.' );
				return;
			}

			try {
				const NDKUser = window.NDKModule?.NDKUser;
				if ( NDKUser ) {
					const user = NDKUser.fromNsec( key );
					this.setUserPrivateKey( key );
					this.setUserPubkey( user.pubkey );
				} else {
					this.setUserPrivateKey( key );
					this.currentUserPubkey = 'loading...';
				}

				this.isAuthenticated = true;
				this.usingNip07 = false;
				this.useNip7Checkbox = false;
				localStorage.setItem( 'hitchwiki_chat_private_key', key );
				localStorage.removeItem( 'hitchwiki_chat_using_nip07' );
				if ( this.currentUserPubkey && this.currentUserPubkey !== 'loading...' ) {
					localStorage.setItem( 'hitchwiki_chat_pubkey', this.currentUserPubkey );
				}

				await this.setupSigner();

				if ( this.currentUserPubkey === 'loading...' && this.ndk && this.ndk.signer ) {
					try {
						const user = await this.ndk.signer.user();
						if ( user && user.pubkey ) {
							this.setUserPubkey( user.pubkey );
							localStorage.setItem( 'hitchwiki_chat_pubkey', user.pubkey );
						}
					} catch ( e ) {
						console.error( 'Error getting pubkey from signer:', e );
					}
				}

				this.fetchCurrentUserProfile();
				this.manualKey = '';

				if ( this.authDialog ) {
					this.authDialog.close();
				}
			} catch ( e ) {
				this.setErrorMessage( 'Invalid nsec format. Please check your key and try again.' );
			}
		} catch ( error ) {
			console.error( 'Key auth error:', error );
			this.setErrorMessage( 'Authentication failed: ' + error.message );
		}
	};

	NostrChatWidget.prototype.generateNewKey = async function () {
		try {
			this.setErrorMessage( '' );
			this.usingNip07 = false;
			this.useNip7Checkbox = false;

			if ( window.NDKModule && window.NDKModule.generatePrivateKey ) {
				const privateKey = window.NDKModule.generatePrivateKey();
				const NDKPrivateKeySigner = window.NDKModule.NDKPrivateKeySigner;

				if ( NDKPrivateKeySigner ) {
					try {
						const signer = new NDKPrivateKeySigner( privateKey );
						const user = await signer.user();
						if ( user && user.pubkey ) {
							this.setUserPrivateKey( privateKey );
							this.setUserPubkey( user.pubkey );
							if ( user.nsec ) {
								this.currentUserNsec = user.nsec;
							}
						} else {
							this.setUserPrivateKey( privateKey );
							this.currentUserPubkey = 'generating...';
						}
					} catch ( e ) {
						this.setUserPrivateKey( privateKey );
						this.currentUserPubkey = 'generating...';
					}
				} else {
					this.setUserPrivateKey( privateKey );
					this.currentUserPubkey = 'generating...';
				}
			} else {
				const bytes = new Uint8Array( 32 );
				crypto.getRandomValues( bytes );
				const hex = Array.from( bytes ).map( b => b.toString( 16 ).padStart( 2, '0' ) ).join( '' );
				this.setUserPrivateKey( hex );
				this.currentUserPubkey = 'generating...';
			}

			this.isAuthenticated = true;

			localStorage.setItem( 'hitchwiki_chat_private_key', this.currentUserPrivateKey );
			localStorage.removeItem( 'hitchwiki_chat_using_nip07' );
			if ( this.currentUserPubkey && this.currentUserPubkey !== 'generating...' ) {
				localStorage.setItem( 'hitchwiki_chat_pubkey', this.currentUserPubkey );
			}

			await this.setupSigner();

			if ( this.currentUserPubkey === 'generating...' && this.ndk && this.ndk.signer ) {
				try {
					const user = await this.ndk.signer.user();
					if ( user && user.pubkey ) {
						this.currentUserPubkey = user.pubkey;
						localStorage.setItem( 'hitchwiki_chat_pubkey', user.pubkey );
					}
				} catch ( e ) {
					console.error( 'Error getting pubkey from signer:', e );
					this.setErrorMessage( 'Key generated but failed to get public key. You may need to reconnect.' );
				}
			}

			if ( this.authDialog ) {
				this.authDialog.close();
			}
		} catch ( error ) {
			console.error( 'Key generation error:', error.message );
			this.setErrorMessage( 'Failed to generate key: ' + error.message );
		}
	};

	NostrChatWidget.prototype.deleteKeys = function () {
		this.currentUserPrivateKey = null;
		this.currentUserNsec = null;
		this.currentUserPubkey = null;
		this.currentUserNpub = null;
		this.currentUserNip05 = null;
		this.usingNip07 = false;
		this.useNip7Checkbox = false;
		this.isAuthenticated = false;
		this.manualKey = '';
		this.showPrivateKey = false;

		localStorage.removeItem( 'hitchwiki_chat_private_key' );
		localStorage.removeItem( 'hitchwiki_chat_pubkey' );
		localStorage.removeItem( 'hitchwiki_chat_using_nip07' );

		if ( this.ndk ) {
			this.ndk.signer = null;
		}

		if ( this.authDialog ) {
			this.authDialog.updateUI();
		}
	};

	NostrChatWidget.prototype.createNip07Signer = function ( nostrProvider, pubkey, ndkInstance ) {
		const NDKUser = window.NDKModule?.NDKUser;
		if ( !NDKUser ) {
			throw new Error( 'NDKUser not available' );
		}

		return {
			_pubkey: pubkey,
			_nostrProvider: nostrProvider,

			async user() {
				const user = new NDKUser( { pubkey: pubkey } );
				if ( ndkInstance ) {
					user.ndk = ndkInstance;
				}
				return user;
			},

			async sign( event ) {
				const plainEvent = {
					kind: event.kind,
					created_at: event.created_at || Math.floor( Date.now() / 1000 ),
					tags: event.tags || [],
					content: event.content || '',
					pubkey: pubkey
				};

				const signedEvent = await nostrProvider.signEvent( plainEvent );

				event.id = signedEvent.id;
				event.sig = signedEvent.sig;
				event.pubkey = signedEvent.pubkey;

				return signedEvent.sig;
			},

			getRelays: async () => {
				return [];
			}
		};
	};

	NostrChatWidget.prototype.setupSigner = async function () {
		try {
			if ( !this.ndk ) return;

			if ( this.usingNip07 || this.useNip7Checkbox ) {
				let nostrProvider = this.detectedNostrProvider;

				if ( !nostrProvider ) {
					nostrProvider = window.nostr;
				}
				if ( !nostrProvider && window.webln && window.webln.nostr ) {
					nostrProvider = window.webln.nostr;
				}

				if ( nostrProvider && this.currentUserPubkey ) {
					const signer = this.createNip07Signer( nostrProvider, this.currentUserPubkey, this.ndk );
					this.ndk.signer = signer;
					this.detectedNostrProvider = nostrProvider;
					return;
				}
			}

			if ( this.currentUserPrivateKey ) {
				try {
					const NDKPrivateKeySigner = window.NDKModule?.NDKPrivateKeySigner;
					if ( NDKPrivateKeySigner ) {
						this.ndk.signer = new NDKPrivateKeySigner( this.currentUserPrivateKey );
					}
				} catch ( e ) {
					console.error( 'Error setting up private key signer:', e );
				}
			}
		} catch ( error ) {
			console.error( 'Signer setup error:', error );
		}
	};

	NostrChatWidget.prototype.fetchCurrentUserProfile = async function () {
		try {
			if ( !this.ndk || !this.currentUserPubkey ) return;

			if ( this.userProfiles[ this.currentUserPubkey ]?.nip05 ) {
				this.currentUserNip05 = this.userProfiles[ this.currentUserPubkey ].nip05;
				return;
			}

			const filter = {
				kinds: [ 0 ],
				authors: [ this.currentUserPubkey ],
				limit: 1
			};

			const events = await this.ndk.fetchEvents( filter );

			if ( events && events.size > 0 ) {
				for ( const event of events ) {
					this.handleProfileEvent( event );
				}
			}
		} catch ( error ) {
			console.error( 'Error fetching user profile:', error );
		}
	};

	NostrChatWidget.prototype.loadCachedMessages = function () {
		try {
			const cached = localStorage.getItem( 'hitchwiki_chat_messages' );
			if ( cached ) {
				const messages = JSON.parse( cached );
				if ( Array.isArray( messages ) && messages.length > 0 ) {
					this.messages = messages;
					this.updateMessages();
				}
			}
		} catch ( e ) {
			console.error( 'Error loading cached messages:', e );
			localStorage.removeItem( 'hitchwiki_chat_messages' );
		}
	};

	NostrChatWidget.prototype.saveCachedMessages = function () {
		try {
			const toSave = this.messages.slice( -200 ).map( m => ( {
				id: m.id,
				pubkey: m.pubkey,
				content: m.content,
				created_at: m.created_at,
				tags: m.tags
			} ) );
			localStorage.setItem( 'hitchwiki_chat_messages', JSON.stringify( toSave ) );
		} catch ( e ) {
			console.error( 'Error saving cached messages:', e );
		}
	};

	NostrChatWidget.prototype.markRelaysConnected = function () {
		for ( const relayUrl of this.relays ) {
			if ( this.relayStatus[ relayUrl ]?.status !== 'connected' ) {
				this.relayStatus[ relayUrl ] = { status: 'connected' };
			}
		}
		this.updateRelayStatus();
	};

	NostrChatWidget.prototype.loadKeysFromStorage = async function () {
		try {
			const privateKey = localStorage.getItem( 'hitchwiki_chat_private_key' );
			const pubkey = localStorage.getItem( 'hitchwiki_chat_pubkey' );
			const usingNip07 = localStorage.getItem( 'hitchwiki_chat_using_nip07' ) === 'true';

			if ( usingNip07 && pubkey ) {
				this.usingNip07 = true;
				this.useNip7Checkbox = true;
				this.currentUserPrivateKey = null;
				this.currentUserNsec = null;
				this.setUserPubkey( pubkey );
				this.isAuthenticated = true;
				if ( this.detectNostrExtension() ) {
					await this.authenticateWithExtension();
				}
			} else if ( privateKey ) {
				this.useNip7Checkbox = false;
				this.usingNip07 = false;
				this.setUserPrivateKey( privateKey );
				this.isAuthenticated = true;

				if ( pubkey ) {
					this.setUserPubkey( pubkey );
				}

				if ( this.ndk ) {
					await this.setupSigner();
					if ( this.ndk && this.ndk.signer ) {
						try {
							const user = await this.ndk.signer.user();
							if ( user && user.pubkey ) {
								this.setUserPubkey( user.pubkey );
								localStorage.setItem( 'hitchwiki_chat_pubkey', user.pubkey );
							}
						} catch ( e ) {
							// Could not get pubkey
						}
					}
					this.fetchCurrentUserProfile();
				}
			} else if ( pubkey ) {
				this.usingNip07 = false;
				this.useNip7Checkbox = false;
				this.setUserPubkey( pubkey );
				this.isAuthenticated = false;
			} else {
				this.useNip7Checkbox = false;
			}
		} catch ( e ) {
			console.error( 'Error loading keys:', e );
		}
	};

	/**
	 * NostrAuthDialog - OOJS Dialog for authentication
	 */
	function NostrAuthDialog( config ) {
		this.chatWidget = config.chatWidget;
		NostrAuthDialog.super.call( this, {
			size: 'medium',
			title: 'Nostr keys'
		} );
		this.$body.append( this.buildContent() );
	}

	OO.inheritClass( NostrAuthDialog, OO.ui.Dialog );

	NostrAuthDialog.prototype.getActionProcess = function ( action ) {
		const dialog = this;
		if ( action === 'close' ) {
			return new OO.ui.Process( function () {
				dialog.close();
			} );
		}
		return NostrAuthDialog.super.prototype.getActionProcess.call( this, action );
	};

	NostrAuthDialog.prototype.buildContent = function () {
		const $content = $( '<div>' ).addClass( 'mw-nostr-auth-dialog-content' );
		const widget = this.chatWidget;

		// Extension checkbox
		if ( widget.hasExtension() ) {
			const $extensionSection = $( '<div>' )
				.css( {
					marginBottom: '16px',
					padding: '12px',
					border: '1px solid #c8ccd1',
					borderRadius: '4px',
					background: '#f8f9fa'
				} );

			const dialog = this;
			const $checkbox = $( '<input>' )
				.attr( 'type', 'checkbox' )
				.prop( 'checked', widget.useNip7Checkbox )
				.on( 'change', function () {
					widget.useNip7Checkbox = this.checked;
					if ( this.checked ) {
						widget.authenticateWithExtension().then( () => {
							dialog.updateUI();
						} );
					} else {
						widget.usingNip07 = false;
						widget.currentUserPrivateKey = null;
						widget.currentUserNsec = null;
						widget.currentUserPubkey = null;
						widget.currentUserNpub = null;
						widget.isAuthenticated = false;
						localStorage.removeItem( 'hitchwiki_chat_using_nip07' );
						dialog.updateUI();
					}
				} );

			$( '<label>' )
				.css( {
					display: 'flex',
					alignItems: 'center',
					gap: '8px',
					cursor: 'pointer',
					color: '#202122'
				} )
				.append( $checkbox )
				.append( $( '<span>' ).text( 'Use NIP-07 extension' ).css( 'fontSize', '13px' ) )
				.appendTo( $extensionSection );

			$content.append( $extensionSection );
		}

		// Nsec input
		if ( !widget.useNip7Checkbox ) {
			const $nsecSection = $( '<div>' ).css( 'marginBottom', '12px' );
			$( '<div>' )
				.css( {
					marginBottom: '6px',
					fontSize: '12px',
					color: '#0645ad',
					fontWeight: '500'
				} )
				.text( 'nsec:' )
				.appendTo( $nsecSection );

			const $inputRow = $( '<div>' ).addClass( 'mw-nostr-auth-input-row' );

			if ( widget.usingNip07 ) {
				$( '<input>' )
					.attr( 'type', 'text' )
					.prop( 'readonly', true )
					.val( '(stored in extension - not available)' )
					.css( {
						color: 'rgba(255, 255, 255, 0.5)',
						fontStyle: 'italic'
					} )
					.appendTo( $inputRow );
			} else if ( widget.currentUserPrivateKey ) {
				const $input = $( '<input>' )
					.attr( 'type', widget.showPrivateKey ? 'text' : 'password' )
					.prop( 'readonly', true )
					.val( widget.currentUserNsec || widget.currentUserPrivateKey );

				const $toggleBtn = $( '<button>' )
					.text( widget.showPrivateKey ? 'hide' : 'show' )
					.on( 'click', function () {
						widget.showPrivateKey = !widget.showPrivateKey;
						$input.attr( 'type', widget.showPrivateKey ? 'text' : 'password' );
						$toggleBtn.text( widget.showPrivateKey ? 'hide' : 'show' );
					} );

				$inputRow.append( $input ).append( $toggleBtn );
			} else {
				const $input = $( '<input>' )
					.attr( 'type', 'text' )
					.attr( 'placeholder', 'nsec1...' )
					.val( widget.manualKey )
					.on( 'input', function () {
						widget.manualKey = this.value;
					} )
					.on( 'keydown', function ( e ) {
						if ( e.key === 'Enter' ) {
							widget.authenticateWithKey();
						}
					} );
				$inputRow.append( $input );
			}

			$nsecSection.append( $inputRow );
			$content.append( $nsecSection );
		}

		// Npub display
		const $npubSection = $( '<div>' );
		$( '<div>' )
			.css( {
				marginBottom: '6px',
				fontSize: '12px',
				color: '#0645ad',
				fontWeight: '500'
			} )
			.text( 'npub:' )
			.appendTo( $npubSection );

		$( '<input>' )
			.attr( 'type', 'text' )
			.prop( 'readonly', true )
			.val( widget.currentUserNpub || '' )
			.attr( 'placeholder', 'npub not available' )
			.css( 'width', '100%' )
			.appendTo( $( '<div>' ).addClass( 'mw-nostr-auth-input-row' ).appendTo( $npubSection ) );

		$content.append( $npubSection );

		// Action buttons
		const $actions = $( '<div>' ).css( 'marginTop', '12px' );

		if ( !widget.currentUserPrivateKey && !widget.currentUserPubkey ) {
			$( '<button>' )
				.addClass( 'mw-nostr-auth-button' )
				.css( 'width', '100%' )
				.text( 'generate keys' )
				.on( 'click', function () {
					widget.generateNewKey();
				} )
				.appendTo( $actions );
		} else {
			$( '<button>' )
				.addClass( 'mw-nostr-auth-button mw-nostr-auth-button-danger' )
				.css( 'width', '100%' )
				.text( 'delete keys' )
				.on( 'click', function () {
					widget.deleteKeys();
					dialog.updateUI();
				} )
				.appendTo( $actions );
		}

		$content.append( $actions );

		return $content;
	};

	NostrAuthDialog.prototype.updateUI = function () {
		this.$body.empty().append( this.buildContent() );
	};

	NostrAuthDialog.prototype.hasExtension = function () {
		return this.chatWidget.hasExtension();
	};

	NostrChatWidget.prototype.hasExtension = function () {
		return this.extensionDetected ||
			( window.nostr && typeof window.nostr.getPublicKey === 'function' ) ||
			( window.webln && window.webln.nostr && typeof window.webln.nostr.getPublicKey === 'function' );
	};

}() );
