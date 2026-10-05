package ghidraplus.server;

import ghidraplus.core.AnalysisEngine;
import ghidraplus.core.FakeBridge;
import ghidraplus.core.TypeSafeClient;
import java.io.InputStream;
import java.net.Socket;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;

/** Exercises the real HTTP server: credentials, origin, static file confinement, uploads, and key secrecy. */
public final class InvestigationServerTest {
    private static final HttpClient HTTP = HttpClient.newHttpClient();

    public static void main(String[] args) throws Exception {
        Path assets = Files.createTempDirectory("ghidraplus-assets");
        Files.writeString(assets.resolve("index.html"), "<html>workspace</html>");
        Path secret = Files.writeString(assets.getParent().resolve("ghidraplus-secret.txt"), "outside the assets");
        FakeBridge bridge = new FakeBridge(1);
        AnalysisEngine engine = new AnalysisEngine(bridge, null, new TypeSafeClient());
        try (InvestigationServer server = new InvestigationServer(engine, 0, assets)) {
            server.start();
            String url = server.url();
            String base = url.substring(0, url.indexOf("/#"));
            String token = url.substring(url.indexOf("token=") + 6);
            int port = URI.create(base).getPort();

            check(get(base + "/", null, null).statusCode() == 200, "workspace page needs no token");
            check(get(base + "/api/project", null, null).statusCode() == 401, "API refuses a missing token");
            check(get(base + "/api/project", "wrong", null).statusCode() == 401, "API refuses a wrong token");
            check(get(base + "/api/project", token, "http://evil.example").statusCode() == 403, "API refuses a foreign origin");
            check(rawStatus(port, "GET /api/project HTTP/1.1\r\nHost: evil.example:" + port + "\r\nX-Ghidra-Token: " + token + "\r\n\r\n") == 403,
                "API refuses a foreign Host header");
            HttpResponse<String> project = get(base + "/api/project", token, base);
            check(project.statusCode() == 200 && project.body().contains("FUN_1000"), "valid token and origin read the project");
            check(post(base + "/api/settings", token, base, "{\"apiKey\":\"private-key-value\"}", null).statusCode() == 200, "key can be set");
            String afterKey = get(base + "/api/project", token, base).body();
            check(afterKey.contains("\"configured\":true") && !afterKey.contains("private-key-value"), "snapshot reports the key as configured without exposing it");

            check(rawStatus(port, "GET /..%2fghidraplus-secret.txt HTTP/1.1\r\nHost: 127.0.0.1:" + port + "\r\n\r\n") == 404, "encoded traversal is refused");
            check(rawStatus(port, "GET /../ghidraplus-secret.txt HTTP/1.1\r\nHost: 127.0.0.1:" + port + "\r\n\r\n") == 404, "dot-dot traversal is refused");
            check(Files.exists(secret), "test file sits next to the assets directory");

            HttpResponse<String> large = post(base + "/api/rename", token, base, "{\"name\":\"" + "x".repeat(70_000) + "\"}", null);
            check(large.statusCode() == 400, "oversized JSON body is refused");

            HttpResponse<String> upload = post(base + "/api/import", token, base, "MZ", "..%2f..%2fevil name.exe");
            check(upload.statusCode() == 202, "upload is accepted: " + upload.body());
            Path saved = bridge.opened;
            check(saved.getFileName().toString().equals(".._.._evil_name.exe"), "upload filename is sanitized: " + saved.getFileName());
            check(saved.startsWith(Path.of(System.getProperty("java.io.tmpdir")).toAbsolutePath()), "upload stays under the temporary directory");
            check(post(base + "/api/import", token, base, "", "empty.exe").statusCode() == 400, "empty upload is refused");
        }
        engine.close();
        System.out.println("InvestigationServerTest passed");
    }

    private static HttpResponse<String> get(String url, String token, String origin) throws Exception {
        HttpRequest.Builder request = HttpRequest.newBuilder(URI.create(url));
        if (token != null) request.header("X-Ghidra-Token", token);
        if (origin != null) request.header("Origin", origin);
        return HTTP.send(request.build(), HttpResponse.BodyHandlers.ofString());
    }

    private static HttpResponse<String> post(String url, String token, String origin, String body, String filename) throws Exception {
        HttpRequest.Builder request = HttpRequest.newBuilder(URI.create(url))
            .header("X-Ghidra-Token", token).header("Origin", origin).POST(HttpRequest.BodyPublishers.ofString(body));
        if (filename != null) request.header("X-Filename", filename);
        return HTTP.send(request.build(), HttpResponse.BodyHandlers.ofString());
    }

    /** Sends exact bytes so path and Host header handling are not normalized by a client library. */
    private static int rawStatus(int port, String request) throws Exception {
        try (Socket socket = new Socket("127.0.0.1", port)) {
            socket.getOutputStream().write(request.getBytes(StandardCharsets.US_ASCII));
            InputStream input = socket.getInputStream();
            String line = new String(input.readNBytes(12), StandardCharsets.US_ASCII);
            return Integer.parseInt(line.substring(9, 12));
        }
    }

    private static void check(boolean condition, String message) {
        if (!condition) throw new AssertionError(message);
    }
}
