package com.takeoutfix.network;

import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpHandler;
import com.sun.net.httpserver.HttpServer;
import org.json.JSONObject;

import java.io.IOException;
import java.io.OutputStream;
import java.net.InetSocketAddress;
import java.net.URLDecoder;
import java.nio.charset.StandardCharsets;
import java.util.HashMap;
import java.util.Map;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.function.Consumer;

/**
 * Ultra-lightweight local HTTP server for receiving browser OAuth callbacks and redirects.
 * Starts dynamically on port 0 (ephemeral OS-assigned port, zero port collision).
 * Stays open briefly to allow browser redirects and confirmations to complete without connection drop.
 */
public class DesktopAuthServer {

    private static HttpServer server = null;
    private static int activePort = 0;
    private static Consumer<Map<String, Object>> authCallback = null;
    private static volatile String expectedStateToken = null;
    private static final AtomicBoolean dispatched = new AtomicBoolean(false);
    private static ScheduledExecutorService shutdownScheduler = null;

    public static synchronized int start(Consumer<Map<String, Object>> callback) {
        return start(callback, null);
    }

    public static synchronized int start(Consumer<Map<String, Object>> callback, String stateToken) {
        stop(); // Stop any previous instance if lingering

        try {
            authCallback = callback;
            expectedStateToken = stateToken;
            dispatched.set(false);
            // Bind to 127.0.0.1 on port 0 -> OS chooses any free ephemeral port
            server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
            activePort = server.getAddress().getPort();

            CallbackHandler handler = new CallbackHandler();
            server.createContext("/callback", handler);
            server.createContext("/api/user/sync", handler);
            server.setExecutor(Executors.newCachedThreadPool());
            server.start();

            System.out.println("[DesktopAuthServer] Started on http://127.0.0.1:" + activePort + "/callback");
            return activePort;
        } catch (IOException e) {
            System.err.println("[DesktopAuthServer] Failed to start server: " + e.getMessage());
            return 0;
        }
    }

    public static synchronized int getPort() {
        return activePort;
    }

    public static synchronized void stop() {
        if (shutdownScheduler != null && !shutdownScheduler.isShutdown()) {
            try {
                shutdownScheduler.shutdownNow();
            } catch (Exception ignored) {}
            shutdownScheduler = null;
        }
        if (server != null) {
            try {
                server.stop(0);
            } catch (Exception ignored) {}
            server = null;
            activePort = 0;
        }
    }

