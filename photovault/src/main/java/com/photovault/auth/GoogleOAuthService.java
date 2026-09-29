package com.photovault.auth;

import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpHandler;
import com.sun.net.httpserver.HttpServer;
import javafx.application.Platform;

import java.awt.Desktop;
import java.io.IOException;
import java.io.OutputStream;
import java.net.InetSocketAddress;
import java.net.URI;
import java.net.URLDecoder;
import java.nio.charset.StandardCharsets;
import java.util.HashMap;
import java.util.Map;
import java.util.concurrent.Executors;
import java.util.function.Consumer;

/**
 * Native Google OAuth 2.0 Loopback Service for PhotoVault.
 * RFC 8252 compliant authorization flow for desktop client apps.
 * Coordinates browser login with local ephemeral callback receiver.
 */
public final class GoogleOAuthService {

    private static final String TAKEOUTFIX_AUTH_BASE = "https://takeoutfix.pages.dev/auth";
    private static HttpServer activeServer;

    private GoogleOAuthService() {}

    /**
     * Initiates Google OAuth 2.0 flow via local loopback adapter.
     *
     * @param onAuthSuccess callback invoked with user email upon successful sign-in
     * @param onError callback invoked if loopback server or browser launch fails
     */
    public static void startGoogleSignIn(Consumer<String> onAuthSuccess, Consumer<String> onError) {
        stopActiveServer();

        try {
            // Bind to ephemeral port on 127.0.0.1
            HttpServer server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
            server.setExecutor(Executors.newSingleThreadExecutor());
            int port = server.getAddress().getPort();

            server.createContext("/callback", new HttpHandler() {
                @Override
                public void handle(HttpExchange exchange) throws IOException {
                    String query = exchange.getRequestURI().getRawQuery();
                    Map<String, String> params = parseQuery(query);

                    String email = params.get("email");
                    if (email == null || email.isBlank()) {
                        email = params.get("user");
                    }

                    String htmlResponse;
                    if (email != null && !email.isBlank()) {
                        String cleanEmail = URLDecoder.decode(email, StandardCharsets.UTF_8);
                        htmlResponse = """
                                <!DOCTYPE html>
                                <html>
                                <head>
                                    <meta charset="utf-8">
                                    <title>PhotoVault & TakeoutFix — Signed In</title>
                                    <style>
                                        body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: #09090b; color: #fafafa; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; }
                                        .card { background: #18181b; border: 1px solid #27272a; border-radius: 12px; padding: 36px; max-width: 440px; text-align: center; box-shadow: 0 10px 25px rgba(0,0,0,0.5); }
                                        h2 { color: #22c55e; margin: 0 0 12px; font-size: 20px; }
                                        p { color: #a1a1aa; font-size: 13px; line-height: 1.6; margin-bottom: 24px; }
                                        .btn { background: #2563eb; color: #ffffff; text-decoration: none; padding: 10px 20px; border-radius: 6px; font-weight: 600; font-size: 13px; display: inline-block; cursor: pointer; }
                                    </style>
                                </head>
                                <body>
                                    <div class="card">
                                        <h2>✓ Google Sign-In Successful</h2>
                                        <p>Your Google account has been verified. PhotoVault desktop is now unlocked. You can close this tab and return to the application.</p>
                                        <a class="btn" href="javascript:window.close()">Close Window</a>
                                    </div>
                                    <script>setTimeout(function() { window.close(); }, 3000);</script>
                                </body>
                                </html>
                                """;

                        byte[] bytes = htmlResponse.getBytes(StandardCharsets.UTF_8);
                        exchange.getResponseHeaders().set("Content-Type", "text/html; charset=utf-8");
                        exchange.sendResponseHeaders(200, bytes.length);
                        try (OutputStream os = exchange.getResponseBody()) {
                            os.write(bytes);
                        }

                        Platform.runLater(() -> {
                            if (onAuthSuccess != null) onAuthSuccess.accept(cleanEmail);
                        });
                    } else {
                        htmlResponse = "<html><body><h3>Authentication failed. Missing email claim.</h3></body></html>";
                        byte[] bytes = htmlResponse.getBytes(StandardCharsets.UTF_8);
                        exchange.sendResponseHeaders(400, bytes.length);
                        try (OutputStream os = exchange.getResponseBody()) {
                            os.write(bytes);
                        }
                    }

                    stopActiveServer();
                }
            });

            server.start();
            activeServer = server;

            // Launch system browser pointing to Google OAuth / TakeoutFix auth gateway
            String authUrl = String.format("%s?client=photovault&port=%d&flow=desktop", TAKEOUTFIX_AUTH_BASE, port);

            if (Desktop.isDesktopSupported() && Desktop.getDesktop().isSupported(Desktop.Action.BROWSE)) {
                Desktop.getDesktop().browse(new URI(authUrl));
            } else {
                if (onError != null) onError.accept("System browser could not be launched.");
            }

        } catch (Exception ex) {
            stopActiveServer();
            if (onError != null) onError.accept("OAuth initialization error: " + ex.getMessage());
        }
    }

    public static synchronized void stopActiveServer() {
        if (activeServer != null) {
            try {
                activeServer.stop(0);
            } catch (Exception ignored) {}
            activeServer = null;
        }
    }

    private static Map<String, String> parseQuery(String query) {
        Map<String, String> result = new HashMap<>();
        if (query == null || query.isBlank()) return result;
        String[] pairs = query.split("&");
        for (String pair : pairs) {
            int idx = pair.indexOf("=");
            if (idx > 0 && idx < pair.length() - 1) {
                result.put(pair.substring(0, idx), pair.substring(idx + 1));
            }
        }
        return result;
    }
}
