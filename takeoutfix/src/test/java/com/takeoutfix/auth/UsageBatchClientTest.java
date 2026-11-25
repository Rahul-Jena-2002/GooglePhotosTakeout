package com.takeoutfix.auth;

import com.sun.net.httpserver.HttpServer;
import org.json.JSONObject;
import org.junit.jupiter.api.Test;

import java.net.InetSocketAddress;
import java.net.http.HttpClient;
import java.nio.charset.StandardCharsets;
import java.util.UUID;
import java.util.concurrent.atomic.AtomicReference;

import static org.junit.jupiter.api.Assertions.*;

class UsageBatchClientTest {
    @Test void commitsMarkerAndIncrementsTogether() throws Exception {
        AtomicReference<JSONObject> body = new AtomicReference<>();
        HttpServer server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        server.createContext("/documents:commit", exchange -> {
            body.set(new JSONObject(new String(exchange.getRequestBody().readAllBytes(), StandardCharsets.UTF_8)));
            exchange.sendResponseHeaders(200, -1);
            exchange.close();
        });
        server.start();
        try {
            var batch = new UsageJournal.Batch(UUID.randomUUID(), "user-a", 3, 2048);
            var client = new UsageBatchClient(HttpClient.newHttpClient(), "http://127.0.0.1:" + server.getAddress().getPort() + "/documents", "projects/demo/databases/(default)/documents");
            assertTrue(client.apply(batch, "test-token"));
            var writes = body.get().getJSONArray("writes");
            assertEquals(2, writes.length());
            assertFalse(writes.getJSONObject(0).getJSONObject("currentDocument").getBoolean("exists"));
            assertTrue(writes.getJSONObject(0).getJSONObject("update").getString("name").endsWith("/users/user-a/usageBatches/" + batch.id()));
            assertEquals(4, writes.getJSONObject(1).getJSONObject("transform").getJSONArray("fieldTransforms").length());
        } finally { server.stop(0); }
    }

    @Test void retryAcknowledgesOnlyMatchingExistingMarker() throws Exception {
        HttpServer server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        AtomicReference<String> savedBytes = new AtomicReference<>("2048");
        server.createContext("/documents", exchange -> {
            if (exchange.getRequestURI().getPath().endsWith(":commit")) {
                exchange.sendResponseHeaders(409, -1);
            } else {
                byte[] body = ("{\"fields\":{\"files\":{\"integerValue\":\"3\"},\"bytes\":{\"integerValue\":\"" + savedBytes.get() + "\"}}}").getBytes(StandardCharsets.UTF_8);
                exchange.sendResponseHeaders(200, body.length);
                exchange.getResponseBody().write(body);
            }
            exchange.close();
        });
        server.start();
        try {
            var batch = new UsageJournal.Batch(UUID.randomUUID(), "user-a", 3, 2048);
            var client = new UsageBatchClient(HttpClient.newHttpClient(), "http://127.0.0.1:" + server.getAddress().getPort() + "/documents", "projects/demo/databases/(default)/documents");
            assertTrue(client.apply(batch, "test-token"));
            savedBytes.set("999");
            assertFalse(client.apply(batch, "test-token"));
        } finally { server.stop(0); }
    }
}
