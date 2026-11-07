import { resolve } from 'node:path';
import { defineConfig } from 'electron-vite';

export default defineConfig({
  main: {
    build: { rolldownOptions: { input: { index: resolve('src/main/index.ts') } } },
  },
  preload: {
    build: { rolldownOptions: { input: { index: resolve('src/preload/index.ts') } } },
  },
  renderer: {
    root: 'src/renderer',
    build: {
      rolldownOptions: {
        input: {
          assistant: resolve('src/renderer/assistant/index.html'),
          settings: resolve('src/renderer/settings/index.html'),
        },
      },
    },
  },
});
