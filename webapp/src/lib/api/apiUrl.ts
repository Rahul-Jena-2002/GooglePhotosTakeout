/**
 * Centralized API URL resolver for TakeoutFix.
 * 
 * Resolves the target URL for serverless Cloudflare Pages API endpoints:
 * - On Cloudflare Pages (takeoutfix.pages.dev, takeoutfix.com): uses relative URL `/api/<endpoint>`
 * - Inside Tauri desktop (Windows/Mac/Linux) or mobile (Android APK): routes to `https://takeoutfix.pages.dev/api/<endpoint>`
 * - In local dev with proxy: routes appropriately
 */
export function getApiUrl(endpoint: string): string {
  const cleanEndpoint = endpoint.replace(/^\/+/, '');
  
  if (typeof window !== 'undefined') {
    const hostname = window.location.hostname;
    const isCloudflare = (hostname.endsWith('.pages.dev') || hostname.endsWith('takeoutfix.com')) &&
      !hostname.includes('tauri');
    
    // If running in browser on production Cloudflare Pages or custom domain, use relative path
    if (isCloudflare) {
      return `/${cleanEndpoint}`;
    }
  }

  // Inside Tauri (tauri.localhost, localhost inside Android APK, or custom scheme),
  // route directly to the Cloudflare Pages deployment where the Worker API endpoints run.
  // The endpoints return Access-Control-Allow-Origin: * so cross-origin calls succeed.
  return `https://takeoutfix.pages.dev/${cleanEndpoint}`;
}
