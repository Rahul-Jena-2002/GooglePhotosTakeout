package com.takeoutfix.auth;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.IOException;
import java.net.URI;
import java.net.URLEncoder;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Duration;

/** Uses an atomic marker and increments compatible with the browser usage batches. */
final class UsageBatchClient {
    private final HttpClient client;
    private final String documentsUrl;
    private final String documentsName;

    UsageBatchClient(HttpClient client, String documentsUrl, String documentsName) {
        this.client = client;
        this.documentsUrl = documentsUrl;
        this.documentsName = documentsName;
    }

    boolean apply(UsageJournal.Batch batch, String token) throws IOException, InterruptedException {
        String uid = URLEncoder.encode(batch.uid(), StandardCharsets.UTF_8).replace("+", "%20");
        String userName = documentsName + "/users/" + batch.uid();
        String markerName = userName + "/usageBatches/" + batch.id();
        JSONObject fields = new JSONObject().put("files", integer(batch.files())).put("bytes", integer(batch.bytes()));
        JSONObject marker = new JSONObject()
                .put("update", new JSONObject().put("name", markerName).put("fields", fields))
                .put("currentDocument", new JSONObject().put("exists", false));
        JSONArray transforms = new JSONArray()
                .put(increment("usedFiles", batch.files())).put(increment("totalFilesProcessed", batch.files()))
                .put(increment("usedBytes", batch.bytes())).put(increment("totalBytesProcessed", batch.bytes()));
        JSONObject totals = new JSONObject().put("transform", new JSONObject()
                .put("document", userName).put("fieldTransforms", transforms));
        String body = new JSONObject().put("writes", new JSONArray().put(marker).put(totals)).toString();
        HttpRequest request = HttpRequest.newBuilder(URI.create(documentsUrl + ":commit"))
                .header("Authorization", "Bearer " + token).header("Content-Type", "application/json")
                .timeout(Duration.ofSeconds(10)).POST(HttpRequest.BodyPublishers.ofString(body)).build();
        HttpResponse<String> response = client.send(request, HttpResponse.BodyHandlers.ofString());
        if (response.statusCode() >= 200 && response.statusCode() < 300) return true;
        if (response.statusCode() != 409 && response.statusCode() != 412 && response.statusCode() != 400) return false;

        HttpRequest lookup = HttpRequest.newBuilder(URI.create(documentsUrl + "/users/" + uid + "/usageBatches/" + batch.id()))
                .header("Authorization", "Bearer " + token).timeout(Duration.ofSeconds(8)).GET().build();
        HttpResponse<String> existing = client.send(lookup, HttpResponse.BodyHandlers.ofString());
        if (existing.statusCode() != 200) return false;
        try {
            JSONObject saved = new JSONObject(existing.body()).getJSONObject("fields");
            return saved.getJSONObject("files").getLong("integerValue") == batch.files()
                    && saved.getJSONObject("bytes").getLong("integerValue") == batch.bytes();
        } catch (RuntimeException e) {
            return false;
        }
    }

    private static JSONObject integer(long value) {
        return new JSONObject().put("integerValue", Long.toString(value));
    }

    private static JSONObject increment(String field, long value) {
        return new JSONObject().put("fieldPath", field).put("increment", integer(value));
    }
}
