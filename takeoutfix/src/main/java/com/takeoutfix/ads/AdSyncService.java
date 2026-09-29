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

    private static final String FIRESTORE_AD_UNITS_URL =
            "https://firestore.googleapis.com/v1/projects/takeout-fix/databases/(default)/documents/ad_units";

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

        // 2. Fetch live ads and affiliate deals from backend immediately on startup
        scheduler.submit(this::refreshAdsFromBackend);
    }

    public List<AdItem> getActiveAds() {
        if (currentAds.isEmpty()) {
            return Collections.unmodifiableList(getDefaultAdsPool());
        }
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
                // Fetch affiliate deals
                List<AdItem> affiliateDeals = new ArrayList<>();
                try {
                    HttpRequest affReq = HttpRequest.newBuilder()
                            .uri(URI.create(FIRESTORE_AFFILIATE_URL))
                            .timeout(Duration.ofSeconds(8))
                            .header("Accept", "application/json")
                            .header("User-Agent", "TakeoutFix-Desktop/2.0")
                            .GET()
                            .build();
                    HttpResponse<String> affRes = httpClient.send(affReq, HttpResponse.BodyHandlers.ofString(StandardCharsets.UTF_8));
                    if (affRes.statusCode() == 200 && affRes.body() != null && !affRes.body().isBlank()) {
                        affiliateDeals = parseFirestoreAffiliates(affRes.body());
                    }
                } catch (Exception e) {
                    log.warn("Could not sync affiliate deals: {}", e.getMessage());
                }

                // Fetch ad units (A-ADS, web sponsors)
                List<AdItem> adUnits = new ArrayList<>();
                try {
                    HttpRequest adReq = HttpRequest.newBuilder()
                            .uri(URI.create(FIRESTORE_AD_UNITS_URL))
                            .timeout(Duration.ofSeconds(8))
                            .header("Accept", "application/json")
                            .header("User-Agent", "TakeoutFix-Desktop/2.0")
                            .GET()
                            .build();
                    HttpResponse<String> adRes = httpClient.send(adReq, HttpResponse.BodyHandlers.ofString(StandardCharsets.UTF_8));
                    if (adRes.statusCode() == 200 && adRes.body() != null && !adRes.body().isBlank()) {
                        adUnits = parseFirestoreAdUnits(adRes.body());
                    }
                } catch (Exception e) {
                    log.warn("Could not sync ad units: {}", e.getMessage());
                }

                // Merge enforcing 80% Ads, 20% Deals ratio
                List<AdItem> merged = mergeWithRatio(adUnits, affiliateDeals);
                if (!merged.isEmpty()) {
                    currentAds.clear();
                    currentAds.addAll(merged);
                    saveCache(merged);
                    notifyListeners();
                    log.info("Successfully synchronized {} monetization items (80/20 Ads/Deals ratio).", merged.size());
                }
            } catch (Exception e) {
                log.warn("Error refreshing monetization pool: {}", e.getMessage());
            }
        });
    }

    private List<AdItem> parseFirestoreAdUnits(String jsonStr) {
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

                String id = optString(fields, "id", "ad_unit_" + i);
                String name = optString(fields, "name", optString(fields, "title", "A-ADS Network"));
                String destinationUrl = optString(fields, "destinationUrl", "");
                String embedCode = optString(fields, "embedCode", "");
                if (destinationUrl.isBlank()) {
                    if (embedCode.contains("a-ads.com") || name.toUpperCase().contains("AADS") || name.toUpperCase().contains("A-ADS")) {
                        destinationUrl = "https://a-ads.com?partner=2456560";
                    } else {
                        destinationUrl = "https://a-ads.com";
                    }
                }
                String ctaText = optString(fields, "ctaText", "Learn More");
                String providerName = optString(fields, "providerName", "A-ADS");
                String tag = providerName.isBlank() ? "A-ADS" : providerName;
                String discount = "AD";
                int priority = optInt(fields, "priority", 10);
                String imageUrl = optString(fields, "imageUrl", "");

                list.add(new AdItem(id, name, "Privacy & tech advertisement", destinationUrl, ctaText, tag, discount, priority, imageUrl));
            }
            list.sort((a, b) -> Integer.compare(b.priority(), a.priority()));
        } catch (Exception e) {
            log.warn("Error parsing Firestore ad_units payload: {}", e.getMessage());
        }
        return list;
    }

    private List<AdItem> parseFirestoreAffiliates(String jsonStr) {
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

                String id = optString(fields, "id", "aff_" + i);
                String title = optString(fields, "title", "");
                String description = optString(fields, "description", "");
                String destinationUrl = optString(fields, "destinationUrl", "");
                String ctaText = optString(fields, "ctaText", "Shop on Amazon");
                String tag = optString(fields, "tag", "Amazon Special");
                String discount = "DEAL";
                int priority = optInt(fields, "priority", 10);
                String imageUrl = optString(fields, "imageUrl", optString(fields, "image", optString(fields, "thumbnail", "")));

                if (title.isBlank() || destinationUrl.isBlank()) continue;

                // Sanitize duplicate URLs if malformed in backend
                if (destinationUrl.startsWith("http")) {
                    int secondHttp = destinationUrl.indexOf("http", 4);
                    if (secondHttp > 0) {
                        destinationUrl = destinationUrl.substring(0, secondHttp);
                    }
                }

                if (imageUrl.isBlank()) {
                    imageUrl = extractAmazonImageUrl(destinationUrl);
                }

                list.add(new AdItem(id, title, description, destinationUrl, ctaText, tag, discount, priority, imageUrl));
            }

            list.sort((a, b) -> Integer.compare(b.priority(), a.priority()));
        } catch (Exception e) {
            log.warn("Error parsing Firestore affiliate payload: {}", e.getMessage());
        }
        return list;
    }

    public static List<AdItem> getDefaultAdsOnly() {
        List<AdItem> ads = new ArrayList<>();
        ads.add(new AdItem("ad_aads_net", "A-ADS Privacy Ad Network", "Decentralized crypto & privacy web ads", "https://a-ads.com?partner=2456560", "Explore Ads", "A-ADS", "AD", 10, ""));
        ads.add(new AdItem("ad_proton_drive", "Proton Encrypted Cloud", "End-to-end encrypted storage for archives", "https://proton.me/drive", "Get Started", "SPONSORED", "AD", 10, ""));
        ads.add(new AdItem("ad_backblaze", "Backblaze Cloud Backup", "Automated offsite backup for photo archives", "https://www.backblaze.com/cloud-backup.html", "Protect Files", "SPONSORED", "AD", 10, ""));
        ads.add(new AdItem("ad_nordvpn", "NordVPN Threat Protection", "Encrypted browsing & fast secure VPN", "https://nordvpn.com", "Learn More", "SPONSORED", "AD", 9, ""));
        ads.add(new AdItem("ad_synology", "Synology DiskStation NAS", "Private on-premise cloud storage for photos", "https://www.synology.com", "Explore NAS", "SPONSORED", "AD", 9, ""));
        ads.add(new AdItem("ad_brave", "Brave Privacy Browser", "Fast, private browser with native ad shield", "https://brave.com", "Download", "SPONSORED", "AD", 8, ""));
        ads.add(new AdItem("ad_pcloud", "pCloud Lifetime Storage", "Swiss-based cloud storage with zero-knowledge", "https://www.pcloud.com", "View Plans", "SPONSORED", "AD", 8, ""));
        ads.add(new AdItem("ad_aads_campaign", "Advertise with A-ADS", "Reach millions of privacy-first tech users", "https://a-ads.com/campaigns/new?partner=2456560", "Place Ad", "A-ADS", "AD", 8, ""));
        return ads;
    }

    public static List<AdItem> getDefaultDealsOnly() {
        List<AdItem> deals = new ArrayList<>();
        deals.add(new AdItem("deal_murphy_light", "Murphy 6W 3-in-1 Wall Light", "LED Mirror Picture Wall Light with Warranty", "https://www.amazon.in/Murphy-Chnaging-Picture-Bathroom-Warranty/dp/B0BYT1DTVL?tag=rjtools-21", "Shop on Amazon", "Amazon Special", "DEAL", 10, "https://m.media-amazon.com/images/I/71HXtqzwPRL._SL1500_.jpg"));
        deals.add(new AdItem("deal_grenaro_mic", "GRENARO Wireless Microphone", "3-level noise reduction mic for creators", "https://www.amazon.in/GRENARO-Adjustable-Reduction-S12-Microphone/dp/B0DQD8HWWG?tag=rjtools-21", "Shop on Amazon", "Amazon Special", "DEAL", 10, "https://m.media-amazon.com/images/I/71dhDqkgHPL._SL1500_.jpg"));
        return deals;
    }

    public static List<AdItem> getDefaultAdsPool() {
        return mergeWithRatio(getDefaultAdsOnly(), getDefaultDealsOnly());
    }

    /**
     * Interleaves Ads and Affiliate Deals strictly adhering to the 80% Ads / 20% Deals ratio.
     * Pattern across rotation: 3 Ads, 1 Deal, 3 Ads, 1 Deal (in 8 tiles = 6 Ads [75%], 2 Deals [25%]; in 10 tiles = 8 Ads [80%], 2 Deals [20%]).
     */
    public static List<AdItem> mergeWithRatio(List<AdItem> adsList, List<AdItem> dealsList) {
        List<AdItem> ads = (adsList != null && !adsList.isEmpty()) ? new ArrayList<>(adsList) : new ArrayList<>(getDefaultAdsOnly());
        List<AdItem> deals = (dealsList != null && !dealsList.isEmpty()) ? new ArrayList<>(dealsList) : new ArrayList<>(getDefaultDealsOnly());

        // Ensure sufficient ads are available to fulfill 80%
        if (ads.size() < 4) {
            for (AdItem defAd : getDefaultAdsOnly()) {
                if (ads.stream().noneMatch(a -> a.id().equals(defAd.id()))) {
                    ads.add(defAd);
                }
            }
        }
        if (deals.isEmpty()) {
            deals.addAll(getDefaultDealsOnly());
        }

        List<AdItem> result = new ArrayList<>();
        int adIdx = 0;
        int dealIdx = 0;
        int total = Math.max(10, Math.max(ads.size(), deals.size() * 4));

        for (int i = 0; i < total; i++) {
            // Every 4th item (indices 3, 7, 11...) is a Deal (20%), others are Ads (80%)
            if ((i + 1) % 4 == 0) {
                if (!deals.isEmpty()) {
                    result.add(deals.get(dealIdx % deals.size()));
                    dealIdx++;
                } else if (!ads.isEmpty()) {
                    result.add(ads.get(adIdx % ads.size()));
                    adIdx++;
                }
            } else {
                if (!ads.isEmpty()) {
                    result.add(ads.get(adIdx % ads.size()));
                    adIdx++;
                } else if (!deals.isEmpty()) {
                    result.add(deals.get(dealIdx % deals.size()));
                    dealIdx++;
                }
            }
        }
        return result;
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
                                o.optString("ctaText", "Learn More"),
                                o.optString("tag", "SPONSORED"),
                                o.optString("discount", "AD"),
                                o.optInt("priority", 5),
                                o.optString("imageUrl", "")
                        ));
                    }
                    if (!cached.isEmpty()) {
                        currentAds.addAll(cached);
                        return;
                    }
                }
            } catch (Exception ignored) {}
        }
        currentAds.addAll(getDefaultAdsPool());
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
