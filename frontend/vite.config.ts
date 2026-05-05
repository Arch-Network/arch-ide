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
        // Function-form `manualChunks` so we can route by *path* rather
        // than by package name. The static-form map only matched the
        // listed entries; everything else (lucide icons, Radix
        // primitives, the Arch SDK, Borsh, @scure/@noble crypto, idb,
        // bs58, Bitcoin signing libs, etc.) all collapsed into the
        // 8 MB main bundle. This split puts each large family in its
        // own cacheable file so a hot-fix to app code doesn't
        // invalidate vendor cache and first-paint downloads less.
        manualChunks: (id) => {
          if (!id.includes('node_modules')) return undefined;

          // React core. Keep `react-router*` separate from generic
          // "react-…" packages by anchoring on the path separator.
          if (/[\\/]react[\\/]/.test(id) || /[\\/]react-dom[\\/]/.test(id)) {
            return 'react-vendor';
          }

          // Monaco editor + its language services.
          if (id.includes('monaco-editor') || id.includes('@monaco-editor')) {
            return 'monaco-vendor';
          }

          // Icons. Lucide ships hundreds of components; even with
          // tree-shaking we import dozens, and they tend to dominate
          // any "misc" bucket.
          if (id.includes('lucide-react')) {
            return 'icons-vendor';
          }

          // Radix primitives and shadcn-style wrappers + Headless
          // UI (used in a couple of legacy menus we haven't migrated
          // off yet — same role bucket).
          if (id.includes('@radix-ui') || id.includes('@headlessui')) {
            return 'radix-vendor';
          }

          // Arch network SDK (~hundreds of KB; pulls @noble/@scure).
          if (id.includes('@arch-network')) {
            return 'arch-vendor';
          }

          // Crypto: signing, hashing, encoding. Bitcoin libs and
          // their ecosystem live here too — `@bitcoinerlab/*`,
          // `bitcoinjs-message`, `@sats-connect/*`, `wif`, and
          // `secp256k1` are large enough to benefit from a dedicated
          // chunk that the codepath only loads when a wallet flow
          // is engaged.
          if (
            id.includes('bitcoinjs-lib') ||
            id.includes('bitcoinjs-message') ||
            id.includes('@bitcoinerlab') ||
            id.includes('@sats-connect') ||
            id.includes('sats-connect') ||
            id.includes('noble-secp256k1') ||
            id.includes('tiny-secp256k1') ||
            id.includes('/secp256k1/') ||
            id.includes('@noble') ||
            id.includes('@scure') ||
            id.includes('bip322') ||
            id.includes('borsh') ||
            id.includes('bs58') ||
            id.includes('/wif/') ||
            id.includes('js-sha256')
          ) {
            return 'crypto-vendor';
          }

          // Archive (zip) for project import/export.
          if (id.includes('jszip')) {
            return 'archive-vendor';
          }

          // GitHub API client (auth, gists, repos). Only used by
          // import/export flows so it shouldn't be in the hot path.
          if (id.includes('@octokit')) {
            return 'octokit-vendor';
          }

          // TanStack family (query, virtual, table). Used widely
          // enough to keep on the hot path but bulky enough to split.
          if (id.includes('@tanstack')) {
            return 'tanstack-vendor';
          }

          // Browser polyfills for Node-style APIs (process, Buffer,
          // streams). These pull in `web-streams-polyfill`,
          // `vm-browserify`, etc. — none of which need to live in
          // the app bundle.
          if (
            id.includes('vite-plugin-node-polyfills') ||
            id.includes('@esbuild-plugins/node') ||
            id.includes('web-streams-polyfill') ||
            id.includes('vm-browserify') ||
            id.includes('process/browser') ||
            id.includes('crypto-browserify') ||
            id.includes('readable-stream') ||
            id.includes('buffer/')
          ) {
            return 'polyfills-vendor';
          }

          // HTTP client. Big enough to call out, small enough that
          // route-based splitting isn't worth the effort.
          if (id.includes('/axios/') || id.endsWith('/axios')) {
            return 'http-vendor';
          }

          // Storage / persistence.
          if (id.includes('/idb/') || id.endsWith('/idb')) {
            return 'storage-vendor';
          }

          // Everything else from node_modules. Keeps unrelated
          // dependency churn out of `index-*.js` so app-only edits
          // don't bust the vendor cache.
          return 'vendor';
        },
      },
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
