const REPO_OWNER = "Rahul-Jena-2002";
const REPO_NAME = "GooglePhotosTakeout";

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname.toLowerCase();

    // Map download paths to expected file names
    let targetFileName = "";
    if (path === "/download/windows") {
      targetFileName = "TakeoutFix-Windows-Portable.zip";
    } else if (path === "/download/macos") {
      targetFileName = "TakeoutFix-macOS-Portable.zip";
    } else if (path === "/download/linux") {
      targetFileName = "TakeoutFix-Linux-Portable.tar.gz";
    } else {
      return new Response("Not Found. Use /download/windows, /download/macos, or /download/linux", {
        status: 404,
        headers: { "Content-Type": "text/plain" }
      });
    }

    const token = env.GITHUB_PAT;
    if (!token) {
      return new Response("Server Configuration Error: Missing GITHUB_PAT", {
        status: 500,
        headers: { "Content-Type": "text/plain" }
      });
    }

    try {
      // 1. Fetch latest release details from GitHub API
      const releaseUrl = `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/releases/latest`;
      const releaseResponse = await fetch(releaseUrl, {
        headers: {
          "Authorization": `Bearer ${token}`,
          "User-Agent": "Cloudflare-Worker",
          "Accept": "application/vnd.github.v3+json"
        }
      });

      if (!releaseResponse.ok) {
        const errorText = await releaseResponse.text();
        return new Response(`Error fetching release from GitHub: ${errorText}`, {
          status: releaseResponse.status
        });
      }

      const releaseData = await releaseResponse.json();
      const assets = releaseData.assets || [];

      // 2. Find the asset matching our target file name
      const targetAsset = assets.find(asset => asset.name === targetFileName);
      if (!targetAsset) {
        return new Response(`File ${targetFileName} not found in the latest release.`, {
          status: 404
        });
      }

      // 3. Request the asset binary from GitHub
      const assetUrl = `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/releases/assets/${targetAsset.id}`;
      const assetResponse = await fetch(assetUrl, {
        headers: {
          "Authorization": `Bearer ${token}`,
          "User-Agent": "Cloudflare-Worker",
          "Accept": "application/octet-stream"
        },
        redirect: "manual" // Stop automatic redirect follow to capture the S3 URL
      });

      // Capture the Location header (pre-signed S3 URL) and redirect the user
      const redirectUrl = assetResponse.headers.get("Location");
      if (assetResponse.status === 302 && redirectUrl) {
        return Response.redirect(redirectUrl, 302);
      }

      // If GitHub didn't return a redirect, try to stream the content directly
      return new Response(assetResponse.body, {
        status: assetResponse.status,
        headers: {
          "Content-Type": "application/octet-stream",
          "Content-Disposition": `attachment; filename="${targetFileName}"`
        }
      });

    } catch (err) {
      return new Response(`Internal Server Error: ${err.message}`, { status: 500 });
    }
  }
};
