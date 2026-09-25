package com.takeoutfix.ads;

import org.json.JSONArray;
import org.json.JSONObject;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.io.File;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.time.Duration;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.function.Consumer;

/**
 * Synchronizes hardware deals and sponsored affiliate ads directly from the backend Firestore collection.
 *
 * Ensures ads shown in TakeoutFix Desktop reflect live active campaigns managed via
 * the website admin panel (takeoutfix.pages.dev/admin/monetization).
 */
@Service
public class AdSyncService {

    private static final Logger log = LoggerFactory.getLogger(AdSyncService.class);

    private static final String FIRESTORE_AFFILIATE_URL =
            "https://firestore.googleapis.com/v1/projects/takeout-fix/databases/(default)/documents/affiliate_links";

    private static final File CACHE_FILE = new File(
            System.getProperty("user.home"), ".takeoutfix/ads_cache.json");

    public record AdItem(
            String id,
            String title,
            String description,
            String destinationUrl,
            String ctaText,
            String tag,
            String discount,
            int priority,
            String imageUrl
    ) {
        public AdItem(String id, String title, String description, String destinationUrl, String ctaText, String tag, String discount, int priority) {
            this(id, title, description, destinationUrl, ctaText, tag, discount, priority, "");
        }
    }

    private static final java.util.Map<String, javax.swing.ImageIcon> THUMB_CACHE = new java.util.concurrent.ConcurrentHashMap<>();
    private static final java.util.concurrent.ExecutorService IMAGE_LOADER_EXECUTOR = java.util.concurrent.Executors.newCachedThreadPool(r -> {
        Thread t = new Thread(r, "AdSync-ImageLoader");
        t.setDaemon(true);
        return t;
    });

    public static void loadThumbnailAsync(String url, int width, int height, Consumer<javax.swing.ImageIcon> callback) {
        if (url == null || url.isBlank() || callback == null) return;
        String key = width + "x" + height + ":" + url;
        javax.swing.ImageIcon cached = THUMB_CACHE.get(key);
        if (cached != null) {
            callback.accept(cached);
            return;
        }

        IMAGE_LOADER_EXECUTOR.submit(() -> {
            try {
                java.net.http.HttpClient client = java.net.http.HttpClient.newBuilder()
                        .followRedirects(java.net.http.HttpClient.Redirect.ALWAYS)
                        .connectTimeout(Duration.ofSeconds(4))
                        .build();
                java.net.http.HttpRequest req = java.net.http.HttpRequest.newBuilder()
                        .uri(URI.create(url))
                        .timeout(Duration.ofSeconds(6))
                        .header("User-Agent", "Mozilla/5.0")
                        .GET()
                        .build();
                java.net.http.HttpResponse<byte[]> resp = client.send(req, java.net.http.HttpResponse.BodyHandlers.ofByteArray());
                if (resp.statusCode() == 200 && resp.body().length > 0) {
                    java.awt.Image rawImg = javax.imageio.ImageIO.read(new java.io.ByteArrayInputStream(resp.body()));
                    if (rawImg != null) {
                        java.awt.Image scaled = rawImg.getScaledInstance(width, height, java.awt.Image.SCALE_SMOOTH);
                        javax.swing.ImageIcon icon = new javax.swing.ImageIcon(scaled);
                        THUMB_CACHE.put(key, icon);
                        javax.swing.SwingUtilities.invokeLater(() -> callback.accept(icon));
                    }
                }
            } catch (Exception ignored) {}
        });
    }

    private final HttpClient httpClient = HttpClient.newBuilder()
            .connectTimeout(Duration.ofSeconds(6))
            .build();

    private final List<AdItem> currentAds = new CopyOnWriteArrayList<>();
    private final List<Consumer<List<AdItem>>> listeners = new CopyOnWriteArrayList<>();
    private final ScheduledExecutorService scheduler = Executors.newSingleThreadScheduledExecutor();

    public AdSyncService() {
        // 1. Load from local cache or fallback defaults immediately
        loadCacheOrDefault();

        // 2. Fetch live ads from backend immediately on startup
        scheduler.submit(this::refreshAdsFromBackend);
    }

    public List<AdItem> getActiveAds() {
        return Collections.unmodifiableList(new ArrayList<>(currentAds));
    }

    public void addListener(Consumer<List<AdItem>> listener) {
        if (listener != null) {
            listeners.add(listener);
            listener.accept(getActiveAds());
        }
    }

    public void refreshAdsFromBackend() {
        scheduler.submit(() -> {
            try {
                HttpRequest req = HttpRequest.newBuilder()
                        .uri(URI.create(FIRESTORE_AFFILIATE_URL))
                        .timeout(Duration.ofSeconds(8))
                        .header("Accept", "application/json")
                        .header("User-Agent", "TakeoutFix-Desktop/2.0")
                        .GET()
                        .build();

                HttpResponse<String> res = httpClient.send(req, HttpResponse.BodyHandlers.ofString(StandardCharsets.UTF_8));
                if (res.statusCode() == 200 && res.body() != null && !res.body().isBlank()) {
                    List<AdItem> parsed = parseFirestoreDocuments(res.body());
                    if (!parsed.isEmpty()) {
                        currentAds.clear();
                        currentAds.addAll(parsed);
                        saveCache(parsed);
                        notifyListeners();
                        log.info("Successfully synchronized {} ads from backend Firestore.", parsed.size());
                        return;
                    }
                }
            } catch (Exception e) {
                log.warn("Could not sync ads from backend (will use cached ads if present): {}", e.getMessage());
            }
        });
    }

