import type { APIRoute } from 'astro';

export const GET: APIRoute = async (context) => {
  try {
    const runtime = context.locals.runtime;
    const env = runtime?.env;
    const statsKv = env?.STATS_KV;

    if (statsKv) {
      const cached = await statsKv.get("global_stats");
      if (cached) {
        return new Response(cached, {
          status: 200,
          headers: {
            'Content-Type': 'application/json',
            'Cache-Control': 'public, max-age=300'
          }
        });
      }
    }

    // Fallback: Fetch directly from Firestore REST API
    const firestoreUrl = "https://firestore.googleapis.com/v1/projects/gt-metadata-merger/databases/(default)/documents/platform_stats/global";
    const res = await fetch(firestoreUrl);
    
    if (res.ok) {
      const data = await res.json();
      const fields = data.fields || {};
      
      const stats = {
        filesRestored: parseInt(fields.filesRestored?.integerValue || "11347"),
        bytesProcessed: parseInt(fields.bytesProcessed?.integerValue || "14577672926"),
        ticketsResolved: parseInt(fields.ticketsResolved?.integerValue || "1"),
        usersCount: parseInt(fields.usersCount?.integerValue || "5"),
        filesScanned: parseInt(fields.filesScanned?.integerValue || "11347")
      };

      const statsJson = JSON.stringify(stats);

      // Cache back to Cloudflare KV for 5 minutes (300 seconds) if binding is available
      if (statsKv) {
        await statsKv.put("global_stats", statsJson, { expirationTtl: 300 });
      }

      return new Response(statsJson, {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'public, max-age=300'
        }
      });
    }

    // Default fallback values if both KV and Firestore REST fail
    const fallbackStats = {
      filesRestored: 11347,
      bytesProcessed: 14577672926,
      ticketsResolved: 1,
      usersCount: 5,
      filesScanned: 11347
    };

    return new Response(JSON.stringify(fallbackStats), {
      status: 200,
      headers: {
        'Content-Type': 'application/json'
      }
    });

  } catch (err) {
    console.error("API stats edge worker failure:", err);
    return new Response(JSON.stringify({ error: "Internal Server Error" }), {
      status: 500,
      headers: {
        'Content-Type': 'application/json'
      }
    });
  }
};
