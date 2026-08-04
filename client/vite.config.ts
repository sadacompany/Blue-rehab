import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// envDir points at the repository root because that is where docs/SETUP.md tells
// you to put .env. Vite otherwise looks only inside client/, so every VITE_*
// value in the root file was silently ignored and the app fell back to its
// built-in defaults — including the mock OTP secret, which made locally created
// accounts differ from the deployed ones for the same phone number.
// Production is unaffected: Netlify injects these as real environment variables.
export default defineConfig({
  envDir: '..',
  plugins: [react()],
  server: { port: 5173, proxy: { '/api': 'http://localhost:4000' } },
});
