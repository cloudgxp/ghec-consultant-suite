import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  build: {
    chunkSizeWarningLimit: 600,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules')) {
            if (id.includes('@primer/octicons-react')) {
              return 'vendor-octicons';
            }
            if (id.includes('@primer/behaviors')) {
              return 'vendor-primer-behaviors';
            }
            if (
              id.includes('/color2k/') ||
              id.includes('/hsluv/') ||
              id.includes('/@github/relative-time-element/') ||
              id.includes('/@primer/live-region-element/')
            ) {
              return 'vendor-primer-utils';
            }
            if (id.includes('@oddbird/popover-polyfill')) {
              return 'vendor-popover';
            }
            if (id.includes('@tanstack/')) {
              return 'vendor-virtual';
            }
            if (id.includes('@primer/react')) {
              return 'vendor-primer';
            }
            if (
              id.includes('/react/') ||
              id.includes('/react-dom/') ||
              id.includes('/scheduler/')
            ) {
              return 'vendor-react';
            }
          }
        },
      },
    },
  },
});
