import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: { port: 5173, host: true },
  // Output to the repo root so the build lands where Vercel looks by default
  // as well as where vercel.json points it. One less thing to get wrong in a
  // dashboard setting nobody remembers changing.
  build: {
    target: 'es2022',
    sourcemap: true,
    outDir: '../../dist',
    emptyOutDir: true,
  },
});
