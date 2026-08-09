import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// envDir points at the repository root because that is where docs/SETUP.md tells
// you to put .env. Vite otherwise looks only inside client/, so every VITE_*
// value in the root file was silently ignored and the app fell back to its
// built-in defaults — including the mock OTP secret, which made locally created
// accounts differ from the deployed ones for the same phone number.
// Production is unaffected: Netlify injects these as real environment variables.
export default defineConfig({
  // Root on a domain of our own; a subdirectory on GitHub Pages, which serves a
  // project site from /<repo>/. Set by the Pages workflow, unset everywhere else.
  base: process.env.VITE_BASE_PATH ?? '/',
  envDir: '..',
  plugins: [react()],
  server: { port: 5173, proxy: { '/api': 'http://localhost:4000' } },
  build: {
    rollupOptions: {
      output: {
        // Split the dependencies that dominate the bundle so they cache
        // independently of application code: a copy change should not force
        // every visitor to re-download React and the Supabase client.
        //
        // Matched on the resolved path rather than by package name — a bare
        // ['react-dom'] entry misses 'react-dom/client', which left the whole
        // renderer sitting in the entry chunk.
        manualChunks(id: string) {
          if (!id.includes('node_modules')) return undefined;
          if (id.includes('@supabase')) return 'supabase';
          if (/[\\/]node_modules[\\/](react|react-dom|react-router|react-router-dom|scheduler)[\\/]/.test(id)) return 'react';
          return 'vendor';
        },
      },
    },
  },
});
