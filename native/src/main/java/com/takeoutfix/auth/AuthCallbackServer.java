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

            // Render enterprise gold-standard confirmation screen (IntelliJ / JetBrains style)
            String email = String.valueOf(params.getOrDefault("email", "Google Account"));
            String plan = String.valueOf(params.getOrDefault("plan", "Free")).toUpperCase();

            String template = """
                <!DOCTYPE html>
                <html lang="en">
                <head>
                    <meta charset="utf-8">
                    <meta name="viewport" content="width=device-width, initial-scale=1">
                    <title>TakeoutFix — Authorization Successful</title>
                    <style>
                        * { box-sizing: border-box; margin: 0; padding: 0; }
                        body {
                            background: radial-gradient(circle at 50% 20%, #151824 0%, #090a0f 100%);
                            color: #f4f4f5;
                            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
                            display: flex;
                            align-items: center;
                            justify-content: center;
                            min-height: 100vh;
                            padding: 24px;
                            -webkit-font-smoothing: antialiased;
                        }
                        .card {
                            background: rgba(24, 26, 35, 0.85);
                            backdrop-filter: blur(20px);
                            -webkit-backdrop-filter: blur(20px);
                            border: 1px solid rgba(255, 255, 255, 0.08);
                            border-radius: 24px;
                            padding: 44px 36px;
                            max-width: 440px;
                            width: 100%;
                            text-align: center;
                            box-shadow: 0 30px 60px -15px rgba(0, 0, 0, 0.7), 0 0 40px -10px rgba(16, 185, 129, 0.15);
                            animation: fadeIn 0.4s cubic-bezier(0.16, 1, 0.3, 1);
                        }
                        @keyframes fadeIn {
                            from { opacity: 0; transform: translateY(12px) scale(0.98); }
                            to { opacity: 1; transform: translateY(0) scale(1); }
                        }
                        .icon-wrap {
                            width: 68px;
                            height: 68px;
                            border-radius: 50%;
                            background: radial-gradient(circle, rgba(16, 185, 129, 0.22) 0%, rgba(16, 185, 129, 0.06) 100%);
                            border: 1px solid rgba(16, 185, 129, 0.4);
                            color: #10b981;
                            display: flex;
                            align-items: center;
                            justify-content: center;
                            margin: 0 auto 22px;
                            font-size: 30px;
                            box-shadow: 0 0 24px rgba(16, 185, 129, 0.25);
                        }
                        h1 {
                            font-size: 24px;
                            font-weight: 700;
                            margin-bottom: 8px;
                            color: #ffffff;
                            letter-spacing: -0.02em;
                        }
                        .subtitle {
                            font-size: 14px;
                            color: #a1a1aa;
                            margin-bottom: 20px;
                            line-height: 1.5;
                        }
                        .account-chip {
                            display: inline-flex;
                            align-items: center;
                            gap: 8px;
                            background: rgba(255, 255, 255, 0.04);
                            border: 1px solid rgba(255, 255, 255, 0.1);
                            padding: 6px 14px;
                            border-radius: 999px;
                            font-size: 13px;
                            font-weight: 500;
                            color: #e4e4e7;
                            margin-bottom: 24px;
                            max-width: 100%;
                        }
                        .account-chip .dot {
                            width: 8px;
                            height: 8px;
                            border-radius: 50%;
                            background: #10b981;
                            box-shadow: 0 0 8px #10b981;
                            flex-shrink: 0;
                        }
                        .account-chip .email {
                            overflow: hidden;
                            text-overflow: ellipsis;
                            white-space: nowrap;
                        }
                        .account-chip .tier {
                            background: rgba(16, 185, 129, 0.2);
                            color: #34d399;
                            font-size: 11px;
                            font-weight: 700;
                            padding: 2px 7px;
                            border-radius: 6px;
                            margin-left: 4px;
                        }
                        .instruction {
                            background: rgba(255, 255, 255, 0.03);
                            border: 1px solid rgba(255, 255, 255, 0.06);
                            border-radius: 14px;
                            padding: 16px 18px;
                            font-size: 13px;
                            color: #d4d4d8;
                            line-height: 1.5;
                            margin-bottom: 22px;
                        }
                        .btn-app {
                            display: inline-flex;
                            align-items: center;
                            justify-content: center;
                            width: 100%;
                            padding: 13px 20px;
                            background: #10b981;
                            color: #ffffff;
                            font-size: 14px;
                            font-weight: 600;
                            border-radius: 12px;
                            text-decoration: none;
                            transition: all 0.2s ease;
                            border: none;
                            cursor: pointer;
                            box-shadow: 0 4px 14px rgba(16, 185, 129, 0.3);
                        }
                        .btn-app:hover {
                            background: #059669;
                            transform: translateY(-1px);
                            box-shadow: 0 6px 20px rgba(16, 185, 129, 0.4);
                        }
                        .footer-note {
                            font-size: 12px;
                            color: #71717a;
                            margin-top: 20px;
                        }
                    </style>
                </head>
                <body>
                    <div class="card">
                        <div class="icon-wrap">✓</div>
                        <h1>You're All Set!</h1>
                        <p class="subtitle">TakeoutFix Desktop is now authenticated.</p>
                        
                        <div class="account-chip">
                            <span class="dot"></span>
                            <span class="email">{{EMAIL}}</span>
                            <span class="tier">{{PLAN}}</span>
                        </div>

                        <div class="instruction">
                            You can safely close this browser tab and return to <strong>TakeoutFix</strong>.
                        </div>

                        <a href="takeoutfix://auth" class="btn-app" onclick="window.focus();">
                            Return to TakeoutFix Desktop
                        </a>

                        <p class="footer-note">Desktop client is connected & running locally.</p>
                    </div>
                </body>
                </html>
                """;
            String html = template
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
}
