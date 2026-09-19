package com.takeoutfix.gui.service;

import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpHandler;
import com.sun.net.httpserver.HttpServer;

import java.io.IOException;
import java.io.OutputStream;
import java.net.InetSocketAddress;
import java.net.URLDecoder;
import java.nio.charset.StandardCharsets;
import java.util.HashMap;
import java.util.Map;
import java.util.concurrent.Executors;
import java.util.function.Consumer;

/**
 * Ultra-lightweight local HTTP server for receiving browser OAuth callbacks and redirects.
 * Starts dynamically on port 0 (ephemeral OS-assigned port, zero port collision).
 * Automatically stops itself once authentication payload is received.
 */
public class DesktopAuthServer {

    private static HttpServer server = null;
    private static int activePort = 0;
    private static Consumer<Map<String, Object>> authCallback = null;

    public static synchronized int start(Consumer<Map<String, Object>> callback) {
        stop(); // Stop any previous instance if lingering

        try {
            authCallback = callback;
            // Bind to 127.0.0.1 on port 0 -> OS chooses any free ephemeral port
            server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
            activePort = server.getAddress().getPort();

            CallbackHandler handler = new CallbackHandler();
            server.createContext("/callback", handler);
            server.createContext("/api/user/sync", handler);
            server.setExecutor(Executors.newSingleThreadExecutor());
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
        if (server != null) {
            try {
                server.stop(0);
            } catch (Exception ignored) {}
            server = null;
            activePort = 0;
        }
    }

    private static class CallbackHandler implements HttpHandler {
        @Override
        public void handle(HttpExchange exchange) throws IOException {
            // CORS headers to permit fetch and redirects from takeoutfix.pages.dev and localhost
            exchange.getResponseHeaders().set("Access-Control-Allow-Origin", "*");
            exchange.getResponseHeaders().set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
            exchange.getResponseHeaders().set("Access-Control-Allow-Headers", "Content-Type, Authorization");
            exchange.getResponseHeaders().set("Access-Control-Allow-Private-Network", "true");

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
                            org.json.JSONObject json = new org.json.JSONObject(body);
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

            // Return success response to browser
            byte[] responseBytes;
            if (exchange.getRequestHeaders().getFirst("Accept") != null &&
                exchange.getRequestHeaders().getFirst("Accept").contains("application/json")) {
                exchange.getResponseHeaders().set("Content-Type", "application/json; charset=utf-8");
                responseBytes = ("{\"status\":\"ok\",\"message\":\"Authenticated\",\"user\":\"" + params.getOrDefault("email", "") + "\"}").getBytes(StandardCharsets.UTF_8);
            } else {
                exchange.getResponseHeaders().set("Content-Type", "text/html; charset=utf-8");
                String userEmail = String.valueOf(params.getOrDefault("email", ""));
                String htmlTemplate = """
                    <!DOCTYPE html>
                    <html lang="en">
                    <head>
                        <meta charset="utf-8">
                        <title>TakeoutFix - Signed In Successfully</title>
                        <meta name="viewport" content="width=device-width, initial-scale=1.0">
                        <style>
                            body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, sans-serif; background: #09090b; color: #f4f4f5; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; }
                            .box { background: #18181b; border: 1px solid #27272a; padding: 40px 32px; border-radius: 20px; text-align: center; max-width: 420px; box-shadow: 0 25px 50px -12px rgba(0,0,0,0.7); }
                            .badge { display: inline-flex; align-items: center; justify-content: center; width: 64px; height: 64px; border-radius: 50%; background: rgba(16, 185, 129, 0.15); border: 1px solid rgba(16, 185, 129, 0.3); font-size: 32px; margin-bottom: 20px; color: #10b981; }
                            h1 { font-size: 22px; font-weight: 700; margin: 0 0 8px 0; color: #ffffff; }
                            p { font-size: 13px; color: #a1a1aa; line-height: 1.6; margin: 0 0 24px 0; }
                            .user-chip { background: #27272a; padding: 8px 14px; border-radius: 10px; font-size: 13px; font-weight: 600; color: #10b981; display: inline-block; margin-bottom: 20px; word-break: break-all; }
                            .btn { display: inline-block; width: 100%; padding: 12px 20px; background: #10b981; color: #ffffff; font-weight: 600; font-size: 14px; border-radius: 10px; border: none; cursor: pointer; text-decoration: none; transition: background 0.2s; box-sizing: border-box; }
                            .btn:hover { background: #059669; }
                        </style>
                    </head>
                    <body>
                        <div class="box">
                            <div class="badge">&#10003;</div>
                            <h1>Successfully Connected!</h1>
                            <div class="user-chip">%s</div>
                            <p>You have signed in to TakeoutFix Desktop. Your tier access and quotas are now unlocked.<br><br>You can safely close this browser window and return to the application.</p>
                            <button class="btn" onclick="window.close()">Close This Tab</button>
                        </div>
                        <script>
                            setTimeout(function() {
                                try { window.close(); } catch(e) {}
                            }, 1800);
                        </script>
                    </body>
                    </html>
                    """;
                String html = htmlTemplate.replace("%s", userEmail);
                responseBytes = html.getBytes(StandardCharsets.UTF_8);
            }

            try {
                exchange.sendResponseHeaders(200, responseBytes.length);
                try (OutputStream os = exchange.getResponseBody()) {
                    os.write(responseBytes);
                    os.flush();
                }
            } catch (Exception sendErr) {
                System.err.println("[DesktopAuthServer] Error sending response to browser: " + sendErr.getMessage());
            }

            // Dispatch to callback
            if (authCallback != null && !params.isEmpty()) {
                Consumer<Map<String, Object>> cb = authCallback;
                Executors.newSingleThreadExecutor().submit(() -> {
                    try {
                        Thread.sleep(600); // Allow response to flush cleanly
                        cb.accept(params);
                        stop(); // Auto-stop server
                    } catch (Exception ignored) {}
                });
            }
        }

        private void parseQueryString(String str, Map<String, Object> map) {
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
}
