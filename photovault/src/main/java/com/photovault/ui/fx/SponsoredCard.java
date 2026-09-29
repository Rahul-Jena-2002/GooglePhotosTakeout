package com.photovault.ui.fx;

import javafx.animation.Animation;
import javafx.animation.KeyFrame;
import javafx.animation.Timeline;
import javafx.application.Platform;
import javafx.geometry.Pos;
import javafx.scene.control.Button;
import javafx.scene.control.Label;
import javafx.scene.layout.HBox;
import javafx.scene.layout.Priority;
import javafx.scene.layout.Region;
import javafx.scene.layout.VBox;
import javafx.util.Duration;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.function.Consumer;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Auto-rotating hardware and storage backup recommendation card.
 * Dynamically synchronized from backend with resilient offline defaults.
 */
public class SponsoredCard extends VBox {

    public record SponsoredDeal(String tag, String title, String description, String url, String cta) {}

    private static final List<SponsoredDeal> DEFAULT_DEALS = List.of(
            new SponsoredDeal("RECOMMENDED HARDWARE", "SanDisk 2TB Extreme Portable SSD",
                    "Rugged, IP65 water & dust-resistant NVMe storage. High-speed USB-C transfer for photo Takeout archives.",
                    "https://www.amazon.com/dp/B08HN3798K", "Shop on Amazon ↗"),
            new SponsoredDeal("LOCAL CLOUD VAULT", "Synology DiskStation DS224+ NAS",
                    "Private 2-bay on-premise cloud storage. Automated photo sync without monthly subscriptions.",
                    "https://www.synology.com/products/DS224+", "Explore Synology ↗"),
            new SponsoredDeal("ULTRA-FAST SPEED", "Samsung T9 Portable SSD 2TB",
                    "Up to 2,000MB/s USB 3.2 Gen 2x2 external drive. Instant read/write for 4K video & RAW images.",
                    "https://www.amazon.com/dp/B0CHFTZ41M", "View Deal ↗"),
            new SponsoredDeal("OFFSITE PROTECTION", "Backblaze Unlimited Cloud Backup",
                    "Automated offsite continuous backup to protect your physical drives against theft, loss, and hardware failure.",
                    "https://www.backblaze.com/cloud-backup.html", "Protect Files ↗"),
            new SponsoredDeal("MINIATURE DRIVE", "Crucial X9 Pro 2TB Portable SSD",
                    "Compact anodized aluminum design with 1,050MB/s speed and 256-bit AES hardware encryption.",
                    "https://www.crucial.com/products/ssd/portable-ssd", "Check Price ↗")
    );

    private int activeDealIndex = 0;
    private final List<SponsoredDeal> deals = new CopyOnWriteArrayList<>(DEFAULT_DEALS);

