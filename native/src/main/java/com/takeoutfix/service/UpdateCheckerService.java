package com.takeoutfix.service;

import com.takeoutfix.util.AppVersion;
import org.json.JSONObject;

import javax.swing.*;
import java.awt.*;
import java.io.File;
import java.io.InputStream;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.util.List;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.TimeUnit;
import java.util.function.Consumer;

/**
 * Background service that periodically checks GitHub Releases for new updates
 * and notifies the user via native OS desktop notifications (SystemTray) and in-app UI badges.
 */
public class UpdateCheckerService {

    private static final String REPO_RELEASES_API = "https://api.github.com/repos/Rahul-Jena-2002/GooglePhotosTakeout/releases/latest";
    private static final String RELEASES_PAGE = "https://github.com/Rahul-Jena-2002/GooglePhotosTakeout/releases/latest";

    public record UpdateInfo(
            String versionTag,
            String releaseName,
            String htmlUrl,
            String releaseNotes,
            String downloadUrl,
            boolean isUpdateAvailable
    ) {}

    private final ScheduledExecutorService scheduler = Executors.newSingleThreadScheduledExecutor(r -> {
        Thread t = new Thread(r, "TakeoutFix-UpdateChecker");
        t.setDaemon(true);
        return t;
    });

    private final List<Consumer<UpdateInfo>> listeners = new CopyOnWriteArrayList<>();
    private volatile UpdateInfo latestUpdate = null;
    private TrayIcon activeTrayIcon = null;

    public void addListener(Consumer<UpdateInfo> listener) {
        listeners.add(listener);
        if (latestUpdate != null && latestUpdate.isUpdateAvailable()) {
            SwingUtilities.invokeLater(() -> listener.accept(latestUpdate));
        }
    }

    public UpdateInfo getLatestUpdate() {
        return latestUpdate;
    }

    /**
     * Starts update checking: once 2 seconds after boot, then every 4 hours.
     */
    public void start() {
        scheduler.schedule(this::checkForUpdates, 2, TimeUnit.SECONDS);
        scheduler.scheduleAtFixedRate(this::checkForUpdates, 4, 4, TimeUnit.HOURS);
    }

    public void checkForUpdates() {
        try {
            HttpClient client = HttpClient.newBuilder()
                    .connectTimeout(Duration.ofSeconds(6))
                    .followRedirects(HttpClient.Redirect.NORMAL)
                    .build();

            HttpRequest request = HttpRequest.newBuilder()
                    .uri(URI.create(REPO_RELEASES_API))
                    .timeout(Duration.ofSeconds(8))
                    .header("Accept", "application/vnd.github.v3+json")
                    .header("User-Agent", "TakeoutFix-Desktop/" + AppVersion.getVersion())
                    .GET()
                    .build();

            HttpResponse<String> response = client.send(request, HttpResponse.BodyHandlers.ofString());

            if (response.statusCode() == 200) {
                JSONObject json = new JSONObject(response.body());
                String tagName = json.optString("tag_name", "");
                String releaseName = json.optString("name", tagName);
                String htmlUrl = json.optString("html_url", RELEASES_PAGE);
                String body = json.optString("body", "");

                String downloadUrl = "";
                if (json.has("assets")) {
                    org.json.JSONArray assets = json.optJSONArray("assets");
                    if (assets != null) {
                        for (int i = 0; i < assets.length(); i++) {
                            JSONObject asset = assets.getJSONObject(i);
                            String assetName = asset.optString("name", "").toLowerCase();
                            if (assetName.endsWith(".jar") || assetName.endsWith(".exe") || assetName.endsWith(".zip")) {
                                downloadUrl = asset.optString("browser_download_url", "");
                                break;
                            }
                        }
                    }
                }

                boolean isNewer = AppVersion.isNewerThanCurrent(tagName);
                UpdateInfo info = new UpdateInfo(tagName, releaseName, htmlUrl, body, downloadUrl, isNewer);
                this.latestUpdate = info;

                if (isNewer) {
                    System.out.println("[UpdateChecker] Newer version found: " + tagName + " (Current: " + AppVersion.getVersion() + ")");
                    // 1. Dispatch Native OS Push Notification
                    showNativePushNotification(info);

                    // 2. Notify GUI listeners
                    for (Consumer<UpdateInfo> listener : listeners) {
                        try {
                            SwingUtilities.invokeLater(() -> listener.accept(info));
                        } catch (Exception ignored) {}
                    }
                } else {
                    System.out.println("[UpdateChecker] TakeoutFix is up to date (" + AppVersion.getFullVersionString() + ").");
                }
            }
        } catch (Exception e) {
            System.err.println("[UpdateChecker] Failed to check for updates: " + e.getMessage());
        }
    }

