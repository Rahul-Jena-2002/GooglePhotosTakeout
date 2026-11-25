package com.takeoutfix.auth;

import com.sun.net.httpserver.HttpServer;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import java.net.InetSocketAddress;
import java.net.http.HttpClient;
import java.nio.file.Path;
import java.util.Map;
import java.util.concurrent.atomic.AtomicInteger;
import static org.junit.jupiter.api.Assertions.*;

class FirebaseUsageSyncTest {
    @TempDir Path root;

    @AfterEach void cleanup() {
        UserController.getCurrentUserProfile().clear();
        UserController.setProfileUpdateListener(null);
    }

    @Test void failedDeliveryStaysQueuedAndRetryOnlySendsCurrentAccount() throws Exception {
        var journal = new UsageJournal(root.resolve("pending-usage-v2"));
        var first = journal.append("a", 2, 200);
        var second = journal.append("b", 1, 50);
        AtomicInteger status = new AtomicInteger(503);
        AtomicInteger requests = new AtomicInteger();
        HttpServer server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        server.createContext("/documents:commit", exchange -> {
            requests.incrementAndGet();
            exchange.getRequestBody().readAllBytes();
            exchange.sendResponseHeaders(status.get(), -1);
            exchange.close();
        });
        server.start();
        try {
            var client = new UsageBatchClient(HttpClient.newHttpClient(), "http://127.0.0.1:" + server.getAddress().getPort() + "/documents", "projects/demo/databases/(default)/documents");
            var service = new FirebaseSyncService(root.toFile(), false, new CredentialStore(root.toFile()), client);
            UserController.getCurrentUserProfile().putAll(Map.of("uid", "a", "email", "a@example.invalid", "idToken", "token-a"));
            assertFalse(service.pushCurrentTotalsToCloud());
            assertEquals(first, journal.pendingFor("a").get(0));
            status.set(200);
            assertTrue(service.pushCurrentTotalsToCloud());
            assertTrue(journal.pendingFor("a").isEmpty());
            assertEquals(second, journal.pendingFor("b").get(0));
            assertEquals(2, requests.get());
            UserController.getCurrentUserProfile().clear();
            UserController.getCurrentUserProfile().putAll(Map.of("uid", "b", "email", "b@example.invalid", "idToken", "token-b"));
            assertTrue(service.pushCurrentTotalsToCloud());
            assertTrue(journal.pendingFor("b").isEmpty());
        } finally { server.stop(0); }
    }
}