    public SponsoredCard(Consumer<String> urlOpener) {
        super(10);
        getStyleClass().add("glass-card");

        // Top Row: SPONSORED badge + Navigation
        HBox top = new HBox(8);
        top.setAlignment(Pos.CENTER_LEFT);

        Label sponsorBadge = new Label("SPONSORED");
        sponsorBadge.getStyleClass().add("badge-sponsor");

        Region spacer = new Region();
        HBox.setHgrow(spacer, Priority.ALWAYS);

        Button prevBtn = new Button("‹");
        prevBtn.getStyleClass().add("btn-nav-small");

        Button nextBtn = new Button("›");
        nextBtn.getStyleClass().add("btn-nav-small");

        top.getChildren().addAll(sponsorBadge, spacer, prevBtn, nextBtn);

        // Deal Content Box
        VBox dealBox = new VBox(6);
        dealBox.getStyleClass().add("inner-container");

        Label dealTag = new Label();
        dealTag.setStyle("-fx-font-size: 10px; -fx-font-weight: bold; -fx-text-fill: #f59e0b;");

        Label dealTitle = new Label();
        dealTitle.getStyleClass().add("text-primary");
        dealTitle.setStyle("-fx-font-size: 12px;");

        Label dealDesc = new Label();
        dealDesc.getStyleClass().add("text-secondary");
        dealDesc.setStyle("-fx-font-size: 11px; -fx-wrap-text: true;");

        Button ctaBtn = new Button();
        ctaBtn.getStyleClass().add("btn-deal-cta");

        dealBox.getChildren().addAll(dealTag, dealTitle, dealDesc, ctaBtn);

        Runnable updateDeal = () -> {
            if (deals.isEmpty()) return;
            activeDealIndex = Math.floorMod(activeDealIndex, deals.size());
            SponsoredDeal deal = deals.get(activeDealIndex);
            dealTag.setText(deal.tag());
            dealTitle.setText(deal.title());
            dealDesc.setText(deal.description());
            ctaBtn.setText(deal.cta());
            ctaBtn.setOnAction(e -> {
                if (urlOpener != null) urlOpener.accept(deal.url());
            });
        };

        updateDeal.run();

        prevBtn.setOnAction(e -> {
            if (deals.isEmpty()) return;
            activeDealIndex = (activeDealIndex - 1 + deals.size()) % deals.size();
            updateDeal.run();
        });

        nextBtn.setOnAction(e -> {
            if (deals.isEmpty()) return;
            activeDealIndex = (activeDealIndex + 1) % deals.size();
            updateDeal.run();
        });

        // Auto-rotation timeline every 12 seconds
        Timeline rotator = new Timeline(
                new KeyFrame(Duration.seconds(12), e -> {
                    if (deals.isEmpty()) return;
                    activeDealIndex = (activeDealIndex + 1) % deals.size();
                    updateDeal.run();
                })
        );
        rotator.setCycleCount(Animation.INDEFINITE);
        rotator.play();

        getChildren().addAll(top, dealBox);

        // Asynchronously synchronize deals from remote backend
        fetchBackendDeals(updateDeal);
    }

    private void fetchBackendDeals(Runnable onUpdated) {
        Thread worker = new Thread(() -> {
            try {
                String endpoint = System.getProperty("photovault.deals.url", "https://takeoutfix.pages.dev/api/deals.json");
                HttpClient client = HttpClient.newBuilder()
                        .connectTimeout(java.time.Duration.ofSeconds(3))
                        .build();
                HttpRequest request = HttpRequest.newBuilder()
                        .uri(URI.create(endpoint))
                        .timeout(java.time.Duration.ofSeconds(4))
                        .header("Accept", "application/json")
                        .GET()
                        .build();
                HttpResponse<String> response = client.send(request, HttpResponse.BodyHandlers.ofString());
                if (response.statusCode() == 200 && response.body() != null && !response.body().isBlank()) {
                    List<SponsoredDeal> remoteDeals = parseDealsJson(response.body());
                    if (!remoteDeals.isEmpty()) {
                        deals.clear();
                        deals.addAll(remoteDeals);
                        Platform.runLater(onUpdated);
                    }
                }
            } catch (Exception ignored) {
                // Network unavailable or offline: preserve DEFAULT_DEALS gracefully
            }
        }, "photovault-deals-fetcher");
        worker.setDaemon(true);
        worker.start();
    }

    private List<SponsoredDeal> parseDealsJson(String json) {
        List<SponsoredDeal> list = new ArrayList<>();
        Pattern objPattern = Pattern.compile("\\{[^}]+\\}");
        Matcher objMatcher = objPattern.matcher(json);
        while (objMatcher.find()) {
            String block = objMatcher.group();
            String tag = extractJsonField(block, "tag");
            String title = extractJsonField(block, "title");
            String description = extractJsonField(block, "description");
            String url = extractJsonField(block, "url");
            String cta = extractJsonField(block, "cta");
            if (title != null && url != null) {
                list.add(new SponsoredDeal(
                        tag != null ? tag : "SPONSORED",
                        title,
                        description != null ? description : "",
                        url,
                        cta != null ? cta : "Learn More ↗"
                ));
            }
        }
        return list;
    }

    private String extractJsonField(String block, String key) {
        Pattern fieldPattern = Pattern.compile("\"" + key + "\"\\s*:\\s*\"([^\"]*)\"");
        Matcher m = fieldPattern.matcher(block);
        return m.find() ? m.group(1).replace("\\\"", "\"") : null;
    }
}