    private List<AdItem> parseFirestoreDocuments(String jsonStr) {
        List<AdItem> list = new ArrayList<>();
        try {
            JSONObject root = new JSONObject(jsonStr);
            JSONArray docs = root.optJSONArray("documents");
            if (docs == null) return list;

            for (int i = 0; i < docs.length(); i++) {
                JSONObject doc = docs.getJSONObject(i);
                JSONObject fields = doc.optJSONObject("fields");
                if (fields == null) continue;

                String status = optString(fields, "status", "ACTIVE");
                if (!"ACTIVE".equalsIgnoreCase(status)) continue;

                String id = optString(fields, "id", "ad_" + i);
                String title = optString(fields, "title", "");
                String description = optString(fields, "description", "");
                String destinationUrl = optString(fields, "destinationUrl", "");
                String ctaText = optString(fields, "ctaText", "View on Amazon");
                String tag = optString(fields, "tag", "SPONSORED");
                String discount = optString(fields, "discount", "");
                int priority = optInt(fields, "priority", 5);
                String imageUrl = optString(fields, "imageUrl", optString(fields, "image", optString(fields, "thumbnail", "")));

                if (title.isBlank() || destinationUrl.isBlank()) continue;

                // Sanitize duplicate URLs if malformed in backend
                if (destinationUrl.startsWith("http")) {
                    int secondHttp = destinationUrl.indexOf("http", 4);
                    if (secondHttp > 0) {
                        destinationUrl = destinationUrl.substring(0, secondHttp);
                    }
                }

                if (discount.isBlank()) {
                    discount = "DEAL";
                }

                if (imageUrl.isBlank()) {
                    imageUrl = extractAmazonImageUrl(destinationUrl);
                }

                list.add(new AdItem(id, title, description, destinationUrl, ctaText, tag, discount, priority, imageUrl));
            }

            // Sort by priority descending
            list.sort((a, b) -> Integer.compare(b.priority(), a.priority()));
        } catch (Exception e) {
            log.warn("Error parsing Firestore ads payload: {}", e.getMessage());
        }
        return list;
    }

    private static String extractAmazonImageUrl(String url) {
        if (url == null || url.isBlank()) return "";
        try {
            java.util.regex.Matcher m = java.util.regex.Pattern.compile("/(?:dp|gp/product|d)/([A-Z0-9]{10})").matcher(url);
            if (m.find()) {
                String asin = m.group(1);
                return "https://images-na.ssl-images-amazon.com/images/P/" + asin + ".01._SL160_.jpg";
            }
        } catch (Exception ignored) {}
        return "";
    }

    private void notifyListeners() {
        List<AdItem> active = getActiveAds();
        for (Consumer<List<AdItem>> l : listeners) {
            try {
                l.accept(active);
            } catch (Exception ignored) {}
        }
    }

    private void saveCache(List<AdItem> ads) {
        try {
            if (!CACHE_FILE.getParentFile().exists()) {
                CACHE_FILE.getParentFile().mkdirs();
            }
            JSONArray arr = new JSONArray();
            for (AdItem ad : ads) {
                JSONObject o = new JSONObject();
                o.put("id", ad.id());
                o.put("title", ad.title());
                o.put("description", ad.description());
                o.put("destinationUrl", ad.destinationUrl());
                o.put("ctaText", ad.ctaText());
                o.put("tag", ad.tag());
                o.put("discount", ad.discount());
                o.put("priority", ad.priority());
                o.put("imageUrl", ad.imageUrl());
                arr.put(o);
            }
            Files.writeString(CACHE_FILE.toPath(), arr.toString(), StandardCharsets.UTF_8);
        } catch (Exception ignored) {}
    }

    private void loadCacheOrDefault() {
        if (CACHE_FILE.exists()) {
            try {
                String content = Files.readString(CACHE_FILE.toPath(), StandardCharsets.UTF_8);
                if (content != null && !content.isBlank()) {
                    JSONArray arr = new JSONArray(content);
                    List<AdItem> cached = new ArrayList<>();
                    for (int i = 0; i < arr.length(); i++) {
                        JSONObject o = arr.getJSONObject(i);
                        cached.add(new AdItem(
                                o.optString("id", "ad_" + i),
                                o.optString("title", ""),
                                o.optString("description", ""),
                                o.optString("destinationUrl", ""),
                                o.optString("ctaText", "View on Amazon"),
                                o.optString("tag", "SPONSORED"),
                                o.optString("discount", "DEAL"),
                                o.optInt("priority", 5),
                                o.optString("imageUrl", "")
                        ));
                    }
                    if (!cached.isEmpty()) {
                        currentAds.addAll(cached);
                    }
                }
            } catch (Exception ignored) {}
        }
    }

    public List<AdItem> getDefaultAds() {
        return Collections.emptyList();
    }

    private static String optString(JSONObject fields, String name, String fallback) {
        JSONObject f = fields.optJSONObject(name);
        if (f != null && f.has("stringValue")) {
            return f.getString("stringValue");
        }
        return fallback;
    }

    private static int optInt(JSONObject fields, String name, int fallback) {
        JSONObject f = fields.optJSONObject(name);
        if (f != null && f.has("integerValue")) {
            try {
                return Integer.parseInt(f.getString("integerValue"));
            } catch (NumberFormatException ignored) {}
        }
        return fallback;
    }
}
