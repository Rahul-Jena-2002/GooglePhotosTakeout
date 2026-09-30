package com.takeoutfix.network;

import org.springframework.stereotype.Service;

import java.net.HttpURLConnection;
import java.net.InetSocketAddress;
import java.net.Socket;
import java.net.URI;
import java.util.List;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.TimeUnit;
import java.util.function.Consumer;

/**
 * Microservice dedicated to continuous network connectivity monitoring.
 * Dispatches status updates to UI listeners.
 */
@Service
public class NetworkMonitorService {

    private volatile boolean online = true;
    private final List<Consumer<Boolean>> listeners = new CopyOnWriteArrayList<>();
    private final ScheduledExecutorService scheduler = Executors.newSingleThreadScheduledExecutor(r -> {
        Thread t = new Thread(r, "takeoutfix-net-monitor");
        t.setDaemon(true);
        return t;
    });

    public NetworkMonitorService() {
        startMonitoring();
    }

    public void addListener(Consumer<Boolean> listener) {
        listeners.add(listener);
        listener.accept(online);
    }

    public boolean isOnline() {
        return online;
    }

    public void checkNow() {
        boolean current = pingTest();
        if (this.online != current) {
            this.online = current;
            notifyListeners();
        }
    }

    private void startMonitoring() {
        scheduler.scheduleWithFixedDelay(this::checkNow, 1, 10, TimeUnit.SECONDS);
    }

    private void notifyListeners() {
        for (Consumer<Boolean> listener : listeners) {
            try {
                listener.accept(online);
            } catch (Exception ignored) {}
        }
    }

    private boolean pingTest() {
        // Probe 1: Direct TCP socket ping to resilient public DNS resolvers (1.1.1.1 / 8.8.8.8) - zero DNS delay
        for (String ip : new String[]{"1.1.1.1", "8.8.8.8"}) {
            try (Socket socket = new Socket()) {
                socket.connect(new InetSocketAddress(ip, 53), 1500);
                return true;
            } catch (Exception ignored) {
            }
        }

        // Probe 2: Standard Google 204 connectivity endpoint
        try {
            HttpURLConnection conn = (HttpURLConnection) URI.create("https://www.google.com/generate_204").toURL().openConnection();
            conn.setRequestMethod("GET");
            conn.setConnectTimeout(3000);
            conn.setReadTimeout(3000);
            conn.setInstanceFollowRedirects(false);
            int code = conn.getResponseCode();
            conn.disconnect();
            if (code > 0) {
                return true;
            }
        } catch (Exception ignored) {
        }

        // Probe 3: Cloudflare HTTPS fallback
        try {
            HttpURLConnection conn = (HttpURLConnection) URI.create("https://1.1.1.1").toURL().openConnection();
            conn.setRequestMethod("HEAD");
            conn.setConnectTimeout(3000);
            conn.setReadTimeout(3000);
            int code = conn.getResponseCode();
            conn.disconnect();
            return code > 0;
        } catch (Exception ignored) {
            return false;
        }
    }

    public void shutdown() {
        scheduler.shutdownNow();
    }
}
