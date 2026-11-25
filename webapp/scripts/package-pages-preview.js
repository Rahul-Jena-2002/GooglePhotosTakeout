import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

// Experimental: Astro's current Cloudflare adapter officially targets Workers.
const dist = resolve('dist');
const client = join(dist, 'client');
const server = join(dist, 'server');
const output = join(dist, 'pages-preview');
const configPath = join(server, 'wrangler.json');

if (!existsSync(join(client, 'index.html')) || !existsSync(configPath)) {
  throw new Error('Build the Cloudflare Worker and client assets before packaging a Pages preview.');
}
if (existsSync(output)) throw new Error('Remove the previous dist/pages-preview before packaging again.');
const config = JSON.parse(readFileSync(configPath, 'utf8'));
if (config.main !== 'entry.mjs' || !existsSync(join(server, config.main))) {
  throw new Error('Unexpected Cloudflare Worker entry point; inspect the adapter output before packaging.');
}

cpSync(client, output, { recursive: true });
const worker = join(output, '_worker.js');
if (existsSync(worker)) throw new Error('Client assets already contain a Pages Worker.');
mkdirSync(worker);
function copyModules(source, destination) {
  for (const entry of readdirSync(source, { withFileTypes: true })) {
    const from = join(source, entry.name);
    const to = join(destination, entry.name);
    if (entry.isDirectory() && !entry.name.startsWith('.')) {
      mkdirSync(to);
      copyModules(from, to);
    } else if (entry.isFile() && /\.(?:mjs|js)$/.test(entry.name)) {
      cpSync(from, to);
    }
  }
}
copyModules(server, worker);
// Pages asset redirects are followed inside Astro's asset fetch, hiding the
// redirect from the browser. Apply the existing exact redirects first.
const redirectsFile = join(client, '_redirects');
const redirects = existsSync(redirectsFile)
  ? readFileSync(redirectsFile, 'utf8').split(/\r?\n/).flatMap(line => {
      const [source, destination, status] = line.trim().split(/\s+/);
      if (!/^\/(?!\/)[^*:\s]*$/.test(source || '') ||
          !/^\/(?!\/)[^*:\s]*$/.test(destination || '') ||
          !['301', '302', '303', '307', '308'].includes(status)) return [];
      return [[source, [destination, Number(status)]]];
    })
  : [];
writeFileSync(join(worker, 'index.js'), `import app from "./entry.mjs";
const redirects = new Map(${JSON.stringify(redirects)});
export default {
  fetch(request, env, ctx) {
    const url = new URL(request.url);
    const rule = redirects.get(url.pathname);
    if (rule) {
      url.pathname = rule[0];
      return Response.redirect(url.toString(), rule[1]);
    }
    return app.fetch(request, env, ctx);
  }
};\n`);
console.log('Experimental Pages preview packaged in dist/pages-preview.');
