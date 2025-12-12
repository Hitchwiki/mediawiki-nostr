# NostrChat Extension

MediaWiki extension for Nostr chat functionality.

## Building JavaScript Libraries

This extension bundles external JavaScript libraries using Rollup. To build the bundled libraries:

1. Install dependencies:
```bash
npm install
```

2. Build the bundled libraries:
```bash
npm run build
```

This will create `resources/lib/nostr-libs.bundle.js` containing:
- `@nostr-dev-kit/ndk` - Nostr Development Kit
- `@noble/secp256k1` - Cryptographic utilities

**Important:** The bundled file (`resources/lib/nostr-libs.bundle.js`) must be committed to the repository. Run `npm run build` before committing changes that affect dependencies.

## Development

After modifying dependencies in `package.json`, always run `npm run build` to regenerate the bundled library.

