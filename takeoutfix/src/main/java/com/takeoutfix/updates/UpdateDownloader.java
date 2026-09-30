package com.takeoutfix.updates;

import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.time.Duration;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.function.Consumer;

/**
 * Downloads OTA update packages in the background with progress reporting and cancellation.
 */
public class UpdateDownloader {

    public interface DownloadProgressListener {
        void onProgress(long bytesRead, long totalBytes, double percentage, double speedMbPerSec);
    }

    private final AtomicBoolean isCancelled = new AtomicBoolean(false);

    public CompletableFuture<File> downloadAsync(String downloadUrl, String fileName, DownloadProgressListener listener) {
        return CompletableFuture.supplyAsync(() -> {
            try {
                isCancelled.set(false);
                Path updatesDir = Paths.get(System.getProperty("user.home"), ".takeoutfix", "updates");
                if (!java.nio.file.Files.exists(updatesDir)) {
                    java.nio.file.Files.createDirectories(updatesDir);
                }

                File destinationFile = updatesDir.resolve(fileName).toFile();

                HttpClient client = HttpClient.newBuilder()
                        .connectTimeout(Duration.ofSeconds(15))
                        .followRedirects(HttpClient.Redirect.NORMAL)
                        .build();

                HttpRequest request = HttpRequest.newBuilder()
                        .uri(URI.create(downloadUrl))
                        .header("User-Agent", "TakeoutFix-Desktop")
                        .GET()
                        .build();

                HttpResponse<InputStream> response = client.send(request, HttpResponse.BodyHandlers.ofInputStream());
                if (response.statusCode() != 200) {
                    throw new RuntimeException("Download failed with HTTP " + response.statusCode());
                }

                long contentLength = response.headers().firstValueAsLong("Content-Length").orElse(-1L);
                long startTime = System.currentTimeMillis();

                try (InputStream in = response.body();
                     FileOutputStream out = new FileOutputStream(destinationFile)) {
                    byte[] buffer = new byte[32768];
                    long totalRead = 0;
                    int read;

                    while ((read = in.read(buffer)) != -1) {
                        if (isCancelled.get()) {
                            destinationFile.delete();
                            throw new RuntimeException("Download cancelled by user");
                        }

                        out.write(buffer, 0, read);
                        totalRead += read;

                        if (listener != null) {
                            double pct = contentLength > 0 ? (double) totalRead / contentLength : -1.0;
                            long elapsed = Math.max(1, System.currentTimeMillis() - startTime);
                            double mbPerSec = (totalRead / (1024.0 * 1024.0)) / (elapsed / 1000.0);
                            listener.onProgress(totalRead, contentLength, pct, mbPerSec);
                        }
                    }
                }

                return destinationFile;
            } catch (Exception e) {
                throw new RuntimeException("Error during OTA update download: " + e.getMessage(), e);
            }
        });
    }

    public void cancel() {
        isCancelled.set(true);
    }
}
