globalThis.process ??= {};
globalThis.process.env ??= {};
const prerender = false;
function decodeHtmlEntities(str) {
  return str.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&#x27;/g, "'").replace(/&#x2F;/g, "/").replace(/&nbsp;/g, " ").trim();
}
function cleanTitle(rawTitle) {
  return decodeHtmlEntities(rawTitle).replace(/\s*:\s*Amazon\.[a-z.]+/i, "").replace(/\s*\|\s*Amazon\.[a-z.]+/i, "").replace(/\s*\|\s*Flipkart\.[a-z.]+/i, "").replace(/\s*-\s*Buy\s+.*Online\s+at\s+Best\s+Prices.*$/i, "").replace(/\s*\|\s*Best\s+Price.*$/i, "").trim();
}
function extractAsin(urlStr) {
  const dpMatch = urlStr.match(/(?:\/dp\/|\/gp\/product\/|\/d\/|\/product\/|link\.amazon\/)([A-Z0-9]{10})/i);
  if (dpMatch?.[1]) return dpMatch[1].toUpperCase();
  const asinMatch = urlStr.match(/[?&]asin=([A-Z0-9]{10})/i) || urlStr.match(/\b(B0[A-Z0-9]{8})\b/i);
  if (asinMatch?.[1]) return asinMatch[1].toUpperCase();
  return null;
}
function extractSlugTitle(urlStr) {
  try {
    const parsed = new URL(urlStr);
    const pathParts = parsed.pathname.split("/").filter(Boolean);
    for (const part of pathParts) {
      if (part.length > 5 && !part.match(/^(dp|gp|product|d|ref|b|s|tag)$/i) && !part.match(/^[A-Z0-9]{10}$/i)) {
        return part.replace(/[-_+]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()).trim();
      }
    }
  } catch (_) {
  }
  return null;
}
function isSafePublicUrl(url) {
  if (url.protocol !== "http:" && url.protocol !== "https:") return false;
  const hostname = url.hostname.toLowerCase().trim();
  if (hostname === "localhost" || hostname.endsWith(".localhost") || hostname.endsWith(".local") || hostname.endsWith(".internal") || hostname.endsWith(".lan") || hostname === "metadata.google.internal" || hostname === "instance-data") {
    return false;
  }
  const ipv4Match = hostname.match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/);
  if (ipv4Match) {
    const [, o1, o2] = ipv4Match.map(Number);
    if (o1 === 127) return false;
    if (o1 === 10) return false;
    if (o1 === 172 && o2 >= 16 && o2 <= 31) return false;
    if (o1 === 192 && o2 === 168) return false;
    if (o1 === 169 && o2 === 254) return false;
    if (o1 === 0 || o1 >= 224) return false;
  }
  if (/^(?:0x[0-9a-f]+|\d+)$/i.test(hostname)) {
    return false;
  }
  if (hostname === "[::1]" || hostname === "::1" || hostname.startsWith("[fe80:") || hostname.startsWith("fe80:") || hostname.startsWith("[fc") || hostname.startsWith("[fd") || hostname.startsWith("fc") || hostname.startsWith("fd")) {
    return false;
  }
  return true;
}
async function handleExtract(request) {
  try {
    const urlObj = new URL(request.url);
    const queryUrl = urlObj.searchParams.get("url");
    let body = {};
    if (request.method === "POST") {
      try {
        body = await request.json();
      } catch {
      }
    }
    let rawUrl = (queryUrl || body?.url || "").trim();
    if (!rawUrl) {
      return new Response(JSON.stringify({ success: false, error: "URL is required" }), {
        status: 400,
        headers: { "Content-Type": "application/json" }
      });
    }
    if (!rawUrl.startsWith("http://") && !rawUrl.startsWith("https://")) {
      rawUrl = `https://${rawUrl}`;
    }
    let parsedUrl;
    try {
      parsedUrl = new URL(rawUrl);
    } catch {
      return new Response(JSON.stringify({ success: false, error: "Invalid URL provided" }), {
        status: 400,
        headers: { "Content-Type": "application/json" }
      });
    }
    if (!isSafePublicUrl(parsedUrl)) {
      return new Response(JSON.stringify({ success: false, error: "Target URL destination is not allowed" }), {
        status: 400,
        headers: { "Content-Type": "application/json" }
      });
    }
    let finalUrl = parsedUrl.toString();
    try {
      const headRes = await fetch(finalUrl, {
        method: "HEAD",
        redirect: "follow",
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
        }
      });
      if (headRes.url && headRes.url !== finalUrl) {
        const resolvedUrl = new URL(headRes.url);
        if (isSafePublicUrl(resolvedUrl)) {
          finalUrl = headRes.url;
        }
      }
    } catch (_) {
    }
    const asin = extractAsin(finalUrl) || extractAsin(rawUrl);
    const asinImageUrl = asin ? `https://m.media-amazon.com/images/P/${asin}.01._SCLZZZZZZZ_SX500_.jpg` : "";
    const slugTitle = extractSlugTitle(finalUrl) || extractSlugTitle(rawUrl);
    let title = "";
    let description = "";
    let imageUrl = asinImageUrl || "";
    try {
      const response = await fetch(finalUrl, {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
          "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
          "Accept-Language": "en-US,en;q=0.9",
          "Cache-Control": "no-cache"
        },
        redirect: "follow"
      });
      if (response.ok) {
        const html = await response.text();
        const ogImageMatch = html.match(/<meta[^>]+(?:property|name)=["'](?:og:image|twitter:image|og:image:url)["'][^>]+content=["']([^"']+)["']/i) || html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["'](?:og:image|twitter:image|og:image:url)["']/i);
        if (ogImageMatch?.[1]) {
          imageUrl = ogImageMatch[1].trim();
        }
        if (!imageUrl || imageUrl === asinImageUrl) {
          const amazonLandingMatch = html.match(/data-old-hires=["']([^"']+)["']/i) || html.match(/id=["']landingImage["'][^>]+src=["']([^"']+)["']/i) || html.match(/id=["']imgBlkFront["'][^>]+src=["']([^"']+)["']/i) || html.match(/"large":"(https:\/\/[^"]+\.jpg)"/i);
          if (amazonLandingMatch?.[1]) {
            imageUrl = amazonLandingMatch[1].trim();
          }
        }
        if (!imageUrl || imageUrl === asinImageUrl) {
          const jsonLdMatch = html.match(/<script type=["']application\/ld\+json["']>([^<]+)<\/script>/i);
          if (jsonLdMatch?.[1]) {
            try {
              const parsedLd = JSON.parse(jsonLdMatch[1]);
              if (parsedLd.image) {
                const img = Array.isArray(parsedLd.image) ? parsedLd.image[0] : typeof parsedLd.image === "string" ? parsedLd.image : parsedLd.image.url || "";
                if (img) imageUrl = img;
              }
            } catch {
            }
          }
        }
        const ogTitleMatch = html.match(/<meta[^>]+(?:property|name)=["'](?:og:title|twitter:title)["'][^>]+content=["']([^"']+)["']/i) || html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["'](?:og:title|twitter:title)["']/i);
        if (ogTitleMatch?.[1]) {
          title = cleanTitle(ogTitleMatch[1]);
        } else {
          const titleTagMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
          if (titleTagMatch?.[1]) {
            title = cleanTitle(titleTagMatch[1]);
          }
        }
        if (!title || title.length < 5) {
          const amzTitleMatch = html.match(/id=["']productTitle["'][^>]*>([^<]+)<\/span>/i);
          if (amzTitleMatch?.[1]) {
            title = cleanTitle(amzTitleMatch[1]);
          }
        }
        const ogDescMatch = html.match(/<meta[^>]+(?:property|name)=["'](?:og:description|twitter:description|description)["'][^>]+content=["']([^"']+)["']/i) || html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["'](?:og:description|twitter:description|description)["']/i);
        if (ogDescMatch?.[1]) {
          description = decodeHtmlEntities(ogDescMatch[1]);
        }
      }
    } catch (_) {
    }
    if (!title && slugTitle) {
      title = slugTitle;
    }
    if (!imageUrl && asinImageUrl) {
      imageUrl = asinImageUrl;
    }
    if (imageUrl && !imageUrl.startsWith("http")) {
      try {
        imageUrl = new URL(imageUrl, parsedUrl.origin).toString();
      } catch {
      }
    }
    return new Response(
      JSON.stringify({
        success: true,
        title: title || slugTitle || parsedUrl.hostname,
        description: description || "High performance tech accessory and photo storage gear.",
        imageUrl: imageUrl || asinImageUrl || null,
        domain: parsedUrl.hostname,
        asin: asin || null
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" }
      }
    );
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : "Failed to extract metadata";
    return new Response(
      JSON.stringify({
        success: false,
        error: errorMsg
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" }
      }
    );
  }
}
const GET = async ({ request }) => handleExtract(request);
const POST = async ({ request }) => handleExtract(request);
const _page = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  GET,
  POST,
  prerender
}, Symbol.toStringTag, { value: "Module" }));
const page = () => _page;
export {
  page
};
