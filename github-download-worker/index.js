const REPO_OWNER = "Rahul-Jena-2002";
const REPO_NAME = "GooglePhotosTakeout";

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname.toLowerCase();

    // Map download paths to expected file names (Direct runnable Rust & Java editions)
    let targetFileName = "";
    if (path === "/download/windows/rust" || path === "/download/windows/exe" || path === "/download/windows") {
      targetFileName = "TakeoutFix.exe";
    } else if (path === "/download/windows/java" || path === "/download/windows/installer" || path === "/download/windows/msi") {
      targetFileName = "TakeoutFix-Java.exe";
    } else if (path === "/download/macos/rust" || path === "/download/macos/dmg" || path === "/download/macos") {
      targetFileName = "TakeoutFix.dmg";
    } else if (path === "/download/macos/java") {
      targetFileName = "TakeoutFix-Java.dmg";
    } else if (path === "/download/linux/rust" || path === "/download/linux/appimage" || path === "/download/linux") {
      targetFileName = "TakeoutFix.AppImage";
    } else if (path === "/download/linux/java") {
      targetFileName = "TakeoutFix-Java.AppImage";
    } else if (path === "/download/linux/deb") {
      targetFileName = "TakeoutFix-Linux.deb";
    } else if (path === "/download/linux/rpm") {
      targetFileName = "TakeoutFix-Linux.rpm";
    } else if (path === "/" || path === "/download") {
      return Response.redirect("https://takeoutfix.pages.dev/download", 302);
    } else {
      return new Response("Not Found. Available routes:\n- /download/windows/rust (TakeoutFix.exe)\n- /download/windows/java (TakeoutFix-Java.exe)\n- /download/macos/rust (TakeoutFix.dmg)\n- /download/macos/java (TakeoutFix-Java.dmg)\n- /download/linux/rust (TakeoutFix.AppImage)\n- /download/linux/java (TakeoutFix-Java.AppImage)", {
        status: 404,
        headers: { "Content-Type": "text/plain" }
      });
    }

    const baseHeaders = {
      "User-Agent": "Cloudflare-Worker-TakeoutFix",
      "Accept": "application/vnd.github.v3+json"
    };

    const fetchGitHub = async (endpointUrl) => {
      // 1. If GITHUB_PAT is configured, try with Authorization first
      if (env.GITHUB_PAT && env.GITHUB_PAT.trim() !== "") {
        try {
          const authRes = await fetch(endpointUrl, {
            headers: { ...baseHeaders, "Authorization": `Bearer ${env.GITHUB_PAT.trim()}` }
          });
          if (authRes.ok) return authRes;
          // If token fails with 401/403/404, fall through to public unauthenticated request
        } catch (_) {}
      }

      // 2. Unauthenticated public request fallback
      return await fetch(endpointUrl, { headers: baseHeaders });
    };

    try {
      // 1. Fetch latest release details from GitHub API (or fallback to newest release list)
      let releaseData = null;
      const releaseUrl = `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/releases/latest`;
      const releaseResponse = await fetchGitHub(releaseUrl);

      if (releaseResponse.ok) {
        releaseData = await releaseResponse.json();
      } else {
        // Fallback to the first release in the repository list
        const listResponse = await fetchGitHub(`https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/releases?per_page=5`);
        if (listResponse.ok) {
          const list = await listResponse.json();
          if (Array.isArray(list) && list.length > 0) {
            releaseData = list.find(r => !r.draft) || list[0];
          }
        }
      }

      if (!releaseData) {
        return new Response(`Error fetching release from GitHub: Repository has no releases or access failed.`, {
          status: 404,
          headers: { "Content-Type": "text/plain" }
        });
      }
      const assets = releaseData.assets || [];

      // 2. Find the exact asset matching the requested target file name (no mixing portable and installer)
      const targetAsset = assets.find(asset => asset.name.toLowerCase() === targetFileName.toLowerCase());

      if (!targetAsset) {
        return new Response(
          `The requested file '${targetFileName}' was not found in release '${releaseData.tag_name || 'latest'}'.\n\n` +
          `Available assets in this release:\n${assets.map(a => '- ' + a.name).join('\n')}`,
          {
            status: 404,
            headers: { "Content-Type": "text/plain" }
          }
        );
      }

      // 3. For public releases, redirect directly to GitHub's high-speed release asset CDN
      if (targetAsset.browser_download_url) {
        return Response.redirect(targetAsset.browser_download_url, 302);
      }

      // 4. Fallback for private releases: Request the asset binary from GitHub API
      const assetUrl = `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/releases/assets/${targetAsset.id}`;
      const assetHeaders = {
        "User-Agent": "Cloudflare-Worker-TakeoutFix",
        "Accept": "application/octet-stream"
      };
      if (env.GITHUB_PAT && env.GITHUB_PAT.trim() !== "") {
        assetHeaders["Authorization"] = `Bearer ${env.GITHUB_PAT.trim()}`;
      }
      const assetResponse = await fetch(assetUrl, {
        headers: assetHeaders,
        redirect: "manual" // Stop automatic redirect follow to capture the S3 URL
      });

      // Capture the Location header (pre-signed S3 URL generated by GitHub) and redirect client directly
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
