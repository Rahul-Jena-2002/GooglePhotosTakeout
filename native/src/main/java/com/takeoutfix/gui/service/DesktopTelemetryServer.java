package com.takeoutfix.gui.service;

import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpHandler;
import com.sun.net.httpserver.HttpServer;
import org.json.JSONObject;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.io.IOException;
import java.io.OutputStream;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.Executors;

/**
 * Lightweight local HTTP telemetry server on 127.0.0.1:47823.
 * Serves genuine OS-level CPU, RAM, and hardware metrics to the TakeoutFix WebApp
 * to power real resource telemetry instead of simulated Math.random() values.
 */
public class DesktopTelemetryServer {

    private static final Logger log = LoggerFactory.getLogger(DesktopTelemetryServer.class);
    public static final int TELEMETRY_PORT = 47823;

    private static HttpServer server;
    private static volatile boolean running = false;

    public static synchronized void startServer() {
        if (running) return;

        try {
            server = HttpServer.create(new InetSocketAddress("127.0.0.1", TELEMETRY_PORT), 0);
            server.createContext("/api/telemetry", new TelemetryHandler());
            server.setExecutor(Executors.newSingleThreadExecutor());
            server.start();
            running = true;
            log.info("DesktopTelemetryServer started on 127.0.0.1:{}", TELEMETRY_PORT);
        } catch (Exception e) {
            log.warn("Could not bind DesktopTelemetryServer to port {}: {}", TELEMETRY_PORT, e.getMessage());
        }
    }

    public static synchronized void stopServer() {
        if (server != null) {
            try {
                server.stop(0);
                running = false;
                log.info("DesktopTelemetryServer stopped");
            } catch (Exception ignored) {}
        }
    }

    private static class TelemetryHandler implements HttpHandler {
        @Override
        public void handle(HttpExchange exchange) throws IOException {
            // Handle CORS preflight
            exchange.getResponseHeaders().set("Access-Control-Allow-Origin", "*");
            exchange.getResponseHeaders().set("Access-Control-Allow-Methods", "GET, OPTIONS");
            exchange.getResponseHeaders().set("Access-Control-Allow-Headers", "Content-Type");

            if ("OPTIONS".equalsIgnoreCase(exchange.getRequestMethod())) {
                exchange.sendResponseHeaders(204, -1);
                return;
            }

            double cpuLoad = SystemHardwareInfo.getCpuLoadPercent();
            double usedRamGB = SystemHardwareInfo.getUsedMemoryGB();
            double totalRamGB = SystemHardwareInfo.getTotalMemoryGB();
            int physicalCores = SystemHardwareInfo.getPhysicalCores();
            int logicalThreads = SystemHardwareInfo.getLogicalProcessors();
            String cpuName = SystemHardwareInfo.getCpuName();

            JSONObject json = new JSONObject();
            json.put("cpuLoad", cpuLoad);
            json.put("ramUsedGB", usedRamGB);
            json.put("ramTotalGB", totalRamGB);
            json.put("physicalCores", physicalCores);
            json.put("logicalThreads", logicalThreads);
            json.put("cpuName", cpuName);
            json.put("status", "running");

            byte[] bytes = json.toString().getBytes(StandardCharsets.UTF_8);
            exchange.getResponseHeaders().set("Content-Type", "application/json; charset=UTF-8");
            exchange.sendResponseHeaders(200, bytes.length);

            try (OutputStream os = exchange.getResponseBody()) {
                os.write(bytes);
            }
        }
    }
}
