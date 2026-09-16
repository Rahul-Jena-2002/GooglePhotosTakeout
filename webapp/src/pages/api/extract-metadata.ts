import type { APIRoute } from "astro";

export const prerender = false;

function decodeHtmlEntities(str: string): string {
  return str
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/g, "'")
    .replace(/&#x2F;/g, "/")
    .replace(/&nbsp;/g, " ")
    .trim();
}

async function handleExtract(request: Request) {
  try {
    const urlObj = new URL(request.url);
    const queryUrl = urlObj.searchParams.get("url");
    let body: any = {};
    if (request.method === "POST") {
      try {
        body = await request.json();
      } catch {
        // Body might be empty or query param used
      }
    }
    const rawUrl = (queryUrl || body?.url || "").trim();

    if (!rawUrl) {
      return new Response(JSON.stringify({ success: false, error: "URL is required" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Ensure URL has protocol
    let parsedUrl: URL;
    try {
      parsedUrl = new URL(rawUrl.startsWith("http") ? rawUrl : `https://${rawUrl}`);
    } catch {
      return new Response(JSON.stringify({ success: false, error: "Invalid URL provided" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Fetch destination page with browser user-agent
    const response = await fetch(parsedUrl.toString(), {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
      },
      redirect: "follow",
    });

    if (!response.ok) {
      return new Response(JSON.stringify({ success: false, error: `Failed to fetch page: HTTP ${response.status}` }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    const html = await response.text();

    // ── 1. Image extraction ───────────────────────────────────────
    let imageUrl = "";

    // OpenGraph image
    const ogImageMatch = html.match(/<meta[^>]+(?:property|name)=["'](?:og:image|twitter:image|og:image:url)["'][^>]+content=["']([^"']+)["']/i)
      || html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["'](?:og:image|twitter:image|og:image:url)["']/i);
    if (ogImageMatch?.[1]) {
      imageUrl = ogImageMatch[1].trim();
    }

    // Amazon landing image detection fallback
    if (!imageUrl) {
      const amazonLandingMatch = html.match(/data-old-hires=["']([^"']+)["']/i)
        || html.match(/id=["']landingImage["'][^>]+src=["']([^"']+)["']/i)
        || html.match(/id=["']imgBlkFront["'][^>]+src=["']([^"']+)["']/i)
        || html.match(/"large":"(https:\/\/[^"]+\.jpg)"/i);
      if (amazonLandingMatch?.[1]) {
        imageUrl = amazonLandingMatch[1].trim();
      }
    }

    // Standard HTML link rel="image_src"
    if (!imageUrl) {
      const linkImageMatch = html.match(/<link[^>]+rel=["']image_src["'][^>]+href=["']([^"']+)["']/i);
      if (linkImageMatch?.[1]) {
        imageUrl = linkImageMatch[1].trim();
      }
    }

    // JSON-LD fallback for schema product image
    if (!imageUrl) {
      const jsonLdMatch = html.match(/<script type=["']application\/ld\+json["']>([^<]+)<\/script>/i);
      if (jsonLdMatch?.[1]) {
        try {
          const parsedLd = JSON.parse(jsonLdMatch[1]);
          if (parsedLd.image) {
            imageUrl = Array.isArray(parsedLd.image) ? parsedLd.image[0] : (typeof parsedLd.image === "string" ? parsedLd.image : parsedLd.image.url || "");
          }
        } catch {
          // Ignore json-ld parse error
        }
      }
    }

    // Resolve relative image URLs against target URL
    if (imageUrl && !imageUrl.startsWith("http")) {
      try {
        imageUrl = new URL(imageUrl, parsedUrl.origin).toString();
      } catch {
        // Ignore invalid URL
      }
    }

    // ── 2. Title extraction ───────────────────────────────────────
    let title = "";
    const ogTitleMatch = html.match(/<meta[^>]+(?:property|name)=["'](?:og:title|twitter:title)["'][^>]+content=["']([^"']+)["']/i)
      || html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["'](?:og:title|twitter:title)["']/i);
    if (ogTitleMatch?.[1]) {
      title = ogTitleMatch[1];
    } else {
      const titleTagMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
      if (titleTagMatch?.[1]) {
        title = titleTagMatch[1];
      }
    }
    title = decodeHtmlEntities(title);

    // Clean up common suffix noise from titles (e.g. " : Amazon.in: Electronics" or " | Flipkart")
    title = title
      .replace(/\s*:\s*Amazon\.[a-z.]+/i, "")
      .replace(/\s*\|\s*Amazon\.[a-z.]+/i, "")
      .replace(/\s*\|\s*Flipkart\.[a-z.]+/i, "")
      .trim();

    // ── 3. Description extraction ─────────────────────────────────
    let description = "";
    const ogDescMatch = html.match(/<meta[^>]+(?:property|name)=["'](?:og:description|twitter:description|description)["'][^>]+content=["']([^"']+)["']/i)
      || html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["'](?:og:description|twitter:description|description)["']/i);
    if (ogDescMatch?.[1]) {
      description = decodeHtmlEntities(ogDescMatch[1]);
    }

    return new Response(
      JSON.stringify({
        success: true,
        imageUrl: imageUrl || null,
        title: title || null,
        description: description || null,
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }
    );
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : "Failed to extract metadata";
    return new Response(
      JSON.stringify({
        success: false,
        error: errorMsg,
      }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      }
    );
  }
}

export const GET: APIRoute = async ({ request }) => handleExtract(request);
export const POST: APIRoute = async ({ request }) => handleExtract(request);
