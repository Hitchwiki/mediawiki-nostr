'use strict';

const nodeResolve = require( '@rollup/plugin-node-resolve' );
const commonjs = require( '@rollup/plugin-commonjs' );

module.exports = {
	input: 'resources/nostr-libs-bundle.js',
	output: {
		file: 'resources/lib/nostr-libs.bundle.js',
		format: 'iife',
		name: 'NostrLibs',
		exports: 'named',
		globals: {
			'crypto': 'crypto'
		}
	},
	plugins: [
		nodeResolve( {
			preferBuiltins: false,
			browser: true
		} ),
		commonjs()
	]
};

