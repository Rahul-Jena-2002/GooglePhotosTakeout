const RETAILER_HOSTS = new Set([
  'amazon.com', 'www.amazon.com', 'amazon.in', 'www.amazon.in',
  'amazon.co.uk', 'www.amazon.co.uk', 'amazon.ca', 'www.amazon.ca',
  'amazon.de', 'www.amazon.de', 'amazon.fr', 'www.amazon.fr',
  'amazon.it', 'www.amazon.it', 'amazon.es', 'www.amazon.es',
  'amazon.co.jp', 'www.amazon.co.jp', 'amazon.com.au', 'www.amazon.com.au',
  'amzn.to', 'flipkart.com', 'www.flipkart.com', 'dl.flipkart.com', 'fkrt.it'
]);

export function isAllowedAffiliateFetchUrl(url: URL): boolean {
  return url.protocol === 'https:' && !url.username && !url.password && !url.port && RETAILER_HOSTS.has(url.hostname.toLowerCase());
}

export async function fetchAffiliatePage(initialUrl: URL): Promise<{ response: Response; finalUrl: string }> {
  if (!isAllowedAffiliateFetchUrl(initialUrl)) throw new Error('Unsupported retailer URL.');
  let finalUrl = initialUrl.toString();
  for (let redirects = 0; redirects <= 4; redirects++) {
    const response = await fetch(finalUrl, { redirect: 'manual', signal: AbortSignal.timeout(10000), headers: { Accept: 'text/html,application/xhtml+xml' } });
    if (![301, 302, 303, 307, 308].includes(response.status)) return { response, finalUrl };
    const location = response.headers.get('location');
    if (!location || redirects === 4) throw new Error('Could not safely follow the retailer link. Enter the product details manually.');
    const next = new URL(location, finalUrl);
    if (!isAllowedAffiliateFetchUrl(next)) throw new Error('The link redirects outside supported retailers. Enter the product details manually.');
    await response.body?.cancel();
    finalUrl = next.toString();
  }
  throw new Error('Too many redirects.');
}
