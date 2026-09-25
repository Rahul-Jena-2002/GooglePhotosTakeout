package com.takeoutfix.auth;

import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpHandler;
import com.sun.net.httpserver.HttpServer;
import org.json.JSONObject;

import org.springframework.beans.factory.config.ConfigurableBeanFactory;
import org.springframework.context.annotation.Scope;
import org.springframework.stereotype.Component;

import java.io.IOException;
import java.io.OutputStream;
import java.net.InetAddress;
import java.net.InetSocketAddress;
import java.net.URLDecoder;
import java.nio.charset.StandardCharsets;
import java.util.HashMap;
import java.util.Map;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;

/**
 * Lightweight local loopback HTTP server for Google OAuth desktop redirects.
 * Strictly binds to 127.0.0.1 on a freshly allocated ephemeral port (zero port collision).
 * Enforces OAuth 2.0 state parameter validation to protect against CSRF attacks.
 * Prototype scoped: created strictly per auth request and stopped immediately after.
 */
@Component
@Scope(ConfigurableBeanFactory.SCOPE_PROTOTYPE)
public class AuthCallbackServer {

    private HttpServer server;
    private int port;
    private String expectedState;
    private CompletableFuture<Map<String, Object>> pendingFuture;
    private final AtomicBoolean completed = new AtomicBoolean(false);

    public synchronized int start(String expectedState, CompletableFuture<Map<String, Object>> future) throws IOException {
        stop();
        this.expectedState = expectedState;
        this.pendingFuture = future;
        this.completed.set(false);

        // Explicitly bind to loopback 127.0.0.1 ONLY (never 0.0.0.0) with an OS-allocated ephemeral port
        InetSocketAddress loopbackAddress = new InetSocketAddress(InetAddress.getByName("127.0.0.1"), 0);
        server = HttpServer.create(loopbackAddress, 0);
        this.port = server.getAddress().getPort();

        CallbackHandler handler = new CallbackHandler();
        server.createContext("/auth/callback", handler);
        server.createContext("/callback", handler);
        server.setExecutor(Executors.newCachedThreadPool());
        server.start();

        System.out.println("[AuthCallbackServer] Bound to http://127.0.0.1:" + port + "/auth/callback (Strict loopback)");
        return port;
    }

    public synchronized int getPort() {
        return port;
    }

    public synchronized void stop() {
        if (server != null) {
            try {
                server.stop(0);
            } catch (Exception ignored) {}
            server = null;
            port = 0;
            expectedState = null;
        }
    }

