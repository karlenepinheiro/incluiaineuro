import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, '.', '');
    return {
      server: {
        port: 3000,
        host: '0.0.0.0',
      },
      plugins: [react()],
      define: {
        // Gemini (legado)
        'process.env.API_KEY': JSON.stringify(env.VITE_GEMINI_API_KEY || env.GEMINI_API_KEY),
        'process.env.GEMINI_API_KEY': JSON.stringify(env.VITE_GEMINI_API_KEY || env.GEMINI_API_KEY),
      },
      build: {
        outDir: 'dist',
        sourcemap: false,
        rollupOptions: {
          output: {
            manualChunks(id) {
              if (!id.includes('node_modules')) return undefined;
              // React core — cacheável separado, necessário sempre
              if (
                id.includes('/react/') ||
                id.includes('/react-dom/') ||
                id.includes('react/jsx-runtime') ||
                id.includes('/scheduler/')
              ) return 'vendor-react';
              // Supabase — necessário para auth no carregamento inicial
              if (id.includes('@supabase/')) return 'vendor-supabase';
              // Tudo mais fica co-localizado com os chunks lazy que o usam.
              // Isso evita dependências circulares entre vendor chunks e garante
              // que bibliotecas pesadas (jsPDF, Gemini SDK, @xyflow) só carreguem
              // quando a feature que as usa for acessada.
              return undefined;
            },
          },
        },
      },
      resolve: {
        alias: {
          '@': path.resolve(__dirname, '.'),
        },
        dedupe: ['react', 'react-dom', 'react/jsx-runtime'],
      },
    };
});
