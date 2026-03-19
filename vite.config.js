import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { viteStaticCopy } from 'vite-plugin-static-copy'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    viteStaticCopy({
      targets: [{
        src: 'node_modules/pdfjs-dist/build/pdf.worker.min.mjs',
        dest: ''
      }]
    }),
    VitePWA({
      registerType: 'autoUpdate',
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
        // Increase limit for WebLLM bundle (8MB)
        maximumFileSizeToCacheInBytes: 8 * 1024 * 1024,
        runtimeCaching: [
          {
            // Cache Google Fonts
            urlPattern: /^https:\/\/fonts\.googleapis\.com\//,
            handler: 'StaleWhileRevalidate',
            options: {
              cacheName: 'google-fonts-stylesheets'
            }
          },
          {
            // Cache Google Fonts webfonts
            urlPattern: /^https:\/\/fonts\.gstatic\.com\//,
            handler: 'CacheFirst',
            options: {
              cacheName: 'google-fonts-webfonts',
              expiration: {
                maxEntries: 30,
                maxAgeSeconds: 60 * 60 * 24 * 365 // 1 year
              }
            }
          },
          {
            // Cache CrossRef API responses
            urlPattern: /^https:\/\/api\.crossref\.org\//,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'crossref-cache',
              expiration: {
                maxAgeSeconds: 86400 // 1 day
              }
            }
          },
          {
            // Cache Semantic Scholar API responses
            urlPattern: /^https:\/\/api\.semanticscholar\.org\//,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'semantic-scholar-cache',
              expiration: {
                maxAgeSeconds: 86400 // 1 day
              }
            }
          }
        ]
      },
      manifest: {
        name: 'ScholarLib',
        short_name: 'ScholarLib',
        description: 'Academic reference manager with AI-powered document Q&A',
        theme_color: '#0f1117',
        background_color: '#0f1117',
        display: 'standalone',
        orientation: 'any',
        start_url: '/ScholarLib/',
        scope: '/ScholarLib/',
        icons: [
          {
            src: 'icons/icon-192.png',
            sizes: '192x192',
            type: 'image/png'
          },
          {
            src: 'icons/icon-512.png',
            sizes: '512x512',
            type: 'image/png'
          },
          {
            src: 'icons/icon-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable'
          }
        ]
      }
    })
  ],
  base: '/ScholarLib/',
  build: {
    outDir: 'dist',
    sourcemap: false,
    chunkSizeWarningLimit: 1000,
    rollupOptions: {
      output: {
        manualChunks: {
          'webllm': ['@mlc-ai/web-llm'],
          'pdfjs': ['pdfjs-dist'],
          'vendor': ['react', 'react-dom', 'zustand']
        }
      }
    }
  }
})
