/**
 * Centralized API URL resolver for TakeoutFix.
 * 
 * Resolves the target URL for serverless Cloudflare Pages API endpoints:
 * - On Cloudflare Pages (takeoutfix.pages.dev, takeoutfix.com): uses relative URL `/api/<endpoint>`
 * - On localhost: uses the local development server's API routes.
 * - In other external contexts: routes to `https://takeoutfix.pages.dev/api/<endpoint>`
 */
export function getApiUrl(endpoint: string): string {
  const cleanEndpoint = endpoint.replace(/^\/+/, '');
  
  if (typeof window !== 'undefined') {
    const hostname = window.location.hostname;
    const isCloudflare = hostname.endsWith('.pages.dev') || hostname === 'takeoutfix.com' || hostname.endsWith('.takeoutfix.com');
    const isLocal = hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '[::1]';
    
    // If running in browser on production Cloudflare Pages or custom domain, use relative path
    if (isCloudflare || isLocal) {
      return `/${cleanEndpoint}`;
    }
  }

  return `https://takeoutfix.pages.dev/${cleanEndpoint}`;
}
