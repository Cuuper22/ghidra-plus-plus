package ghidraplus.core;

import com.google.gson.JsonObject;
import com.google.gson.JsonParser;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.util.concurrent.CancellationException;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.CompletionException;

/** Small, replaceable transport for TypeSafe's typed System One endpoint. */
public class TypeSafeClient {
    public static final String MODEL = "jev-1.13.0";
    private static final URI ENDPOINT = URI.create("https://api.typesafe.ai/v1/systemone");
    private final HttpClient http;
    private volatile CompletableFuture<?> active;

    public TypeSafeClient() {
        this(HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(15)).build());
    }

    public TypeSafeClient(HttpClient http) {
        this.http = http;
    }

    public JsonObject evaluate(JsonObject request, String apiKey) throws Exception {
        if (apiKey == null || apiKey.isBlank()) {
            throw new IllegalStateException("TypeSafe API key is not configured");
        }
        HttpRequest call = HttpRequest.newBuilder(ENDPOINT)
            .header("Authorization", "Bearer " + apiKey.trim())
            .header("Content-Type", "application/json")
            .timeout(Duration.ofSeconds(60))
            .POST(HttpRequest.BodyPublishers.ofString(request.toString()))
            .build();
        try {
            CompletableFuture<HttpResponse<String>> pending = http.sendAsync(call, HttpResponse.BodyHandlers.ofString());
            active = pending;
            HttpResponse<String> response = pending.join();
            if (response.statusCode() != 200) {
                String body = response.body();
                if (body.length() > 800) body = body.substring(0, 800);
                throw new HttpFailure(response.statusCode(), body);
            }
            JsonObject result = JsonParser.parseString(response.body()).getAsJsonObject();
            if (!result.has("answers") || !result.get("answers").isJsonObject()) {
                throw new IllegalStateException("TypeSafe response has no answers object");
            }
            return result;
        } catch (CompletionException e) {
            if (e.getCause() instanceof CancellationException cancellation) throw cancellation;
            if (e.getCause() instanceof Exception exception) throw exception;
            throw e;
        } finally {
            active = null;
        }
    }

    public void cancelActive() {
        CompletableFuture<?> request = active;
        if (request != null) request.cancel(true);
    }

    public static final class HttpFailure extends Exception {
        private final int status;
        public HttpFailure(int status, String response) {
            super("TypeSafe HTTP " + status + ": " + response);
            this.status = status;
        }
        public int status() { return status; }
    }
}
