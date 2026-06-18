import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'path'

// https://vite.dev/config/
export default defineConfig(() => {
  return {
    plugins: [react()],
    build: {
      rollupOptions: {
        input: {
          // Main app entry
          main: resolve(__dirname, 'index.html'),
          // Dedicated MSAL popup redirect page (no React)
          'auth-redirect': resolve(__dirname, 'auth-redirect.html'),
        },
        output: {
          // Manual chunk splitting for optimal bundle sizes
          manualChunks(id) {
            if (id.includes('node_modules')) {
              if (id.includes('react/') || id.includes('react-dom') || id.includes('react-router') || id.includes('react-is')) return 'vendor-react';
              if (id.includes('recharts')) return 'vendor-recharts';
              if (id.includes('framer-motion')) return 'vendor-framer';
              if (id.includes('lucide-react')) return 'vendor-icons';
              if (id.includes('@azure/msal')) return 'vendor-msal';
              if (id.includes('zustand')) return 'vendor-zustand';
              if (id.includes('socket.io')) return 'vendor-socket';
              if (id.includes('@opentelemetry')) return 'vendor-telemetry';
              if (id.includes('jspdf')) return 'vendor-pdf';
              if (id.includes('xlsx')) return 'vendor-excel';
              if (id.includes('@hello-pangea/dnd')) return 'vendor-dnd';
              if (id.includes('clsx') || id.includes('tailwind-merge')) return 'vendor-utils';
              // Removed catch-all 'vendor' to allow Vite to code-split everything else naturally
            }
          },
        },
      },
      // Enable source map for production debugging
      sourcemap: false,
      // Target modern browsers for smaller output
      target: 'es2020',
      // Increase chunk size warning limit (recharts is large)
      chunkSizeWarningLimit: 600,
      // Enable CSS code splitting
      cssCodeSplit: true,
    },
    server: {
      port: 5173,
      proxy: {
        '/api': {
          target: 'http://127.0.0.1:3001',
          changeOrigin: true,
          secure: false
        }
      }
    }
  }
})
