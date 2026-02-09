import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import wasm from 'vite-plugin-wasm';
import { NodeGlobalsPolyfillPlugin } from '@esbuild-plugins/node-globals-polyfill';
import { NodeModulesPolyfillPlugin } from '@esbuild-plugins/node-modules-polyfill';
import { nodePolyfills } from 'vite-plugin-node-polyfills';
import type { ServerOptions } from 'http-proxy';

const proxyOptions: ServerOptions = {
  target: 'http://localhost:9002',
  changeOrigin: true,
  secure: false,
  configure: (proxy, _options) => {
    proxy.on('proxyReq', (proxyReq, req) => {
      const url = new URL(req.url!, 'http://localhost:3000');
      const targetUrl = url.searchParams.get('target');
      if (targetUrl) {
        const decodedTarget = decodeURIComponent(targetUrl);
        const target = new URL(decodedTarget);
        proxyReq.protocol = target.protocol;
        proxyReq.host = target.host;
        proxyReq.path = target.pathname + target.search;
        console.log('Proxying to:', decodedTarget);
      }
    });

    proxy.on('error', (err, _req, _res) => {
      console.log('proxy error:', err);
    });
  }
};

export default defineConfig({
  plugins: [
    wasm(),
    react(),
    nodePolyfills({
      globals: {
        Buffer: true,
        global: true,
        process: true
      },
      protocolImports: true,
    })
  ],
  build: {
    target: ['esnext'],
    outDir: 'dist',
    sourcemap: false,
    minify: 'esbuild',
    cssMinify: true,
    chunkSizeWarningLimit: 1000,
    emptyOutDir: true,
    rollupOptions: {
      output: {
        manualChunks: {
          'react-vendor': ['react', 'react-dom'],
          'monaco-vendor': ['@monaco-editor/react'],
          'crypto-vendor': ['bitcoinjs-lib', 'noble-secp256k1', 'tiny-secp256k1'],
        }
      }
    },
    reportCompressedSize: false,
    cssCodeSplit: true
  },
  optimizeDeps: {
    include: ['@monaco-editor/react', 'buffer', 'bip322-js'],
    esbuildOptions: {
      target: 'esnext',
      plugins: [
        NodeGlobalsPolyfillPlugin({
          buffer: true
        }),
        NodeModulesPolyfillPlugin()
      ],
      supported: {
        'top-level-await': true
      },
    }
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@components': path.resolve(__dirname, './src/components'),
      '@lib': path.resolve(__dirname, './src/lib'),
      '@utils': path.resolve(__dirname, './src/lib/utils'),
      '@ui': path.resolve(__dirname, './src/components/ui'),
      '@hooks': path.resolve(__dirname, './src/hooks'),
      buffer: 'buffer/'
    }
  },
  define: {
    global: {},
    'process.env': {}
  },
  server: {
    port: 3000,
    proxy: {
      '/rpc': {
        target: process.env.VITE_RPC_URL || 'https://rpc.testnet.arch.network',
        changeOrigin: true,
        secure: false,
        proxyTimeout: 120000,
        timeout: 120000,
        rewrite: (path) => {
          const url = new URL(path, 'http://localhost:3000');
          const targetUrl = url.searchParams.get('target');

          if (targetUrl) {
            return '';
          }

          return path;
        },
        configure: (proxy, _options) => {
          proxy.on('proxyReq', (proxyReq, req) => {
            const url = new URL(req.url!, 'http://localhost:3000');
            const targetUrl = url.searchParams.get('target');

            if (targetUrl) {
              const decodedTarget = decodeURIComponent(targetUrl);
              const target = new URL(decodedTarget);
              proxyReq.protocol = target.protocol;
              proxyReq.host = target.host;
              proxyReq.path = target.pathname + target.search;
              console.log('Proxying to:', decodedTarget);
            }

            if (req.method !== 'OPTIONS') {
              proxyReq.setHeader('Connection', 'keep-alive');
              proxyReq.setHeader('Keep-Alive', 'timeout=120');
            }
          });

          proxy.on('proxyRes', (proxyRes, req, res) => {
            if (req.method === 'OPTIONS') {
              proxyRes.headers['access-control-allow-origin'] = '*';
              proxyRes.headers['access-control-allow-methods'] = 'POST, OPTIONS';
              proxyRes.headers['access-control-allow-headers'] = 'content-type, authorization';
              proxyRes.headers['access-control-max-age'] = '3600';
            }
          });

          proxy.on('error', (err, req, res) => {
            console.error('Proxy error:', err);
            if (!res.headersSent) {
              res.writeHead(500, { 'Content-Type': 'application/json' });
            }
            res.end(JSON.stringify({ error: 'Proxy error' }));
          });
        },
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type, Authorization'
        }
      },
      '/api/build': {
        target: process.env.VITE_API_URL || 'http://localhost:8080',
        changeOrigin: true,
        secure: true,
        headers: {
          'Origin': process.env.VITE_CLIENT_URL || 'http://localhost:3000'
        }
      },
      '/api/bitcoin': {
        target: 'http://localhost:8010/proxy',
        changeOrigin: true,
        secure: false,
        rewrite: (path) => {
          const url = new URL(path, 'http://localhost:8010');
          const wallet = url.searchParams.get('wallet');
          return wallet ? `/proxy/wallet/${wallet}` : '/proxy';
        },
        configure: (proxy, _options) => {
          proxy.on('error', (err, _req, _res) => {
            console.log('proxy error', err);
          });
          proxy.on('proxyReq', (proxyReq, req, _res) => {
            const auth = Buffer.from('bitcoin:428bae8f3c94f8c39c50757fc89c39bc7e6ebc70ebf8f618').toString('base64');
            proxyReq.setHeader('Authorization', `Basic ${auth}`);
          });
        }
      }
    }
  }
});
