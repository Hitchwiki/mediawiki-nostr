/**
 * NostrChat - MediaWiki extension
 * Ported from radio-guaka chat implementation
 */

( function () {
	'use strict';

	console.log( 'NostrChat: Script loaded' );

	// Wait for DOM to be ready
	if ( document.readyState === 'loading' ) {
		document.addEventListener( 'DOMContentLoaded', function() {
			console.log( 'NostrChat: DOM ready, initializing' );
			initChat();
		} );
	} else {
		console.log( 'NostrChat: DOM already ready, initializing' );
		initChat();
	}

	function initChat() {
		console.log( 'NostrChat: initChat called' );
		
		// Get config from script tag or use defaults
		const configScript = document.getElementById( 'mw-nostr-chat-config' );
		let channel = 'hitchwiki';
		let relays = [ 'wss://relay.trustroots.org', 'wss://relay.nomadwiki.org' ];
		
		if ( configScript ) {
			console.log( 'NostrChat: Found config script' );
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
		} else {
			console.log( 'NostrChat: No config script found, using defaults' );
		}
		
		// Create trigger button (always create it)
		let trigger = document.getElementById( 'mw-nostr-chat-trigger' );
		if ( !trigger ) {
			console.log( 'NostrChat: Creating trigger button' );
			trigger = document.createElement( 'div' );
			trigger.id = 'mw-nostr-chat-trigger';
			trigger.className = 'mw-nostr-chat-trigger';
			trigger.title = 'Chat';
			trigger.innerHTML = '<div class="mw-nostr-chat-icon"></div>';
			document.body.appendChild( trigger );
			console.log( 'NostrChat: Trigger button created and added to body' );
		} else {
			console.log( 'NostrChat: Trigger button already exists' );
		}
		
		// Create widget container
		let widget = document.getElementById( 'mw-nostr-chat-widget' );
		if ( !widget ) {
			console.log( 'NostrChat: Creating widget container' );
			widget = document.createElement( 'div' );
			widget.id = 'mw-nostr-chat-widget';
			widget.className = 'mw-nostr-chat-widget-hidden';
			document.body.appendChild( widget );
			console.log( 'NostrChat: Widget container created' );
		} else {
			console.log( 'NostrChat: Widget container already exists, ensuring it is hidden' );
			// Ensure widget is hidden by default
			widget.classList.add( 'mw-nostr-chat-widget-hidden' );
		}

		// Position trigger and widget in sidebar
		setupSidebarPositioning( trigger, widget );

		// Check if chat was open before (persist across page navigation)
		const chatWasOpen = localStorage.getItem( 'hitchwiki_chat_open' ) === 'true';
		if ( chatWasOpen && widget ) {
			widget.classList.remove( 'mw-nostr-chat-widget-hidden' );
			trigger.classList.add( 'mw-nostr-chat-trigger-active' );
			// Scroll to bottom after a short delay to ensure messages are loaded
			setTimeout( function() {
				const messagesContainer = widget.querySelector( '.mw-nostr-chat-messages' );
				if ( messagesContainer ) {
					messagesContainer.scrollTop = messagesContainer.scrollHeight;
				}
			}, 500 );
		}

		if ( trigger && widget ) {
			trigger.addEventListener( 'click', function () {
				const isHidden = widget.classList.contains( 'mw-nostr-chat-widget-hidden' );
				if ( isHidden ) {
					// Show widget
					widget.classList.remove( 'mw-nostr-chat-widget-hidden' );
					trigger.classList.add( 'mw-nostr-chat-trigger-active' );
					localStorage.setItem( 'hitchwiki_chat_open', 'true' );
					// Scroll to bottom when opening
					setTimeout( function() {
						const messagesContainer = widget.querySelector( '.mw-nostr-chat-messages' );
						if ( messagesContainer ) {
							messagesContainer.scrollTop = messagesContainer.scrollHeight;
						}
					}, 100 );
				} else {
					// Hide widget
					widget.classList.add( 'mw-nostr-chat-widget-hidden' );
					trigger.classList.remove( 'mw-nostr-chat-trigger-active' );
					localStorage.setItem( 'hitchwiki_chat_open', 'false' );
				}
			} );
		}

		// Load AlpineJS
		loadAlpineJS().then( function () {
			// Load NDK
			loadNDK().then( function () {
				// Initialize chat
				createChatWidget( widget, channel, relays );
			} );
		} );
	}

	function setupSidebarPositioning( trigger, widget ) {
		// Trigger is already fixed positioned via CSS (bottom right corner)
		// Widget is also fixed positioned (above trigger)
		// No additional positioning needed
		if ( trigger ) {
			// Ensure trigger is visible and positioned correctly
			trigger.style.display = 'flex';
		}
	}

	function loadAlpineJS() {
		return new Promise( function ( resolve ) {
			if ( window.Alpine ) {
				resolve();
				return;
			}
			const script = document.createElement( 'script' );
			script.src = 'https://cdn.jsdelivr.net/npm/alpinejs@3.x.x/dist/cdn.min.js';
			script.defer = true;
			script.onload = resolve;
			document.head.appendChild( script );
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

	function createChatWidget( container, channel, relays ) {
		// Create chat HTML structure
		container.innerHTML = `
			<div x-data="chatApp()" x-init="init()" class="mw-nostr-chat-container">
				<div class="mw-nostr-chat-header">
					<h3 class="mw-nostr-chat-title">Chat</h3>
					<div class="mw-nostr-chat-status">
						<div class="mw-nostr-relay-status" x-show="relays.length > 0">
							<template x-for="(relay, index) in relays.slice(0, 2)" :key="index">
								<div class="mw-nostr-relay-dot" 
									 :class="relayStatus[relay]?.status || 'disconnected'"
									 :title="relay"></div>
							</template>
						</div>
						<button class="mw-nostr-auth-trigger" @click="showAuthModal = true" title="Show key options">🔑</button>
					</div>
				</div>
				
				<div class="mw-nostr-chat-messages" x-ref="messagesContainer">
					<template x-if="errorMessage">
						<div class="mw-nostr-error-message" x-text="errorMessage"></div>
					</template>
					
					<template x-if="messages.length === 0 && !isLoading">
						<div class="mw-nostr-loading">No messages yet. Be the first to chat!</div>
					</template>
					
					<template x-if="isLoading">
						<div class="mw-nostr-loading">Loading messages...</div>
					</template>
					
					<template x-for="(message, index) in messages" :key="message.id">
						<div class="mw-nostr-message-wrapper">
							<div class="mw-nostr-date-separator" x-show="isNewDay(index)">
								<span x-text="formatDate(message.created_at)"></span>
							</div>
							<div class="mw-nostr-message" :class="{ 'mw-nostr-message-new-user': !isSameUserAsPrevious(index) }">
								<span class="mw-nostr-message-time" x-show="!isSameUserAsPrevious(index)" x-text="formatTime(message.created_at)"></span>
								<span class="mw-nostr-message-username" x-show="!isSameUserAsPrevious(index)" x-text="getUsername(message.pubkey)"></span>
								<span class="mw-nostr-message-content" x-text="message.content"></span>
								<span class="mw-nostr-message-actions" x-show="isAuthenticated">
									<span class="mw-nostr-message-action" @click="reactToMessage(message.id, '👍')" x-show="message.pubkey !== currentUserPubkey">👍<span class="mw-nostr-reaction-count" x-text="getReactionCount(message.id, '👍')"></span></span>
									<span class="mw-nostr-message-action" @click="deleteMessage(message.id)" x-show="message.pubkey === currentUserPubkey">×</span>
								</span>
							</div>
						</div>
					</template>
				</div>
				
				<div class="mw-nostr-chat-input-area">
					<textarea 
						x-model="messageInput"
						@keydown="handleKeyDown($event)"
						@focus="checkAuthOnFocus()"
						x-ref="chatInput"
						class="mw-nostr-chat-input"
						placeholder="Type your message... (Enter to send, Shift+Enter for new line)"
						rows="1"></textarea>
				</div>
				
				<template x-if="showAuthModal">
					<div class="mw-nostr-auth-modal" 
						 @click.self="showAuthModal = false" 
						 @keydown.escape="showAuthModal = false" 
						 x-ref="authModal"
						 tabindex="-1">
						<div class="mw-nostr-auth-modal-content">
							<button class="mw-nostr-auth-modal-close" @click="showAuthModal = false" aria-label="Close">×</button>
							<h3>Nostr keys</h3>
							
							<template x-if="hasExtension()">
								<div style="margin-bottom: 16px; padding: 12px; border: 1px solid #c8ccd1; border-radius: 4px; background: #f8f9fa;">
									<label style="display: flex; align-items: center; gap: 8px; cursor: pointer; color: #202122;">
										<input 
											type="checkbox" 
											x-model="useNip7Checkbox"
											@change="if (useNip7Checkbox) { authenticateWithExtension(); } else { usingNip07 = false; currentUserPrivateKey = null; currentUserNsec = null; currentUserPubkey = null; currentUserNpub = null; isAuthenticated = false; localStorage.removeItem('hitchwiki_chat_using_nip07'); }"
											style="width: 18px; height: 18px; cursor: pointer;">
										<span style="font-size: 13px;">Use NIP-07 extension</span>
									</label>
								</div>
							</template>
							
							<div class="mw-nostr-auth-current">
								<template x-if="!useNip7Checkbox">
									<div style="margin-bottom: 12px;">
										<div style="margin-bottom: 6px; font-size: 12px; color: #0645ad; font-weight: 500;">nsec:</div>
										<div class="mw-nostr-auth-input-row">
											<template x-if="usingNip07">
												<input type="text" readonly value="(stored in extension - not available)" style="color: rgba(255, 255, 255, 0.5); font-style: italic;">
											</template>
											<template x-if="!usingNip07 && currentUserPrivateKey">
												<input :type="showPrivateKey ? 'text' : 'password'" readonly :value="currentUserNsec || currentUserPrivateKey">
											</template>
											<template x-if="!usingNip07 && !currentUserPrivateKey">
												<input 
													type="text" 
													x-model="manualKey" 
													placeholder="nsec1..." 
													@keydown.enter="authenticateWithKey()"
													x-ref="nsecInput">
											</template>
											<template x-if="!usingNip07 && currentUserPrivateKey">
												<button @click="showPrivateKey = !showPrivateKey" x-text="showPrivateKey ? 'hide' : 'show'"></button>
											</template>
										</div>
									</div>
								</template>
								
								<div>
									<div style="margin-bottom: 6px; font-size: 12px; color: #0645ad; font-weight: 500;">npub:</div>
									<div class="mw-nostr-auth-input-row">
										<input type="text" readonly :value="currentUserNpub || ''" placeholder="npub not available" style="width: 100%;">
									</div>
								</div>
								
								<template x-if="!currentUserPrivateKey && !currentUserPubkey">
									<div style="margin-top: 12px;">
										<button @click="generateNewKey()" class="mw-nostr-auth-button" style="width: 100%;">generate keys</button>
									</div>
								</template>
								
								<template x-if="currentUserPrivateKey || currentUserPubkey">
									<div style="margin-top: 12px;">
										<button @click="deleteKeys()" class="mw-nostr-auth-button mw-nostr-auth-button-danger" style="width: 100%;">delete keys</button>
									</div>
								</template>
							</div>
						</div>
					</div>
				</template>
			</div>
		`;

		// Widget visibility is controlled by CSS class
		// Widget should remain hidden until trigger button is clicked

		// Define Alpine.js component
		window.chatApp = function () {
			return createChatApp( channel, relays );
		};
	}

	// Chat app logic (adapted from radio-guaka)
	function createChatApp( channel, relays ) {
		return {
			ndk: null,
			messages: [],
			messageInput: '',
			isAuthenticated: false,
			currentUserPubkey: null,
			currentUserNpub: null,
			currentUserPrivateKey: null,
			currentUserNsec: null,
			currentUserNip05: null,
			usingNip07: false,
			channel: channel,
			relays: relays,
			relayStatus: {},
			userProfiles: {},
			reactions: {},
			isLoading: true,
			isSending: false,
			showAuthModal: false,
			showPrivateKey: false,
			useNip7Checkbox: false,
			manualKey: '',
			errorMessage: '',
			extensionDetected: false,
			parentNostrProxy: null,
			detectedNostrProvider: null,

			hasExtension() {
				return this.extensionDetected ||
					!!this.parentNostrProxy ||
					( window.nostr && typeof window.nostr.getPublicKey === 'function' ) ||
					( window.webln && window.webln.nostr && typeof window.webln.nostr.getPublicKey === 'function' );
			},

			async init() {
				try {
					this.loadCachedMessages();
					this.relayStatus = {};
					this.relays.forEach( relay => {
						this.relayStatus[ relay ] = { status: 'connecting' };
					} );

					this.loadKeysFromStorage();

					if ( window.NDKModule ) {
						await this.initializeNDK();
					} else {
						window.addEventListener( 'ndkReady', () => {
							this.initializeNDK();
						} );

						setTimeout( () => {
							if ( !this.ndk ) {
								this.errorMessage = 'Failed to load NDK library. Chat unavailable.';
								this.isLoading = false;
							}
						}, 5000 );
					}
				} catch ( error ) {
					console.error( 'Init error:', error );
					this.errorMessage = 'Failed to initialize chat: ' + error.message;
					this.isLoading = false;
				}
			},

			async initializeNDK() {
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
						this.relays.forEach( relayUrl => {
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
							}
						} );

						this.ndk.pool.on( 'relay:disconnect', ( relay ) => {
							const relayUrl = relay.url || relay;
							if ( this.relays.includes( relayUrl ) ) {
								this.relayStatus[ relayUrl ] = { status: 'disconnected' };
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
					this.errorMessage = 'Failed to connect to relays: ' + error.message;
					this.isLoading = false;
				}
			},

			startSubscriptions() {
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
					this.errorMessage = 'Failed to subscribe to messages: ' + error.message;
					this.isLoading = false;
				}
			},

			handleMessageEvent( event ) {
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

				this.$nextTick( () => {
					const container = this.$refs.messagesContainer;
					if ( container ) {
						container.scrollTop = container.scrollHeight;
					}
				} );
			},

			handleProfileEvent( event ) {
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
				} catch ( e ) {
					console.error( 'Error parsing profile:', e );
				}
			},

			handleReactionEvent( event ) {
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
				} catch ( e ) {
					console.error( 'Error handling reaction:', e );
				}
			},

			getUsername( pubkey ) {
				if ( this.userProfiles[ pubkey ] ) {
					return this.userProfiles[ pubkey ].name;
				}
				const npub = this.hexToNpub( pubkey );
				return npub.substring( 0, 12 ) + '...';
			},

			isSameUserAsPrevious( index ) {
				if ( index === 0 ) return false;
				return this.messages[ index ].pubkey === this.messages[ index - 1 ].pubkey;
			},

			hexToNpub( hex ) {
				// Simplified npub encoding - for full implementation see radio-guaka
				try {
					return 'npub1' + hex.substring( 0, 58 );
				} catch ( e ) {
					return hex.substring( 0, 8 ) + '...';
				}
			},

			getReactionCount( eventId, emoji ) {
				if ( !this.reactions[ eventId ] || !this.reactions[ eventId ][ emoji ] ) {
					return '';
				}
				const count = this.reactions[ eventId ][ emoji ].length;
				return count > 0 ? count : '';
			},

			formatTime( timestamp ) {
				const date = new Date( timestamp * 1000 );
				const hours = date.getHours().toString().padStart( 2, '0' );
				const minutes = date.getMinutes().toString().padStart( 2, '0' );
				return `${hours}:${minutes}`;
			},

			formatDate( timestamp ) {
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
			},

			isNewDay( index ) {
				if ( index === 0 ) return true;
				const currentMsg = this.messages[ index ];
				const prevMsg = this.messages[ index - 1 ];
				if ( !currentMsg || !prevMsg ) return false;
				
				const currentDate = new Date( currentMsg.created_at * 1000 ).toDateString();
				const prevDate = new Date( prevMsg.created_at * 1000 ).toDateString();
				return currentDate !== prevDate;
			},

			async checkAuthOnFocus() {
				if ( this.isAuthenticated ) return;

				await new Promise( r => setTimeout( r, 300 ) );
				if ( this.isAuthenticated ) return;

				if ( this.detectNostrExtension() ) {
					const success = await this.authenticateWithExtension();
					if ( success ) {
						return;
					}
				}
			},

			handleKeyDown( event ) {
				if ( event.key === 'Enter' && event.shiftKey ) {
					return;
				}

				if ( event.key === 'Enter' && !event.shiftKey ) {
					event.preventDefault();
					this.sendMessage();
				}
			},

			async sendMessage() {
				if ( !this.isAuthenticated ) {
					if ( this.detectNostrExtension() ) {
						const success = await this.authenticateWithExtension();
						if ( !success ) {
							this.showAuthModal = true;
							return;
						}
					} else {
						this.showAuthModal = true;
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
								this.errorMessage = 'Extension signer not available. Please reconnect.';
								setTimeout( () => { this.errorMessage = ''; }, 3000 );
								return;
							}
						} else {
							this.errorMessage = 'Not connected. Please wait or refresh.';
							setTimeout( () => { this.errorMessage = ''; }, 3000 );
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

					this.messages = [ ...this.messages ];

					this.$nextTick( () => {
						const container = this.$refs.messagesContainer;
						if ( container ) {
							container.scrollTop = container.scrollHeight;
						}
					} );

					this.messageInput = '';

					await this.publishToOurRelays( event );

					if ( eventId ) {
						const messageIndex = this.messages.findIndex( m => m.id === eventId );
						if ( messageIndex !== -1 && this.messages[ messageIndex ].optimistic ) {
							this.messages[ messageIndex ].optimistic = false;
							this.messages = [ ...this.messages ];
						}
					}
				} catch ( error ) {
					console.error( 'Send error:', error.message );
					this.errorMessage = 'Failed to send message: ' + error.message;

					if ( event && event.id ) {
						this.messages = this.messages.filter( m => m.id !== event.id && !m.optimistic );
					}

					setTimeout( () => {
						this.errorMessage = '';
					}, 5000 );
				} finally {
					this.isSending = false;
				}
			},

			async reactToMessage( eventId, emoji ) {
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
			},

			async deleteMessage( eventId ) {
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
				} catch ( error ) {
					console.error( 'Delete error:', error );
				}
			},

			async publishToOurRelays( event ) {
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
			},

			async publishToRelayViaWebSocket( relayUrl, plainEvent ) {
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
			},

			setUserPubkey( pubkey ) {
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
			},

			setUserPrivateKey( privateKey ) {
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
			},

			detectNostrExtension() {
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
			},

			async authenticateWithExtension() {
				try {
					let nostrProvider = window.nostr;

					if ( !nostrProvider && window.webln && window.webln.nostr ) {
						nostrProvider = window.webln.nostr;
					}

					if ( !nostrProvider ) {
						this.useNip7Checkbox = false;
						this.errorMessage = 'No NIP-07 extension found';
						setTimeout( () => { this.errorMessage = ''; }, 3000 );
						return false;
					}

					if ( typeof nostrProvider.getPublicKey !== 'function' ) {
						this.useNip7Checkbox = false;
						this.errorMessage = 'Extension found but getPublicKey is not a function';
						setTimeout( () => { this.errorMessage = ''; }, 3000 );
						return false;
					}

					let pubkey;
					try {
						pubkey = await nostrProvider.getPublicKey();
					} catch ( e ) {
						this.errorMessage = 'Error getting public key: ' + e.message;
						setTimeout( () => { this.errorMessage = ''; }, 5000 );
						this.useNip7Checkbox = false;
						return false;
					}

					if ( !pubkey ) {
						this.useNip7Checkbox = false;
						this.errorMessage = 'No public key returned from extension';
						setTimeout( () => { this.errorMessage = ''; }, 3000 );
						return false;
					}

					this.setUserPubkey( pubkey );
					this.isAuthenticated = true;
					this.usingNip07 = true;
					this.currentUserPrivateKey = null;
					this.currentUserNsec = null;
					this.useNip7Checkbox = true;
					this.showAuthModal = false;

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

					return true;
				} catch ( error ) {
					this.useNip7Checkbox = false;
					this.errorMessage = 'Authentication error: ' + ( error.message || error.toString() );
					setTimeout( () => { this.errorMessage = ''; }, 5000 );
					return false;
				}
			},

			async authenticateWithKey() {
				try {
					if ( !this.manualKey.trim() ) {
						this.errorMessage = 'Please enter an nsec key';
						setTimeout( () => { this.errorMessage = ''; }, 3000 );
						return;
					}

					const key = this.manualKey.trim();

					if ( !key.startsWith( 'nsec' ) ) {
						this.errorMessage = 'Only nsec private keys are accepted. Please enter an nsec1... key.';
						setTimeout( () => {
							this.errorMessage = '';
						}, 6000 );
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
						this.showAuthModal = false;
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
					} catch ( e ) {
						this.errorMessage = 'Invalid nsec format. Please check your key and try again.';
						setTimeout( () => {
							this.errorMessage = '';
						}, 6000 );
					}
				} catch ( error ) {
					console.error( 'Key auth error:', error );
					this.errorMessage = 'Authentication failed: ' + error.message;
					setTimeout( () => {
						this.errorMessage = '';
					}, 6000 );
				} finally {
					if ( this.isAuthenticated ) {
						this.manualKey = '';
					}
				}
			},

			async generateNewKey() {
				try {
					this.errorMessage = '';
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
					this.showAuthModal = false;

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
							this.errorMessage = 'Key generated but failed to get public key. You may need to reconnect.';
							setTimeout( () => { this.errorMessage = ''; }, 5000 );
						}
					}
				} catch ( error ) {
					console.error( 'Key generation error:', error.message );
					this.errorMessage = 'Failed to generate key: ' + error.message;
					setTimeout( () => {
						this.errorMessage = '';
					}, 6000 );
				}
			},

			deleteKeys() {
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
			},

			createNip07Signer( nostrProvider, pubkey, ndkInstance ) {
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
			},

			async setupSigner() {
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
							const NDKPrivateKeySigner = window.NDKModule.NDKPrivateKeySigner;
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
			},

			async fetchCurrentUserProfile() {
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
			},

			loadCachedMessages() {
				try {
					const cached = localStorage.getItem( 'hitchwiki_chat_messages' );
					if ( cached ) {
						const messages = JSON.parse( cached );
						if ( Array.isArray( messages ) && messages.length > 0 ) {
							this.messages = messages;

							this.$nextTick( () => {
								const container = this.$refs.messagesContainer;
								if ( container ) {
									container.scrollTop = container.scrollHeight;
								}
							} );
						}
					}
				} catch ( e ) {
					console.error( 'Error loading cached messages:', e );
					localStorage.removeItem( 'hitchwiki_chat_messages' );
				}
			},

			saveCachedMessages() {
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
			},

			markRelaysConnected() {
				for ( const relayUrl of this.relays ) {
					if ( this.relayStatus[ relayUrl ]?.status !== 'connected' ) {
						this.relayStatus[ relayUrl ] = { status: 'connected' };
					}
				}
			},

			async loadKeysFromStorage() {
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
			}
		};
	}

}() );
