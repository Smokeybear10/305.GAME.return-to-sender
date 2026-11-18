/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { iwsdkDev } from '@iwsdk/vite-plugin-dev';
import { defineConfig } from 'vite';
import project from './iwsdk.config.json';

export default defineConfig({
  plugins: [
    iwsdkDev(),
    {
      name: 'return-to-sender-exclude-unused-uikitml',
      apply: 'build',
      enforce: 'pre',
      buildStart() {
        if (project.world.features.spatialUI !== false) {
          throw new Error('Remove the UIKitML exclusion before enabling spatial UI.');
        }
      },
      resolveId(source) {
        if (source === '@drawcall/uikitml') return '\0return-to-sender:disabled-uikitml';
      },
      load(id) {
        if (id !== '\0return-to-sender:disabled-uikitml') return;
        // This game uses HTML and canvas text, with no UIKitML assets.
        return `const unavailable = () => { throw new Error('UIKitML is excluded from this game build.'); };
export { unavailable as instantiate, unavailable as parse, unavailable as resolveKitComponentSets };`;
      },
    },
  ],
  server: { host: '0.0.0.0', port: 8089, open: false },
  build: {
    outDir: 'dist',
    sourcemap: process.env.NODE_ENV !== 'production',
    target: 'esnext',
    rollupOptions: { input: './index.html' },
  },
  esbuild: { target: 'esnext' },
  // @drawcall/uikitml otherwise pulls a second three/@pmndrs/uikit graph
  // (its own three vs the app's super-three alias). Duplicate Component classes break
  // instanceof checks → "Only pmndrs/uikit components can be added as children".
  resolve: {
    dedupe: [
      'three',
      '@pmndrs/uikit',
      '@pmndrs/uikit-horizon',
      '@pmndrs/uikit-lucide',
    ],
  },
  optimizeDeps: {
    exclude: ['@babylonjs/havok'],
    include: [
      'three',
      '@pmndrs/uikit',
      '@pmndrs/uikit-horizon',
      '@pmndrs/uikit-lucide',
      '@drawcall/uikitml',
    ],
    esbuildOptions: { target: 'esnext' },
  },
  publicDir: 'public',
  base: './',
});
