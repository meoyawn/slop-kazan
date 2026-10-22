import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

const root = fileURLToPath(new URL('.', import.meta.url));
const threeCDN = 'https://cdn.jsdelivr.net/gh/mrdoob/three.js@2bd920c3a604a3b847d9187b0a1c21e33807ecb3';
let development = false;

export default defineConfig({
  base: './',
  server: { host: '127.0.0.1', port: 5173, strictPort: true },
  optimizeDeps: { noDiscovery: true },
  resolve: { alias: [
    { find: /^three\/webgpu$/, replacement: `${threeCDN}/build/three.webgpu.js` },
    { find: /^three\/tsl$/, replacement: `${threeCDN}/build/three.tsl.js` },
    { find: /^three\/addons\//, replacement: `${threeCDN}/examples/jsm/` },
    { find: /^three$/, replacement: `${threeCDN}/build/three.webgpu.js` }
  ] },
  build: { rollupOptions: { external: /^three(?:\/|$)/ } },
  plugins: [{
    name: 'city-scripts',
    configResolved(config) {
      development = config.command === 'serve';
    },
    transformIndexHtml(html, context) {
      if (!development || context.filename !== `${root}index.html`) return html;
      const transformed = html.replace(/const assetVersion = '[^']+';/, 'const assetVersion = String(Date.now());')
        .replace(/(href="\.\/css\/style\.css)\?v=[^"]+/, '$1');
      return process.env.KAZAN_SOFTWARE_PREVIEW === '1' ? transformed.replace('<head>', '<head><script>document.documentElement.dataset.softwarePreview = "true";</script>') : transformed;
    },
    handleHotUpdate(context) {
      if (context.file.startsWith(`${root}js/`)) {
        context.server.ws.send({ type: 'full-reload' });
        return [];
      }
    },
    generateBundle() {
      const html = readFileSync(new URL('index.html', import.meta.url), 'utf8');
      for (const path of new Set([...html.matchAll(/'\.\/(js\/[a-z-]+\.js)'/g)].map((m) => m[1]))) {
        this.emitFile({ type: 'asset', fileName: path, source: readFileSync(new URL(path, import.meta.url), 'utf8') });
      }
    }
  }]
});
