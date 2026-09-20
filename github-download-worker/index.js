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

    // Map download paths to expected file names (Direct runnable Rust & Java editions)
    let targetFileName = "";
    if (
      path === "/download/windows/rust" ||
      path === "/download/windows/exe" ||
      path === "/download/windows" ||
      path === "/download/takeoutfix.exe" ||
      path === "/download/windows/takeoutfix.exe" ||
      path === "/download/setup.exe" ||
      path === "/download/windows/setup.exe"
    ) {
      targetFileName = "TakeoutFix.exe";
    } else if (
      path === "/download/windows/java" ||
      path === "/download/windows/installer" ||
      path === "/download/windows/msi" ||
      path === "/download/takeoutfix-java.exe" ||
      path === "/download/windows/takeoutfix-java.exe"
    ) {
      targetFileName = "TakeoutFix-Java.exe";
    } else if (
      path === "/download/macos/rust" ||
      path === "/download/macos/dmg" ||
      path === "/download/macos" ||
      path === "/download/takeoutfix.dmg" ||
      path === "/download/macos/takeoutfix.dmg"
    ) {
      targetFileName = "TakeoutFix.dmg";
    } else if (
      path === "/download/macos/java" ||
      path === "/download/takeoutfix-java.dmg" ||
      path === "/download/macos/takeoutfix-java.dmg"
    ) {
      targetFileName = "TakeoutFix-Java.dmg";
    } else if (
      path === "/download/linux/rust" ||
      path === "/download/linux/appimage" ||
      path === "/download/linux" ||
      path === "/download/takeoutfix.appimage" ||
      path === "/download/linux/takeoutfix.appimage"
    ) {
      targetFileName = "TakeoutFix.AppImage";
    } else if (
      path === "/download/linux/java" ||
      path === "/download/takeoutfix-java.appimage" ||
      path === "/download/linux/takeoutfix-java.appimage"
    ) {
      targetFileName = "TakeoutFix-Java.AppImage";
    } else if (path === "/download/linux/deb" || path === "/download/takeoutfix-linux.deb") {
      targetFileName = "TakeoutFix-Linux.deb";
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
      return new Response("Not Found. Available routes:\n- /download/windows/rust (TakeoutFix.exe)\n- /download/windows/java (TakeoutFix-Java.exe)\n- /download/macos/rust (TakeoutFix.dmg)\n- /download/macos/java (TakeoutFix-Java.dmg)\n- /download/linux/rust (TakeoutFix.AppImage)\n- /download/linux/java (TakeoutFix-Java.AppImage)\n- /download/android (TakeoutFix.apk)", {
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
      const targetAsset = assets.find(asset => asset.name.toLowerCase() === targetFileName.toLowerCase());

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

      // Check if client explicitly wants a 302 redirect
      const wantsRedirect = url.searchParams.get("redirect") === "true";
      if (wantsRedirect && targetAsset.browser_download_url) {
        return Response.redirect(targetAsset.browser_download_url, 302);
      }

      // Direct streaming (HTTP 200 / 206) with NO REDIRECTION for Microsoft Store & Package Managers
      let downloadUrl = targetAsset.browser_download_url;
      const downloadHeaders = {
        "User-Agent": "TakeoutFix-Direct-Proxy"
      };

      if (request.headers.has("Range")) {
        downloadHeaders["Range"] = request.headers.get("Range");
      }

      if (!downloadUrl && env.GITHUB_PAT && env.GITHUB_PAT.trim() !== "") {
        downloadUrl = `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/releases/assets/${targetAsset.id}`;
        downloadHeaders["Authorization"] = `Bearer ${env.GITHUB_PAT.trim()}`;
        downloadHeaders["Accept"] = "application/octet-stream";
      }

      if (!downloadUrl) {
        return new Response("Unable to resolve download URL for asset.", {
          status: 500,
          headers: { "Content-Type": "text/plain" }
        });
      }

      // Fetch upstream binary (follows redirects automatically to Azure Blob / S3)
      const binaryRes = await fetch(downloadUrl, {
        method: request.method === "HEAD" ? "HEAD" : "GET",
        headers: downloadHeaders,
        redirect: "follow"
      });

      const outHeaders = new Headers();
      outHeaders.set("Content-Type", binaryRes.headers.get("Content-Type") || "application/octet-stream");
      outHeaders.set("Content-Disposition", `attachment; filename="${targetFileName}"`);
      
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
