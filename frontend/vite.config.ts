import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { fileURLToPath, URL } from 'node:url';

/**
 * Сборка рассчитана на airgap-контур: никаких CDN.
 * Monaco целиком приходит из node_modules (см. src/monaco/setup.ts), схема и каталог
 * keywords лежат в src/generated и обновляются npm-скриптами generate:*.
 */
export default defineConfig({
  base: './',
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  // Workaround для Vite 8: dev-клиент иногда отдаётся с необъявленным
  // __BUNDLED_DEV__, из-за чего React не монтируется и страница остаётся белой.
  // Убирается после исправления https://github.com/vitejs/vite/issues/22419.
  define: {
    __BUNDLED_DEV__: 'false',
  },
  server: {
    port: 5173,
    strictPort: true,
    // Listen IPv4+IPv6 — иначе только ::1 и http://127.0.0.1:5173/ мёртвый.
    host: true,
    // Dev API: песочница + валидатор конструкторов → tools/data_playground.py :8765
    // Live: метаданные и результаты → Live (idle) :8767
    // Auth: Better Auth spike server → auth-server.ts :3001
    proxy: {
      '/api/auth': {
        target: 'http://127.0.0.1:3001',
        changeOrigin: true,
        secure: false,
      },
      '/api/terminal': {
        target: 'http://127.0.0.1:3002',
        changeOrigin: true,
        secure: false,
        ws: true,
      },
      '/api': {
        target: 'http://127.0.0.1:8765',
        changeOrigin: true,
      },
      '/live': {
        target: 'http://127.0.0.1:8767',
        changeOrigin: true,
      },
    },
  },
  build: {
    // Monaco — крупный вендорный чанк, предупреждение о размере здесь не информативно.
    chunkSizeWarningLimit: 4096,
  },
  test: {
    // Окружение по умолчанию — node; тестам с рендером RJSF нужен jsdom, он включается
    // директивой `@vitest-environment jsdom` в самих файлах.
    environment: 'node',
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
    setupFiles: ['./src/monaco/vitest.monaco-polyfill.ts'],
  },
});