import { defineConfig } from 'vite';

// `base` must match the GitHub Pages sub-path (https://<user>.github.io/geo-skillz/).
// Overridable so `npm run build -- --base=/` works for other hosts.
export default defineConfig({
  base: process.env.VITE_BASE ?? '/geo-skillz/',
  build: { outDir: 'dist', assetsInlineLimit: 0 },
});