    /**
     * Downloads and installs the update directly inside the app with a progress dialog (OTA update).
     */
    public static void performOtaUpdate(Component parent, UpdateInfo info) {
        if (info == null) return;
        String targetDownloadUrl = info.downloadUrl();
        if (targetDownloadUrl == null || targetDownloadUrl.isBlank()) {
            openDownloadPage(info.htmlUrl());
            return;
        }

        Frame owner = (parent instanceof Frame) ? (Frame) parent : (Frame) SwingUtilities.getWindowAncestor(parent);
        JDialog progressDialog = new JDialog(owner, "TakeoutFix OTA Updater", true);
        progressDialog.setSize(440, 180);
        progressDialog.setLocationRelativeTo(parent);
        progressDialog.setLayout(new BorderLayout(10, 10));

        JPanel panel = new JPanel();
        panel.setLayout(new BoxLayout(panel, BoxLayout.Y_AXIS));
        panel.setBorder(BorderFactory.createEmptyBorder(18, 20, 18, 20));

        JLabel titleLabel = new JLabel("Downloading TakeoutFix " + info.versionTag() + "...");
        titleLabel.setFont(new Font("Segoe UI", Font.BOLD, 14));
        titleLabel.setAlignmentX(Component.CENTER_ALIGNMENT);
        panel.add(titleLabel);
        panel.add(Box.createVerticalStrut(12));

        JProgressBar pbar = new JProgressBar(0, 100);
        pbar.setStringPainted(true);
        pbar.setAlignmentX(Component.CENTER_ALIGNMENT);
        pbar.setPreferredSize(new Dimension(380, 22));
        panel.add(pbar);
        panel.add(Box.createVerticalStrut(10));

        JLabel statusLabel = new JLabel("Connecting to GitHub release server...");
        statusLabel.setFont(new Font("Segoe UI", Font.PLAIN, 12));
        statusLabel.setAlignmentX(Component.CENTER_ALIGNMENT);
        panel.add(statusLabel);

        progressDialog.add(panel, BorderLayout.CENTER);

        Thread downloadThread = new Thread(() -> {
            try {
                HttpClient client = HttpClient.newBuilder()
                        .connectTimeout(Duration.ofSeconds(15))
                        .followRedirects(HttpClient.Redirect.NORMAL)
                        .build();

                HttpRequest req = HttpRequest.newBuilder()
                        .uri(URI.create(targetDownloadUrl))
                        .header("User-Agent", "TakeoutFix-Desktop")
                        .GET()
                        .build();

                HttpResponse<InputStream> resp = client.send(req, HttpResponse.BodyHandlers.ofInputStream());
                if (resp.statusCode() != 200) {
                    throw new Exception("HTTP error " + resp.statusCode());
                }

                long contentLength = resp.headers().firstValueAsLong("Content-Length").orElse(-1L);
                File updatesDir = new File(System.getProperty("user.home"), ".takeoutfix/updates");
                updatesDir.mkdirs();
                File targetFile = new File(updatesDir, "takeoutfix-" + info.versionTag() + ".jar");

                try (InputStream in = resp.body();
                     java.io.FileOutputStream out = new java.io.FileOutputStream(targetFile)) {
                    byte[] buffer = new byte[16384];
                    long totalRead = 0;
                    int read;
                    while ((read = in.read(buffer)) != -1) {
                        out.write(buffer, 0, read);
                        totalRead += read;
                        if (contentLength > 0) {
                            int pct = (int) ((totalRead * 100) / contentLength);
                            double mbRead = totalRead / (1024.0 * 1024.0);
                            double mbTotal = contentLength / (1024.0 * 1024.0);
                            SwingUtilities.invokeLater(() -> {
                                pbar.setValue(pct);
                                statusLabel.setText(String.format(java.util.Locale.US, "Downloaded %.1f MB / %.1f MB (%d%%)", mbRead, mbTotal, pct));
                            });
                        }
                    }
                }

                SwingUtilities.invokeLater(() -> {
                    pbar.setValue(100);
                    progressDialog.dispose();

                    int restart = JOptionPane.showOptionDialog(parent,
                            "TakeoutFix " + info.versionTag() + " has been downloaded successfully!\n\n"
                                    + "Saved to:\n" + targetFile.getAbsolutePath() + "\n\n"
                                    + "Would you like to restart now to launch the updated version?",
                            "OTA Update Ready",
                            JOptionPane.YES_NO_OPTION,
                            JOptionPane.INFORMATION_MESSAGE,
                            null,
                            new String[]{"Restart Now", "Later"},
                            "Restart Now");

                    if (restart == 0) {
                        try {
                            new ProcessBuilder("java", "-jar", targetFile.getAbsolutePath()).start();
                            System.exit(0);
                        } catch (Exception launchErr) {
                            JOptionPane.showMessageDialog(parent, "Please launch the new update manually:\n" + targetFile.getAbsolutePath(), "Manual Launch Required", JOptionPane.INFORMATION_MESSAGE);
                        }
                    }
                });

            } catch (Exception ex) {
                SwingUtilities.invokeLater(() -> {
                    progressDialog.dispose();
                    int opt = JOptionPane.showOptionDialog(parent,
                            "OTA automatic download failed: " + ex.getMessage() + "\n\nWould you like to open the GitHub releases page instead?",
                            "OTA Update Failed",
                            JOptionPane.YES_NO_OPTION,
                            JOptionPane.WARNING_MESSAGE,
                            null,
                            new String[]{"Open Browser", "Cancel"},
                            "Open Browser");
                    if (opt == 0) {
                        openDownloadPage(info.htmlUrl());
                    }
                });
            }
        }, "TakeoutFix-OTA-Downloader");

        downloadThread.setDaemon(true);
        downloadThread.start();
        progressDialog.setVisible(true);
    }

