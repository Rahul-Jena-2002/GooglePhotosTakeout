package com.rahul.gui.service;

import java.net.URL;
import java.net.URLConnection;
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
public class NetworkMonitorService {

    private volatile boolean online = true;
    private final List<Consumer<Boolean>> listeners = new CopyOnWriteArrayList<>();
    private final ScheduledExecutorService scheduler = Executors.newSingleThreadScheduledExecutor();

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
        scheduler.scheduleAtFixedRate(() -> {
            boolean current = pingTest();
            if (this.online != current) {
                this.online = current;
                notifyListeners();
            }
        }, 0, 8, TimeUnit.SECONDS);
    }

    private void notifyListeners() {
        for (Consumer<Boolean> listener : listeners) {
            try {
                listener.accept(online);
            } catch (Exception ignored) {}
        }
    }

    private boolean pingTest() {
        try {
            URL url = new URL("https://www.google.com");
            URLConnection conn = url.openConnection();
            conn.setConnectTimeout(2500);
            conn.setReadTimeout(2500);
            conn.connect();
            return true;
        } catch (Exception e) {
            try {
                URL url2 = new URL("https://takeout-fix.firebaseapp.com");
                URLConnection conn2 = url2.openConnection();
                conn2.setConnectTimeout(2500);
                conn2.setReadTimeout(2500);
                conn2.connect();
                return true;
            } catch (Exception e2) {
                return false;
            }
        }
    }
}
