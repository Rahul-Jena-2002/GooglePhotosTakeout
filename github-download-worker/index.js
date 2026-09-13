const REPO_OWNER = "Rahul-Jena-2002";
const REPO_NAME = "GooglePhotosTakeout";

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname.toLowerCase();

    // Map download paths to expected file names (separate portable and installer packages)
    let targetFileName = "";
    if (path === "/download/windows/portable" || path === "/download/windows/zip") {
      targetFileName = "TakeoutFix-Windows-Portable.zip";
    } else if (path === "/download/windows" || path === "/download/windows/installer" || path === "/download/windows/msi") {
      targetFileName = "TakeoutFix-Setup.msi";
    } else if (path === "/download/macos/portable" || path === "/download/macos/zip") {
      targetFileName = "TakeoutFix-macOS-Portable.zip";
    } else if (path === "/download/macos" || path === "/download/macos/installer" || path === "/download/macos/dmg") {
      targetFileName = "TakeoutFix-macOS.dmg";
    } else if (path === "/download/linux/deb") {
      targetFileName = "TakeoutFix-Linux.deb";
    } else if (path === "/download/linux/rpm") {
      targetFileName = "TakeoutFix-Linux.rpm";
    } else if (path === "/download/linux/portable" || path === "/download/linux/tar") {
      targetFileName = "TakeoutFix-Linux-Portable.tar.gz";
    } else if (path === "/download/linux") {
      targetFileName = "TakeoutFix-Linux.deb";
    } else {
      return new Response("Not Found. Available routes:\n- /download/windows/installer (MSI)\n- /download/windows/portable (.zip)\n- /download/macos/installer (.dmg)\n- /download/macos/portable (.zip)\n- /download/linux/deb (.deb)\n- /download/linux/rpm (.rpm)\n- /download/linux/portable (.tar.gz)", {
        status: 404,
        headers: { "Content-Type": "text/plain" }
      });
    }

    const token = env.GITHUB_PAT;
    // If no token is provided, redirect directly to GitHub latest release download (zero configuration needed)
    if (!token) {
      return Response.redirect(`https://github.com/${REPO_OWNER}/${REPO_NAME}/releases/latest/download/${targetFileName}`, 302);
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

      // Capture the Location header (pre-signed S3 URL) and stream the file directly
      const redirectUrl = assetResponse.headers.get("Location");
      if (assetResponse.status === 302 && redirectUrl) {
        const fileResponse = await fetch(redirectUrl);
        return new Response(fileResponse.body, {
          status: fileResponse.status,
          headers: {
            "Content-Type": "application/octet-stream",
            "Content-Disposition": `attachment; filename="${targetFileName}"`,
            "Content-Length": fileResponse.headers.get("Content-Length")
          }
        });
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