    /**
     * Fires a native OS push notification banner (Windows Action Center notification or macOS Notification Center).
     */
    private void showNativePushNotification(UpdateInfo info) {
        if (!SystemTray.isSupported()) {
            return;
        }

        SwingUtilities.invokeLater(() -> {
            try {
                SystemTray tray = SystemTray.getSystemTray();
                if (activeTrayIcon == null) {
                    Image trayImg = loadAppIcon();
                    if (trayImg == null) {
                        // Fallback 16x16 icon
                        java.awt.image.BufferedImage img = new java.awt.image.BufferedImage(16, 16, java.awt.image.BufferedImage.TYPE_INT_ARGB);
                        Graphics2D g2 = img.createGraphics();
                        g2.setColor(new Color(16, 185, 129));
                        g2.fillOval(0, 0, 16, 16);
                        g2.dispose();
                        trayImg = img;
                    }

                    activeTrayIcon = new TrayIcon(trayImg, "TakeoutFix Desktop");
                    activeTrayIcon.setImageAutoSize(true);
                    activeTrayIcon.addActionListener(e -> performOtaUpdate(null, info));

                    tray.add(activeTrayIcon);
                }

                activeTrayIcon.displayMessage(
                        "TakeoutFix Update Available!",
                        "Version " + info.versionTag() + " is ready.\nClick here to install OTA update.",
                        TrayIcon.MessageType.INFO
                );

                // Auto-cleanup tray icon after 30 seconds if not clicked so it doesn't clutter tray
                Timer removeTimer = new Timer(30000, evt -> {
                    try {
                        if (activeTrayIcon != null) {
                            tray.remove(activeTrayIcon);
                            activeTrayIcon = null;
                        }
                    } catch (Exception ignored) {}
                });
                removeTimer.setRepeats(false);
                removeTimer.start();

            } catch (Exception ex) {
                System.err.println("[UpdateChecker] Could not display native tray notification: " + ex.getMessage());
            }
        });
    }

    private Image loadAppIcon() {
        try (InputStream is = getClass().getResourceAsStream("/icons/icon.png")) {
            if (is != null) {
                byte[] bytes = is.readAllBytes();
                return Toolkit.getDefaultToolkit().createImage(bytes);
            }
        } catch (Exception ignored) {}
        return null;
    }

    public static void openDownloadPage(String targetUrl) {
        try {
            String url = (targetUrl != null && !targetUrl.isBlank()) ? targetUrl : RELEASES_PAGE;
            Desktop.getDesktop().browse(new URI(url));
        } catch (Exception e) {
            System.err.println("[UpdateChecker] Failed to browse release page: " + e.getMessage());
        }
    }
}
