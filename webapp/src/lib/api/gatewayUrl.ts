const PRODUCTION_GATEWAY = 'https://us-central1-takeout-fix.cloudfunctions.net/geminiToolGateway';

export function resolveGatewayBase(configured: string | undefined, isDev: boolean): string {
  if (!isDev) return (configured || PRODUCTION_GATEWAY).replace(/\/$/, '');
  if (!configured) throw new Error('Configure a local gateway URL for development.');
  const url = new URL(configured);
  if (!['http:', 'https:'].includes(url.protocol) || !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) || url.username || url.password || url.search || url.hash) {
    throw new Error('Development gateway must use a local address.');
  }
  return url.toString().replace(/\/$/, '');
}