    /**
     * Fallback processor for manually pasted authorization URLs, JSON tokens, or JWTs.
     * Guarantees login capability even when local network policies block loopback requests.
     */
    public static boolean processManualAuth(String input, Consumer<Map<String, Object>> callback) {
        if (input == null || input.isBlank()) return false;
        String trimmed = input.trim();

        try {
            Map<String, Object> params = new HashMap<>();

            // Case 1: Full callback URL
            if (trimmed.contains("?") && trimmed.contains("=")) {
                String query = trimmed.substring(trimmed.indexOf("?") + 1);
                parseQueryString(query, params);
            }
            // Case 2: JSON payload
            else if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
                JSONObject json = new JSONObject(trimmed);
                for (String key : json.keySet()) {
                    params.put(key, json.get(key));
                }
            }
            // Case 3: Raw Token / ID Token (e.g. JWT)
            else if (trimmed.startsWith("eyJ") || trimmed.length() > 50) {
                params = DirectAuthHttpsService.lookupUserByToken(trimmed);
            }

            if (params.containsKey("token") && !params.containsKey("idToken")) {
                params.put("idToken", params.get("token"));
            }
            if (params.containsKey("idToken") && !params.containsKey("token")) {
                params.put("token", params.get("idToken"));
            }

            DirectAuthHttpsService.enrichFromFirestoreIfPresent(params);

            if (params.containsKey("email") || params.containsKey("uid") || params.containsKey("idToken")) {
                if (callback != null) {
                    callback.accept(params);
                }
                stop();
                return true;
            }
        } catch (Exception e) {
            System.err.println("[DesktopAuthServer] Manual auth parsing error: " + e.getMessage());
        }
        return false;
    }

    private static class CallbackHandler implements HttpHandler {
        @Override
        public void handle(HttpExchange exchange) throws IOException {
            // Restrict CORS to trusted TakeoutFix origins and local development
            String origin = exchange.getRequestHeaders().getFirst("Origin");
            if (origin != null && (
                    origin.equalsIgnoreCase("https://takeoutfix.pages.dev") ||
                    origin.equalsIgnoreCase("https://takeoutfix.com") ||
                    origin.equalsIgnoreCase("https://www.takeoutfix.com") ||
                    origin.startsWith("http://localhost:") ||
                    origin.startsWith("http://127.0.0.1:"))) {
                exchange.getResponseHeaders().set("Access-Control-Allow-Origin", origin);
                exchange.getResponseHeaders().set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
                exchange.getResponseHeaders().set("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Requested-With");
                exchange.getResponseHeaders().set("Access-Control-Allow-Private-Network", "true");
            }

            if ("OPTIONS".equalsIgnoreCase(exchange.getRequestMethod())) {
                exchange.sendResponseHeaders(204, -1);
                return;
            }

            Map<String, Object> params = new HashMap<>();

            // 1. Parse URL Query parameters
            String query = exchange.getRequestURI().getQuery();
            if (query != null && !query.isEmpty()) {
                parseQueryString(query, params);
            }

            // 2. Parse body if POST
            if ("POST".equalsIgnoreCase(exchange.getRequestMethod())) {
                String body = new String(exchange.getRequestBody().readAllBytes(), StandardCharsets.UTF_8);
                if (!body.isEmpty()) {
                    if (body.startsWith("{")) {
                        try {
                            JSONObject json = new JSONObject(body);
                            for (String key : json.keySet()) {
                                params.put(key, json.get(key));
                            }
                        } catch (Exception ignored) {}
                    } else {
                        parseQueryString(body, params);
                    }
                }
            }

            if (params.containsKey("token") && !params.containsKey("idToken")) {
                params.put("idToken", params.get("token"));
            }
            if (params.containsKey("idToken") && !params.containsKey("token")) {
                params.put("token", params.get("idToken"));
            }

            // Enrich via HTTPS if quota not yet populated
            DirectAuthHttpsService.enrichFromFirestoreIfPresent(params);

            // Return response to browser
            byte[] responseBytes;
            boolean wantJson = (exchange.getRequestHeaders().getFirst("Accept") != null &&
                               exchange.getRequestHeaders().getFirst("Accept").contains("application/json")) ||
                               "XMLHttpRequest".equalsIgnoreCase(exchange.getRequestHeaders().getFirst("X-Requested-With"));

            try {
                if (wantJson) {
                    exchange.getResponseHeaders().set("Content-Type", "application/json; charset=utf-8");
                    responseBytes = ("{\"status\":\"ok\",\"message\":\"Authenticated\",\"user\":\"" + params.getOrDefault("email", "") + "\"}").getBytes(StandardCharsets.UTF_8);
                    exchange.sendResponseHeaders(200, responseBytes.length);
                } else {
                    // Direct HTML response with Close Window button and 10-second auto-close.
                    // Absolutely NO redirect back with desktop_port, completely preventing redirect loops and dino games!
                    String userEmail = String.valueOf(params.getOrDefault("email", "Operator"));
                    String html = """
                        <!DOCTYPE html>
                        <html lang="en">
                        <head>
                            <meta charset="utf-8">
                            <meta name="viewport" content="width=device-width, initial-scale=1.0">
                            <title>TakeoutFix — Connected</title>
                            <style>
                                * { box-sizing: border-box; }
                                body { background: #09090b; color: #f4f4f5; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; padding: 20px; }
                                .card { background: #18181b; border: 1px solid #27272a; border-radius: 24px; padding: 36px 28px; max-width: 420px; width: 100%; text-align: center; box-shadow: 0 25px 50px -12px rgba(0,0,0,0.6); }
                                .icon { width: 56px; height: 56px; border-radius: 50%; background: rgba(16, 185, 129, 0.15); border: 1px solid rgba(16, 185, 129, 0.3); color: #10b981; display: flex; align-items: center; justify-content: center; margin: 0 auto 16px; font-size: 26px; font-weight: bold; }
                                h1 { font-size: 22px; font-weight: 800; margin: 0 0 8px; color: #ffffff; letter-spacing: -0.02em; }
                                .badge { display: inline-block; background: #27272a; color: #10b981; padding: 5px 14px; border-radius: 999px; font-size: 13px; font-weight: 600; margin-bottom: 16px; border: 1px solid #3f3f46; word-break: break-all; }
                                p { font-size: 14px; color: #a1a1aa; margin: 0 0 24px; line-height: 1.5; }
                                .btn { background: #ffffff; color: #09090b; font-weight: 700; padding: 13px 24px; border-radius: 12px; border: none; cursor: pointer; font-size: 14px; width: 100%; transition: background 0.15s ease; }
                                .btn:hover { background: #e4e4e7; }
                                .timer { font-size: 12px; color: #71717a; margin-top: 16px; }
                            </style>
                        </head>
                        <body>
                            <div class="card">
                                <div class="icon">✓</div>
                                <h1>Successfully Connected!</h1>
                                <div class="badge">%EMAIL%</div>
                                <p>TakeoutFix Desktop is now authenticated. Your session is active and quota is unlocked.</p>
                                <button class="btn" onclick="tryClose()">Close Window</button>
                                <div class="timer" id="timer">Auto-closing window in <span id="sec">10</span>s...</div>
                            </div>
                            <script>
                                function tryClose() {
                                    try { window.close(); } catch(e) {}
                                    try { window.open('', '_self', '').close(); } catch(e) {}
                                }
                                let s = 10;
                                const secEl = document.getElementById("sec");
                                const interval = setInterval(() => {
                                    s--;
                                    if (secEl) secEl.textContent = s;
                                    if (s <= 0) {
                                        clearInterval(interval);
                                        tryClose();
                                    }
                                }, 1000);
                            </script>
                        </body>
                        </html>
                        """.replace("%EMAIL%", userEmail);

                    responseBytes = html.getBytes(StandardCharsets.UTF_8);
                    exchange.getResponseHeaders().set("Content-Type", "text/html; charset=utf-8");
                    exchange.sendResponseHeaders(200, responseBytes.length);
                }

                try (OutputStream os = exchange.getResponseBody()) {
                    os.write(responseBytes);
                    os.flush();
                }
            } catch (Exception sendErr) {
                System.err.println("[DesktopAuthServer] Error sending response to browser: " + sendErr.getMessage());
            }

            // Anti-CSRF verification: if an expected state was specified, enforce exact match
            if (expectedStateToken != null && !expectedStateToken.isBlank()) {
                String state = String.valueOf(params.getOrDefault("state", ""));
                if (!expectedStateToken.equals(state)) {
                    System.err.println("[DesktopAuthServer] Rejected auth callback: state token mismatch.");
                    byte[] errBytes = "{\"status\":\"error\",\"message\":\"State token mismatch\"}".getBytes(StandardCharsets.UTF_8);
                    exchange.getResponseHeaders().set("Content-Type", "application/json");
                    exchange.sendResponseHeaders(403, errBytes.length);
                    try (OutputStream os = exchange.getResponseBody()) {
                        os.write(errBytes);
                    }
                    return;
                }
            }

            // Dispatch to callback if valid credentials exist
            boolean hasAuth = params.containsKey("email") || params.containsKey("uid") ||
                             params.containsKey("token") || params.containsKey("idToken");

            if (hasAuth && dispatched.compareAndSet(false, true)) {
                // Bring Java desktop application immediately to foreground
                javax.swing.SwingUtilities.invokeLater(() -> {
                    for (java.awt.Frame f : java.awt.Frame.getFrames()) {
                        if (f.isVisible()) {
                            try {
                                f.setAlwaysOnTop(true);
                                f.toFront();
                                f.requestFocus();
                                f.setAlwaysOnTop(false);
                            } catch (Exception ignored) {}
                        }
                    }
                });

                Consumer<Map<String, Object>> cb = authCallback;
                if (cb != null) {
                    Executors.newSingleThreadExecutor().submit(() -> {
                        try {
                            cb.accept(params);
                        } catch (Exception e) {
                            System.err.println("[DesktopAuthServer] Callback dispatch error: " + e.getMessage());
                        }
                    });
                }

                // Keep the server open for 120 seconds so all browser tabs and reloads finish cleanly without dino game
                if (shutdownScheduler == null || shutdownScheduler.isShutdown()) {
                    shutdownScheduler = Executors.newSingleThreadScheduledExecutor();
                }
                shutdownScheduler.schedule(DesktopAuthServer::stop, 120, TimeUnit.SECONDS);
            }
        }
    }

    private static void parseQueryString(String str, Map<String, Object> map) {
        String[] pairs = str.split("&");
        for (String pair : pairs) {
            int idx = pair.indexOf("=");
            if (idx > 0) {
                try {
                    String key = URLDecoder.decode(pair.substring(0, idx), StandardCharsets.UTF_8);
                    String value = URLDecoder.decode(pair.substring(idx + 1), StandardCharsets.UTF_8);
                    if ("usedFiles".equals(key) || "usedBytes".equals(key)) {
                        try {
                            map.put(key, Long.parseLong(value));
                            continue;
                        } catch (Exception ignored) {}
                    }
                    map.put(key, value);
                } catch (Exception ignored) {}
            }
        }
    }
}
