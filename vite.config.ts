import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import electron from 'vite-plugin-electron';
import renderer from 'vite-plugin-electron-renderer';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

const sharedAlias = {
  '@': resolve(__dirname, 'src'),
  '@main': resolve(__dirname, 'src/main'),
  '@renderer': resolve(__dirname, 'src/renderer'),
  '@shared': resolve(__dirname, 'src/shared'),
};

export default defineConfig({
  plugins: [
    react(),
    electron([
      {
        entry: resolve(__dirname, 'src/main/index.ts'),
        vite: {
          resolve: { alias: sharedAlias },
          build: {
            outDir: resolve(__dirname, 'dist/main'),
            rollupOptions: {
              external: [
                'electron',
                'electron-audio-loopback',
                'bindings',
                'bufferutil',
                'utf-8-validate',
                'sql.js',
                'dotenv',
                '@deepgram/sdk',
                'assemblyai',
                'audiotee',
                'openai',
              ],
            },
          },
        },
        onstart(options) {
          options.startup();
        },
      },
      {
        entry: resolve(__dirname, 'src/preload/index.ts'),
        vite: {
          resolve: { alias: sharedAlias },
          build: {
            outDir: resolve(__dirname, 'dist/preload'),
          },
        },
        onstart(options) {
          options.reload();
        },
      },
    ]),
    renderer(),
  ],
  resolve: {
    alias: sharedAlias,
  },
  root: resolve(__dirname, 'src/renderer'),
  build: {
    outDir: resolve(__dirname, 'dist/renderer'),
  },
});
