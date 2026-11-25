// Astro's current Cloudflare adapter produces a Worker, not a Pages build.
if (process.env.CF_PAGES === '1') {
  console.error('This Astro build targets Cloudflare Workers and cannot be published as a Pages build. Keep the current production deployment and configure a compatible release target first.');
  process.exitCode = 1;
}
