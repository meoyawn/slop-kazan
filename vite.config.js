import { readFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

const root = fileURLToPath(new URL('.', import.meta.url));
const worldManifest = new URL('public/compiled-world/manifest.json', import.meta.url);

export default defineConfig({
  base: './',
  define: {
    __KAZAN_WORLD_VERSION__: JSON.stringify(existsSync(worldManifest) ? JSON.parse(readFileSync(worldManifest)).version : null),
    __KAZAN_GEODATA_VERSION__: JSON.stringify(createHash('sha256')
      .update(readFileSync(new URL('js/kazan-geodata.json.gz', import.meta.url))).digest('hex').slice(0, 16))
  },
  server: { host: '127.0.0.1', port: 5173, strictPort: true, watch: { ignored: ['**/tools/data/**'] } },
  optimizeDeps: { noDiscovery: true },
  resolve: { alias: [
    { find: /^three$/, replacement: fileURLToPath(new URL('./node_modules/three/build/three.webgpu.js', import.meta.url)) }
  ] },
  plugins: [{
    name: 'kazan-geography',
    transformIndexHtml: {
      order: 'post',
      handler(html, context) {
        if (context.filename !== `${root}index.html`) return html;
        const cityChunk = context.bundle && Object.values(context.bundle).find((chunk) => chunk.type === 'chunk' && chunk.facadeModuleId === `${root}js/main.js`);
        const preload = cityChunk ? `./${cityChunk.fileName}` : './js/main.js';
        const transformed = html.replace(/(href="\.\/css\/style\.css)\?v=[^"]+/, '$1')
          .replace('<script type="module"', `<link rel="modulepreload" href="${preload}" />\n  <script type="module"`);
        return process.env.KAZAN_SOFTWARE_PREVIEW === '1' ? transformed.replace('<head>', '<head><script>document.documentElement.dataset.softwarePreview = "true";</script>') : transformed;
      }
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
      this.emitFile({ type: 'asset', fileName: 'js/kazan-geodata.json.gz', source: readFileSync(new URL('js/kazan-geodata.json.gz', import.meta.url)) });
    }
  }]
});
