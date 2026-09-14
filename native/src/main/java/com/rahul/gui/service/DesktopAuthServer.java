package com.rahul.gui.service;

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
 * Ultra-lightweight local HTTP server for receiving browser OAuth callback.
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

            server.createContext("/callback", new CallbackHandler());
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
            // CORS headers to permit fetch from takeoutfix.pages.dev
            exchange.getResponseHeaders().set("Access-Control-Allow-Origin", "*");
            exchange.getResponseHeaders().set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
            exchange.getResponseHeaders().set("Access-Control-Allow-Headers", "Content-Type, Authorization");

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

            // Return success response to browser
            byte[] responseBytes;
            if (exchange.getRequestHeaders().getFirst("Accept") != null &&
                exchange.getRequestHeaders().getFirst("Accept").contains("application/json")) {
                exchange.getResponseHeaders().set("Content-Type", "application/json; charset=utf-8");
                responseBytes = "{\"status\":\"ok\",\"message\":\"Authenticated\"}".getBytes(StandardCharsets.UTF_8);
            } else {
                exchange.getResponseHeaders().set("Content-Type", "text/html; charset=utf-8");
                String html = """
                    <!DOCTYPE html>
                    <html lang="en">
                    <head>
                        <meta charset="utf-8">
                        <title>TakeoutFix - Signed In</title>
                        <style>
                            body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #09090b; color: #f4f4f5; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; }
                            .box { background: #18181b; border: 1px solid #27272a; padding: 40px; border-radius: 16px; text-align: center; max-width: 380px; box-shadow: 0 20px 50px rgba(0,0,0,0.6); }
                            .icon { font-size: 44px; margin-bottom: 16px; }
                            h1 { font-size: 20px; font-weight: 700; margin: 0 0 8px 0; color: #ffffff; }
                            p { font-size: 13px; color: #a1a1aa; line-height: 1.5; margin: 0; }
                        </style>
                    </head>
                    <body>
                        <div class="box">
                            <div class="icon">✅</div>
                            <h1>Successfully Connected!</h1>
                            <p>You have signed in to TakeoutFix Desktop. You can close this tab and return to the application.</p>
                        </div>
                    </body>
                    </html>
                    """;
                responseBytes = html.getBytes(StandardCharsets.UTF_8);
            }

            exchange.sendResponseHeaders(200, responseBytes.length);
            try (OutputStream os = exchange.getResponseBody()) {
                os.write(responseBytes);
            }

            // Dispatch to callback
            if (authCallback != null && !params.isEmpty()) {
                Consumer<Map<String, Object>> cb = authCallback;
                Executors.newSingleThreadExecutor().submit(() -> {
                    try {
                        Thread.sleep(800); // Allow response to flush
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
                        map.put(key, value);
                    } catch (Exception ignored) {}
                }
            }
        }
    }
}
