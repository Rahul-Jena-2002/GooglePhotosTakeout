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
                boolean hasVerifiedToken = params.containsKey("token") || params.containsKey("idToken") || params.containsKey("code");

                if (stateProvided && !expectedState.equals(receivedState)) {
                    String errorHtml = "<html><body style='background:#282a36;color:#ff5555;font-family:sans-serif;padding:40px;text-align:center;'><h2>Security Error: OAuth State Mismatch</h2><p>Authentication rejected due to invalid state token.</p></body></html>";
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
                    String errorHtml = "<html><body style='background:#282a36;color:#ff5555;font-family:sans-serif;padding:40px;text-align:center;'><h2>Security Error: Missing Authentication Credentials</h2><p>Authentication rejected due to missing tokens.</p></body></html>";
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

            // Render enterprise clean confirmation screen (Google Antigravity style)
            String email = escHtml(String.valueOf(params.getOrDefault("email", "Google Account")));
            String plan = escHtml(String.valueOf(params.getOrDefault("plan", "Free")).toUpperCase());
            String theme = escHtml(String.valueOf(params.getOrDefault("theme", com.takeoutfix.shared.theme.ThemeColors.isDark() ? "dark" : "light")).toLowerCase());

            String template = """
                <!DOCTYPE html>
                <html lang="en" data-theme="{{THEME}}">
                <head>
                    <meta charset="utf-8">
                    <meta name="viewport" content="width=device-width, initial-scale=1">
                    <title>TakeoutFix Auth Success</title>
                    <link rel="preconnect" href="https://fonts.googleapis.com">
                    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
                    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&display=swap" rel="stylesheet">
                    <style>
                        * { box-sizing: border-box; margin: 0; padding: 0; }
                        
                        :root {
                            --bg: #ffffff;
                            --text: #1f1f1f;
                            --brand: #202124;
                            --sub: #5f6368;
                            --link: #1a73e8;
                            --pipe: #dadce0;
                            --footer: #70757a;
                        }

                        @media (prefers-color-scheme: dark) {
                            :root {
                                --bg: #282a36;
                                --text: #f8f8f2;
                                --brand: #f8f8f2;
                                --sub: #c4c5ce;
                                --link: #bd93f9;
                                --pipe: #44475a;
                                --footer: #9294a3;
                            }
                        }

                        [data-theme="light"] {
                            --bg: #ffffff;
                            --text: #1f1f1f;
                            --brand: #202124;
                            --sub: #5f6368;
                            --link: #1a73e8;
                            --pipe: #dadce0;
                            --footer: #70757a;
                        }

                        [data-theme="dark"] {
                            --bg: #282a36;
                            --text: #f8f8f2;
                            --brand: #f8f8f2;
                            --sub: #c4c5ce;
                            --link: #bd93f9;
                            --pipe: #44475a;
                            --footer: #9294a3;
                        }

                        body {
                            background-color: var(--bg);
                            color: var(--text);
                            font-family: 'Inter', -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
                            display: flex;
                            flex-direction: column;
                            align-items: center;
                            justify-content: center;
                            min-height: 100vh;
                            padding: 24px;
                            -webkit-font-smoothing: antialiased;
                            text-align: center;
                            transition: background-color 0.2s ease, color 0.2s ease;
                        }

                        .container {
                            max-width: 680px;
                            width: 100%;
                            display: flex;
                            flex-direction: column;
                            align-items: center;
                            justify-content: center;
                        }

                        .brand-row {
                            display: inline-flex;
                            align-items: center;
                            justify-content: center;
                            gap: 12px;
                            margin-bottom: 24px;
                        }

                        .brand-name {
                            font-size: 28px;
                            font-weight: 500;
                            letter-spacing: -0.3px;
                            color: var(--brand);
                        }

                        h1 {
                            font-size: 32px;
                            font-weight: 400;
                            line-height: 1.25;
                            letter-spacing: -0.5px;
                            margin-bottom: 20px;
                            color: var(--text);
                        }

                        .subtitle {
                            font-size: 14px;
                            color: var(--sub);
                            line-height: 1.6;
                            margin-bottom: 32px;
                        }

                        .subtitle a, .links a {
                            color: var(--link);
                            text-decoration: none;
                            cursor: pointer;
                        }

                        .subtitle a:hover, .links a:hover {
                            text-decoration: underline;
                        }

                        .links {
                            font-size: 13px;
                            color: var(--footer);
                            display: inline-flex;
                            align-items: center;
                            gap: 14px;
                        }

                        .links .sep {
                            color: var(--pipe);
                        }
                    </style>
                </head>
                <body>
                    <div class="container">
                        <div class="brand-row">
                            <svg width="34" height="34" viewBox="0 0 32 32" fill="none">
                                <rect width="32" height="32" rx="8" fill="url(#brand-grad)" />
                                <path d="M8 22L13 16L17 20L21 14L24 18" stroke="#ffffff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" />
                                <circle cx="21" cy="11" r="2" fill="#ffffff" />
                                <defs>
                                    <linearGradient id="brand-grad" x1="0" y1="0" x2="32" y2="32" gradientUnits="userSpaceOnUse">
                                        <stop stop-color="#bd93f9" />
                                        <stop offset="1" stop-color="#cba6f7" />
                                    </linearGradient>
                                </defs>
                            </svg>
                            <span class="brand-name">TakeoutFix</span>
                        </div>

                        <h1>You have successfully authenticated.</h1>
                        <p class="subtitle">
                            You should be redirected back to the product. 
                            <a href="javascript:void(0)" onclick="closeNow()">Click here</a> if not working.
                        </p>

                        <div class="links">
                            <a href="https://takeoutfix.pages.dev/docs" target="_blank">Docs</a>
                            <span class="sep">|</span>
                            <a href="https://takeoutfix.pages.dev/support" target="_blank">Support</a>
                            <span class="sep">|</span>
                            <a href="https://takeoutfix.pages.dev/terms" target="_blank">Terms</a>
                        </div>
                    </div>

                    <script>
                        function closeNow() {
                            try { window.close(); } catch(e) {}
                            try { window.open('', '_self', ''); window.close(); } catch(e) {}\n                            try { window.top.close(); } catch(e) {}\n                        }
                        // Attempt automatic tab close after brief confirmation
                        setTimeout(closeNow, 1200);
                    </script>
                </body>
                </html>
                """;
            String html = template
                    .replace("{{THEME}}", theme)
                    .replace("{{EMAIL}}", email)
                    .replace("{{PLAN}}", plan);

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

    private static String escHtml(String s) {
        if (s == null) return "";
        return s.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;").replace("\"", "&quot;").replace("'", "&#39;");
    }
}