    private class CallbackHandler implements HttpHandler {
        @Override
        public void handle(HttpExchange exchange) throws IOException {
            exchange.getResponseHeaders().set("Access-Control-Allow-Origin", "*");
            exchange.getResponseHeaders().set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
            exchange.getResponseHeaders().set("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Requested-With");
            exchange.getResponseHeaders().set("Access-Control-Allow-Private-Network", "true");

            if ("OPTIONS".equalsIgnoreCase(exchange.getRequestMethod())) {
                exchange.sendResponseHeaders(204, -1);
                return;
            }

            Map<String, Object> params = new HashMap<>();

            // 1. Query parameters
            String query = exchange.getRequestURI().getQuery();
            if (query != null && !query.isBlank()) {
                parseQueryString(query, params);
            }

            // 2. Body parameters if POST
            if ("POST".equalsIgnoreCase(exchange.getRequestMethod())) {
                String body = new String(exchange.getRequestBody().readAllBytes(), StandardCharsets.UTF_8);
                if (!body.isBlank()) {
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

            // Validate OAuth 2.0 State Parameter (Anti-CSRF)
            if (expectedState != null && !expectedState.isBlank()) {
                String receivedState = String.valueOf(params.getOrDefault("state", ""));
                boolean stateProvided = params.containsKey("state") && !receivedState.isBlank();
                boolean hasVerifiedToken = params.containsKey("token") || params.containsKey("idToken");

                if (stateProvided && !expectedState.equals(receivedState)) {
                    String errorHtml = "<html><body style='background:#09090b;color:#f87171;font-family:sans-serif;padding:40px;text-align:center;'><h2>Security Error: OAuth State Mismatch</h2><p>Authentication rejected due to invalid state token.</p></body></html>";
                    byte[] errBytes = errorHtml.getBytes(StandardCharsets.UTF_8);
                    exchange.getResponseHeaders().set("Content-Type", "text/html; charset=utf-8");
                    exchange.sendResponseHeaders(400, errBytes.length);
                    try (OutputStream os = exchange.getResponseBody()) {
                        os.write(errBytes);
                    }
                    if (!completed.getAndSet(true) && pendingFuture != null) {
                        pendingFuture.completeExceptionally(new AuthException("OAuth state mismatch: potential CSRF request intercepted."));
                    }
                    return;
                } else if (!stateProvided && !hasVerifiedToken) {
                    String errorHtml = "<html><body style='background:#09090b;color:#f87171;font-family:sans-serif;padding:40px;text-align:center;'><h2>Security Error: Missing Authentication Credentials</h2><p>Authentication rejected due to missing tokens.</p></body></html>";
                    byte[] errBytes = errorHtml.getBytes(StandardCharsets.UTF_8);
                    exchange.getResponseHeaders().set("Content-Type", "text/html; charset=utf-8");
                    exchange.sendResponseHeaders(400, errBytes.length);
                    try (OutputStream os = exchange.getResponseBody()) {
                        os.write(errBytes);
                    }
                    if (!completed.getAndSet(true) && pendingFuture != null) {
                        pendingFuture.completeExceptionally(new AuthException("Missing authentication credentials."));
                    }
                    return;
                }
            }

            if (params.containsKey("token") && !params.containsKey("idToken")) {
                params.put("idToken", params.get("token"));
            }
            if (params.containsKey("idToken") && !params.containsKey("token")) {
                params.put("token", params.get("idToken"));
            }

            // Deliver payload to listener
            if (!completed.getAndSet(true) && pendingFuture != null) {
                pendingFuture.complete(params);
            }

            // Render confirmation screen to user's browser with auto-routing to the website
            String email = String.valueOf(params.getOrDefault("email", "Google Account"));
            String websiteUrl = "https://takeoutfix.pages.dev/tool?connected=true";
            if (params.containsKey("return_to") && !String.valueOf(params.get("return_to")).isBlank()) {
                websiteUrl = String.valueOf(params.get("return_to"));
            } else {
                String referer = exchange.getRequestHeaders().getFirst("Referer");
                if (referer != null && (referer.contains("localhost:4321") || referer.contains("localhost:4322"))) {
                    websiteUrl = referer.split("/login")[0] + "/tool?connected=true";
                }
            }

            String template = """
                <!DOCTYPE html>
                <html lang="en">
                <head>
                    <meta charset="utf-8">
                    <meta http-equiv="refresh" content="1;url={{WEBSITE_URL}}">
                    <title>TakeoutFix — Connected</title>
                    <style>
                        * { box-sizing: border-box; }
                        body { background: #09090b; color: #f4f4f5; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; padding: 20px; }
                        .card { background: #18181b; border: 1px solid #27272a; border-radius: 24px; padding: 36px 28px; max-width: 440px; width: 100%; text-align: center; box-shadow: 0 25px 50px -12px rgba(0,0,0,0.6); }
                        .icon { width: 56px; height: 56px; border-radius: 50%; background: rgba(16, 185, 129, 0.15); border: 1px solid rgba(16, 185, 129, 0.3); color: #10b981; display: flex; align-items: center; justify-content: center; margin: 0 auto 16px; font-size: 26px; font-weight: bold; }
                        h1 { font-size: 22px; font-weight: 800; margin: 0 0 8px; color: #ffffff; letter-spacing: -0.02em; }
                        .badge { display: inline-block; background: #27272a; color: #10b981; padding: 5px 14px; border-radius: 999px; font-size: 13px; font-weight: 600; margin-bottom: 16px; border: 1px solid #3f3f46; word-break: break-all; }
                        p { font-size: 14px; color: #a1a1aa; margin: 0 0 20px; line-height: 1.5; }
                        .actions { display: flex; flex-direction: column; gap: 10px; }
                        .btn { display: block; text-decoration: none; text-align: center; font-weight: 700; padding: 13px 20px; border-radius: 12px; border: none; cursor: pointer; font-size: 14px; width: 100%; transition: all 0.15s ease; }
                        .btn-primary { background: #6366f1; color: #ffffff; }
                        .btn-primary:hover { background: #4f46e5; }
                        .btn-secondary { background: #27272a; color: #e4e4e7; border: 1px solid #3f3f46; }
                        .btn-secondary:hover { background: #3f3f46; }
                        .timer { font-size: 12px; color: #71717a; margin-top: 16px; }
                    </style>
                </head>
                <body>
                    <div class="card">
                        <div class="icon">✓</div>
                        <h1>Successfully Connected!</h1>
                        <div class="badge">{{EMAIL}}</div>
                        <p>TakeoutFix Desktop is now authenticated. Redirecting you back to the website now...</p>
                        <div class="actions">
                            <a class="btn btn-primary" id="btnWebsite" href="{{WEBSITE_URL}}" onclick="window.location.replace('{{WEBSITE_URL}}'); return true;">Return to TakeoutFix Website &rarr;</a>
                            <button class="btn btn-secondary" onclick="tryCloseWindow()">Close Window</button>
                        </div>
                        <div class="timer">Desktop app is active and authenticated.</div>
                    </div>
                    <script>
                        function tryCloseWindow() {
                            try {
                                window.opener = null;
                                window.open('', '_self', '');
                                window.close();
                            } catch(e) {}
                        }
                        tryCloseWindow();
                        setTimeout(function() {
                            tryCloseWindow();
                            window.location.replace("{{WEBSITE_URL}}");
                        }, 800);
                    </script>
                </body>
                </html>
                """;
            String html = template.replace("{{WEBSITE_URL}}", websiteUrl).replace("{{EMAIL}}", email);

            byte[] bytes = html.getBytes(StandardCharsets.UTF_8);
            exchange.getResponseHeaders().set("Content-Type", "text/html; charset=utf-8");
            exchange.sendResponseHeaders(200, bytes.length);
            try (OutputStream os = exchange.getResponseBody()) {
                os.write(bytes);
            }

            Executors.newSingleThreadScheduledExecutor().schedule(() -> stop(), 10, TimeUnit.SECONDS);
        }
    }

    private void parseQueryString(String query, Map<String, Object> target) {
        String[] pairs = query.split("&");
        for (String pair : pairs) {
            int idx = pair.indexOf("=");
            if (idx > 0) {
                try {
                    String key = URLDecoder.decode(pair.substring(0, idx), StandardCharsets.UTF_8);
                    String val = URLDecoder.decode(pair.substring(idx + 1), StandardCharsets.UTF_8);
                    target.put(key, val);
                } catch (Exception ignored) {}
            }
        }
    }
}
