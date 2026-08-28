import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],

  build: {
    // Пока старый фронт живой, собираемся рядом: emptyOutDir на ../public/webapp
    // стёр бы работающее приложение. Переключение — задача 12 плана фазы 2.
    outDir: '../public/webapp-next',
    emptyOutDir: true,
  },

  server: {
    port: 5174,
    proxy: {
      '/api': { target: 'http://localhost:3000', changeOrigin: true, secure: false },
    },
  },
});
