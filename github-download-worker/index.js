const REPO_OWNER = "Rahul-Jena-2002";
const REPO_NAME = "GooglePhotosTakeout";

export default {
  async fetch(request, env, ctx) {
    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS",
          "Access-Control-Allow-Headers": "*"
        }
      });
    }

    const url = new URL(request.url);
    let path = url.pathname.toLowerCase();
    if (path.startsWith("/downloads")) {
      path = "/download" + path.slice("/downloads".length);
    }

    // Check for version parameter or path prefix (e.g., /download/2.1.3/setup.exe, /downloads/2.1.3/TakeoutFix.exe, ?v=v2.1.3)
    let requestedVersion = url.searchParams.get("v") || url.searchParams.get("version") || "";
    const versionMatch = path.match(/^\/download\/(?:windows\/)?(v?\d+\.\d+(?:\.\d+)?)(?:\/(.*))?$/);
    if (versionMatch) {
      requestedVersion = requestedVersion || versionMatch[1];
      path = "/download" + (versionMatch[2] ? "/" + versionMatch[2] : "");
    }

    // Map download paths to expected file names
    // PRIMARY: /download/windows → TakeoutFix.exe (direct standalone zero-install single-file executable)
    // INSTALLER: /download/windows/setup → TakeoutFix-Setup.exe (WiX setup wizard)
    let targetFileName = "";
    if (
      path === "/download/windows/setup" ||
      path === "/download/windows/installer" ||
      path === "/download/windows/msi" ||
      path === "/download/setup.exe" ||
      path === "/download/windows/setup.exe" ||
      path === "/download/takeoutfix-setup.exe" ||
      path === "/download/windows/takeoutfix-setup.exe"
    ) {
      targetFileName = "TakeoutFix-Setup.exe";
    } else if (
      path === "/download/windows" ||
      path === "/download/windows/exe" ||
      path === "/download/windows/standalone" ||
      path === "/download/windows/rust" ||
      path === "/download/windows/java" ||
      path === "/download/takeoutfix.exe" ||
      path === "/download/windows/takeoutfix.exe" ||
      path === "/download/takeoutfix-java.exe" ||
      path === "/download/windows/takeoutfix-java.exe"
    ) {
      targetFileName = "TakeoutFix.exe";
    } else if (
      path === "/download/windows/payload" ||
      path === "/download/windows/payload.zip" ||
      path === "/download/takeoutfix-payload.zip"
    ) {
      targetFileName = "TakeoutFix-payload.zip";
    } else if (
      path === "/download/macos" ||
      path === "/download/macos/dmg" ||
      path === "/download/macos/rust" ||
      path === "/download/macos/java" ||
      path === "/download/takeoutfix.dmg" ||
      path === "/download/macos/takeoutfix.dmg" ||
      path === "/download/takeoutfix-java.dmg" ||
      path === "/download/macos/takeoutfix-java.dmg"
    ) {
      targetFileName = "TakeoutFix.dmg";
    } else if (
      path === "/download/linux" ||
      path === "/download/linux/appimage" ||
      path === "/download/linux/rust" ||
      path === "/download/linux/java" ||
      path === "/download/takeoutfix.appimage" ||
      path === "/download/linux/takeoutfix.appimage" ||
      path === "/download/takeoutfix-java.appimage" ||
      path === "/download/linux/takeoutfix-java.appimage"
    ) {
      targetFileName = "TakeoutFix.AppImage";
    } else if (
      path === "/download/linux/deb" ||
      path === "/download/takeoutfix.deb" ||
      path === "/download/takeoutfix-linux.deb" ||
      path === "/download/takeoutfix-java.deb"
    ) {
      targetFileName = "TakeoutFix.deb";
    } else if (
      path === "/download/linux/tar" ||
      path === "/download/linux/portable" ||
      path === "/download/takeoutfix-linux-portable.tar.gz"
    ) {
      targetFileName = "TakeoutFix-Linux-Portable.tar.gz";
    } else if (path === "/download/linux/rpm" || path === "/download/takeoutfix-linux.rpm") {
      targetFileName = "TakeoutFix-Linux.rpm";
    } else if (
      path === "/download/android" ||
      path === "/download/android/apk" ||
      path === "/download/takeoutfix.apk" ||
      path === "/download/android/takeoutfix.apk"
    ) {
      targetFileName = "TakeoutFix.apk";
    } else if (path === "/" || path === "/download") {
      return Response.redirect("https://takeoutfix.pages.dev/download", 302);
    } else {
      return new Response("Not Found. Available routes:\n- /download/windows (TakeoutFix-Setup.exe - Installer, SmartScreen-friendly)\n- /download/windows/standalone (TakeoutFix.exe - Standalone, No Install)\n- /download/macos (TakeoutFix.dmg)\n- /download/linux (TakeoutFix.AppImage)\n- /download/linux/deb (TakeoutFix.deb)\n- /download/linux/portable (TakeoutFix-Linux-Portable.tar.gz)", {
        status: 404,
        headers: { "Content-Type": "text/plain", "Access-Control-Allow-Origin": "*" }
      });
    }

    const baseHeaders = {
      "User-Agent": "TakeoutFix-Download-Worker",
      "Accept": "application/vnd.github.v3+json"
    };

    const fetchGitHub = async (endpointUrl) => {
      const separator = endpointUrl.includes("?") ? "&" : "?";
      const freshUrl = `${endpointUrl}${separator}_t=${Date.now()}`;
      if (env.GITHUB_PAT && env.GITHUB_PAT.trim() !== "") {
        try {
          const authRes = await fetch(freshUrl, {
            headers: { ...baseHeaders, "Authorization": `Bearer ${env.GITHUB_PAT.trim()}` },
            cf: { cacheTtl: 0 }
          });
          if (authRes.ok) return authRes;
        } catch (_) {}
      }
      return await fetch(freshUrl, { headers: baseHeaders, cf: { cacheTtl: 0 } });
    };

    try {
      // 1. Fetch release details from GitHub API
      let releaseData = null;
      if (requestedVersion) {
        const tag = requestedVersion.startsWith("v") ? requestedVersion : `v${requestedVersion}`;
        const tagUrl = `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/releases/tags/${tag}`;
        const tagResponse = await fetchGitHub(tagUrl);
        if (tagResponse.ok) {
          releaseData = await tagResponse.json();
        }
      }

      if (!releaseData) {
        const releaseUrl = `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/releases/latest`;
        const releaseResponse = await fetchGitHub(releaseUrl);

        if (releaseResponse.ok) {
          releaseData = await releaseResponse.json();
        } else {
          // Fallback to the newest release in repository list
          const listResponse = await fetchGitHub(`https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/releases?per_page=5`);
          if (listResponse.ok) {
            const list = await listResponse.json();
            if (Array.isArray(list) && list.length > 0) {
              releaseData = list.find(r => !r.draft) || list[0];
            }
          }
        }
      }

      if (!releaseData) {
        return new Response(`Error fetching release from GitHub: Repository has no releases or access failed.`, {
          status: 404,
          headers: { "Content-Type": "text/plain", "Access-Control-Allow-Origin": "*" }
        });
      }

      const assets = releaseData.assets || [];
      
      // Smart asset resolver prioritizing pure binaries over any zip archives
      let targetAsset = assets.find(asset => asset.name.toLowerCase() === targetFileName.toLowerCase());

      if (!targetAsset) {
        if (targetFileName === "TakeoutFix.exe") {
          // Find standalone .exe, explicitly excluding zip archives and setups
          targetAsset = assets.find(asset => {
            const name = asset.name.toLowerCase();
            return name.endsWith(".exe") && !name.includes("setup") && !name.endsWith(".zip");
          }) || assets.find(asset => asset.name.toLowerCase().endsWith(".exe"));
        } else if (targetFileName === "TakeoutFix-Setup.exe") {
          targetAsset = assets.find(asset => asset.name.toLowerCase().includes("setup") && asset.name.toLowerCase().endsWith(".exe"));
        } else if (targetFileName === "TakeoutFix.dmg") {
          targetAsset = assets.find(asset => asset.name.toLowerCase().endsWith(".dmg"));
        } else if (targetFileName === "TakeoutFix.AppImage") {
          targetAsset = assets.find(asset => asset.name.toLowerCase().endsWith(".appimage"));
        } else if (targetFileName === "TakeoutFix.deb") {
          targetAsset = assets.find(asset => asset.name.toLowerCase().endsWith(".deb"));
        }
      }

      if (!targetAsset) {
        return new Response(
          `The requested file '${targetFileName}' was not found in release '${releaseData.tag_name || 'latest'}'.\n\n` +
          `Available assets in this release:\n${assets.map(a => '- ' + a.name).join('\n')}`,
          {
            status: 404,
            headers: { "Content-Type": "text/plain", "Access-Control-Allow-Origin": "*" }
          }
        );
      }

      // 302 Redirect directly to GitHub Release asset URL by default.
      // This routes the download via github.com with highest domain trust, preventing Cloudflare Worker SmartScreen domain blocks.
      // If client explicitly requests ?stream=true, it falls back to direct streaming.
      const wantsStream = url.searchParams.get("stream") === "true";
      if (!wantsStream && targetAsset.browser_download_url) {
        return Response.redirect(targetAsset.browser_download_url, 302);
      }

      // Direct streaming (HTTP 200 / 206) with NO REDIRECTION for Microsoft Store & Package Managers
      let binaryRes = null;

      // 1. If GITHUB_PAT is configured, use GitHub's authenticated API asset endpoint
      // This is mandatory for Private Repositories where browser_download_url requires a browser login
      if (env.GITHUB_PAT && env.GITHUB_PAT.trim() !== "") {
        try {
          const assetApiUrl = `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/releases/assets/${targetAsset.id}`;
          const assetRes = await fetch(assetApiUrl, {
            method: "GET",
            headers: {
              "User-Agent": "TakeoutFix-Direct-Proxy",
              "Authorization": `Bearer ${env.GITHUB_PAT.trim()}`,
              "Accept": "application/octet-stream"
            },
            redirect: "manual" // Intercept the 302 redirect to get pre-signed storage URL
          });

          // GitHub API returns 302 with signed AWS S3/Azure storage URL in Location header
          if (assetRes.status === 302 || assetRes.status === 301) {
            const signedStorageUrl = assetRes.headers.get("Location");
            if (signedStorageUrl) {
              const streamHeaders = {
                "User-Agent": "TakeoutFix-Direct-Proxy"
              };
              if (request.headers.has("Range")) {
                streamHeaders["Range"] = request.headers.get("Range");
              }
              // Fetch from signed storage WITHOUT GitHub Authorization header (avoids AWS auth conflict)
              binaryRes = await fetch(signedStorageUrl, {
                method: request.method === "HEAD" ? "HEAD" : "GET",
                headers: streamHeaders,
                redirect: "follow"
              });
            }
          } else if (assetRes.ok) {
            binaryRes = assetRes;
          }
        } catch (_) {}
      }

      // 2. Fallback to public browser download URL if unauthenticated or public repository
      if (!binaryRes && targetAsset.browser_download_url) {
        const downloadHeaders = {
          "User-Agent": "TakeoutFix-Direct-Proxy"
        };
        if (request.headers.has("Range")) {
          downloadHeaders["Range"] = request.headers.get("Range");
        }
        binaryRes = await fetch(targetAsset.browser_download_url, {
          method: request.method === "HEAD" ? "HEAD" : "GET",
          headers: downloadHeaders,
          redirect: "follow"
        });
      }

      if (!binaryRes || (!binaryRes.ok && binaryRes.status !== 206)) {
        return new Response("Unable to stream download asset from release storage.", {
          status: binaryRes ? binaryRes.status : 500,
          headers: { "Content-Type": "text/plain", "Access-Control-Allow-Origin": "*" }
        });
      }

      const outHeaders = new Headers();
      outHeaders.set("Content-Type", binaryRes.headers.get("Content-Type") || "application/octet-stream");
      outHeaders.set("Content-Disposition", `attachment; filename="${targetFileName}"`);
      // X-App-Version: used by the self-updating launcher to detect new releases without a separate API call
      if (releaseData.tag_name) {
        outHeaders.set("X-App-Version", releaseData.tag_name.replace(/^v/, ""));
      }
      const contentLength = binaryRes.headers.get("Content-Length");
      if (contentLength) {
        outHeaders.set("Content-Length", contentLength);
      }
      const acceptRanges = binaryRes.headers.get("Accept-Ranges");
      if (acceptRanges) {
        outHeaders.set("Accept-Ranges", acceptRanges);
      }
      const contentRange = binaryRes.headers.get("Content-Range");
      if (contentRange) {
        outHeaders.set("Content-Range", contentRange);
      }
      const etag = binaryRes.headers.get("ETag");
      if (etag) {
        outHeaders.set("ETag", etag);
      }
      const lastModified = binaryRes.headers.get("Last-Modified");
      if (lastModified) {
        outHeaders.set("Last-Modified", lastModified);
      }

      outHeaders.set("Access-Control-Allow-Origin", "*");
      if (requestedVersion) {
        outHeaders.set("Cache-Control", "public, max-age=86400");
      } else {
        outHeaders.set("Cache-Control", "public, max-age=60, s-maxage=60, must-revalidate");
      }

      return new Response(request.method === "HEAD" ? null : binaryRes.body, {
        status: binaryRes.status,
        headers: outHeaders
      });

    } catch (err) {
      return new Response(`Internal Server Error: ${err.message}`, {
        status: 500,
        headers: { "Content-Type": "text/plain", "Access-Control-Allow-Origin": "*" }
      });
    }
  }
};
