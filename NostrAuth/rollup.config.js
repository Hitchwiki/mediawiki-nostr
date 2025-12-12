'use strict';

const nodeResolve = require( '@rollup/plugin-node-resolve' );
const commonjs = require( '@rollup/plugin-commonjs' );

module.exports = {
	input: 'resources/bech32-bundle.js',
	output: {
		file: 'resources/lib/bech32.bundle.js',
		format: 'iife',
		name: 'Bech32Lib',
		exports: 'named'
	},
	plugins: [
		nodeResolve( {
			preferBuiltins: false,
			browser: true
		} ),
		commonjs()
	]
};

