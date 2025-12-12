# NostrAuth Extension

MediaWiki extension for Nostr authentication.

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

This will create `resources/lib/bech32.bundle.js` containing:
- `@scure/base` - Bech32 encoding/decoding utilities

**Important:** The bundled file (`resources/lib/bech32.bundle.js`) must be committed to the repository. Run `npm run build` before committing changes that affect dependencies.

## Development

After modifying dependencies in `package.json`, always run `npm run build` to regenerate the bundled library.

