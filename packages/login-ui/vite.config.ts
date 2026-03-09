import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  const isWebComponent = mode === 'web-component';
  
  return {
    plugins: [react()],
    define: {
      'process.env.NODE_ENV': JSON.stringify(process.env.NODE_ENV || 'development'),
    },
    resolve: {
      alias: {
        '@': resolve(__dirname, './src'),
        '@components': resolve(__dirname, './src/components'),
        '@hooks': resolve(__dirname, './src/hooks'),
        '@types': resolve(__dirname, './src/types'),
        '@utils': resolve(__dirname, './src/utils'),
        '@styles': resolve(__dirname, './src/styles'),
      },
    },
    build: isWebComponent
      ? {
          // Web Component build - standalone JS file
          lib: {
            entry: resolve(__dirname, 'src/web-component/index.ts'),
            name: 'AuthLogin',
            fileName: () => 'auth-login.js',
            formats: ['iife'],
          },
          rollupOptions: {
            output: {
              inlineDynamicImports: true,
            },
          },
        }
      : {
          // Standard React app build
          outDir: 'dist',
          sourcemap: true,
        },
    server: {
      port: 5173,
      proxy: {
        '/auth': {
          target: 'http://localhost:3001',
          changeOrigin: true,
        },
        '/.well-known': {
          target: 'http://localhost:3001',
          changeOrigin: true,
        },
      },
    },
    test: {
      globals: true,
      environment: 'jsdom',
      setupFiles: ['./src/test/setup.ts'],
      include: ['src/**/*.{test,spec}.{ts,tsx}'],
      coverage: {
        reporter: ['text', 'json', 'html'],
        exclude: ['node_modules/', 'src/test/'],
      },
    },
  };
});
