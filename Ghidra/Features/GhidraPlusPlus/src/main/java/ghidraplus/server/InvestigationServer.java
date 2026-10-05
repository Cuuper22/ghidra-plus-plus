package ghidraplus.server;

import com.google.gson.*;
import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpServer;
import ghidra.framework.Application;
import ghidraplus.core.AnalysisEngine;
import java.io.*;
import java.net.*;
import java.nio.charset.StandardCharsets;
import java.nio.file.*;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.util.*;
import java.util.concurrent.*;
import java.util.regex.*;

/** A loopback-only transport for the investigation workspace and local integrations. */
public final class InvestigationServer implements AutoCloseable {
    private static final Pattern FINDING_ACTION = Pattern.compile("/api/findings/([^/]+)/(apply|undo)");
    private static final long MAX_UPLOAD = 512L * 1024 * 1024;
    private static final Gson JSON = new GsonBuilder().serializeNulls().create();
    private final AnalysisEngine engine;
    private final HttpServer server;
    private final ExecutorService requests;
    private final Path assets;
    private final Path uploads;
    private final String token;

    public InvestigationServer(AnalysisEngine engine, int port, Path assets) throws IOException {
        this.engine = engine;
        this.assets = assets == null ? locateAssets() : assets.toAbsolutePath().normalize();
        uploads = Files.createTempDirectory("ghidraplus-imports-");
        byte[] random = new byte[32];
        new SecureRandom().nextBytes(random);
        token = Base64.getUrlEncoder().withoutPadding().encodeToString(random);
        server = HttpServer.create(new InetSocketAddress(InetAddress.getByName("127.0.0.1"), port), 32);
        requests = Executors.newFixedThreadPool(4, runnable -> {
            Thread thread = new Thread(runnable, "ghidraplus-http");
            thread.setDaemon(true);
            return thread;
        });
        server.setExecutor(requests);
        server.createContext("/", this::handle);
    }

    private static Path locateAssets() throws IOException {
        return Application.getModuleDataSubDirectory("GhidraPlusPlus", "web").getFile(false).toPath();
    }

    public void start() { server.start(); }
    public String url() { return origin() + "/#token=" + token; }
    private String origin() { return "http://127.0.0.1:" + server.getAddress().getPort(); }

    private void handle(HttpExchange exchange) throws IOException {
        try {
            exchange.getResponseHeaders().set("X-Content-Type-Options", "nosniff");
            exchange.getResponseHeaders().set("Referrer-Policy", "no-referrer");
            exchange.getResponseHeaders().set("Cache-Control", "no-store");
            exchange.getResponseHeaders().set("Content-Security-Policy",
                "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; " +
                "img-src 'self' data:; connect-src 'self'; font-src 'self'; frame-ancestors 'none'; base-uri 'none'");
            String path = exchange.getRequestURI().getPath();
            if (!path.startsWith("/api/")) { staticFile(exchange, path); return; }
            if (!authorized(exchange)) { error(exchange, 401, "Open this workspace using the link from Ghidra++."); return; }
            if (!sameOrigin(exchange)) { error(exchange, 403, "This workspace accepts requests from its own window only."); return; }
            switch (exchange.getRequestMethod()) {
                case "GET" -> read(exchange, path);
                case "POST" -> act(exchange, path);
                default -> error(exchange, 405, "Use GET or POST");
            }
        }
        catch (IllegalArgumentException exception) { error(exchange, 400, safeMessage(exception)); }
        catch (IllegalStateException exception) { error(exchange, 409, safeMessage(exception)); }
        catch (Exception exception) { error(exchange, 500, safeMessage(exception)); }
        finally { exchange.close(); }
    }

    private void read(HttpExchange exchange, String path) throws Exception {
        if (path.equals("/api/project")) json(exchange, 200, engine.snapshot());
        else if (path.startsWith("/api/functions/")) json(exchange, 200, engine.function(path.substring("/api/functions/".length())));
        else if (path.equals("/api/export/source")) {
            exchange.getResponseHeaders().set("Content-Disposition", "attachment; filename=\"reconstructed.c\"");
            send(exchange, 200, "text/plain; charset=utf-8", engine.exportSource().getBytes(StandardCharsets.UTF_8));
        }
        else if (path.equals("/api/export/project")) {
            exchange.getResponseHeaders().set("Content-Disposition", "attachment; filename=\"ghidraplus-analysis.json\"");
            json(exchange, 200, engine.snapshot());
        }
        else error(exchange, 404, "Unknown API route");
    }

    private void act(HttpExchange exchange, String path) throws Exception {
        if (path.equals("/api/import")) { importBinary(exchange); return; }
        JsonObject body = body(exchange);
        Matcher finding = FINDING_ACTION.matcher(path);
        String findingId = null;
        if (finding.matches()) {
            findingId = finding.group(1);
            if (finding.group(2).equals("apply")) engine.apply(findingId); else engine.undo(findingId);
        }
        else switch (path) {
            case "/api/analyze" -> engine.analyze(value(body, "depth", "balanced"), value(body, "mode", "hybrid"));
            case "/api/pause" -> engine.pause();
            case "/api/resume" -> engine.resume();
            case "/api/save" -> engine.save();
            case "/api/rename" -> engine.rename(required(body, "address"), required(body, "name"));
            case "/api/settings" -> engine.setApiKey(required(body, "apiKey"));
            case "/api/navigate" -> {
                if (!engine.navigate(required(body, "address"))) {
                    error(exchange, 409, "Classic Ghidra is unavailable in this headless session."); return;
                }
            }
            default -> { error(exchange, 404, "Unknown API route"); return; }
        }
        json(exchange, 200, outcome(findingId));
    }

    /** Requests must come from this server's own origin; the Host check also blocks DNS rebinding. */
    private boolean sameOrigin(HttpExchange exchange) {
        String origin = exchange.getRequestHeaders().getFirst("Origin");
        String host = exchange.getRequestHeaders().getFirst("Host");
        return (origin == null || origin().equals(origin)) && origin().equals("http://" + host);
    }

    private boolean authorized(HttpExchange exchange) {
        String supplied = exchange.getRequestHeaders().getFirst("X-Ghidra-Token");
        return supplied != null && MessageDigest.isEqual(token.getBytes(StandardCharsets.US_ASCII), supplied.getBytes(StandardCharsets.US_ASCII));
    }

    private void importBinary(HttpExchange exchange) throws Exception {
        String filename = exchange.getRequestHeaders().getFirst("X-Filename");
        if (filename == null || filename.isBlank()) throw new IllegalArgumentException("Choose a compiled program to import.");
        filename = URLDecoder.decode(filename, StandardCharsets.UTF_8).replaceAll("[^a-zA-Z0-9._-]", "_");
        if (filename.length() > 120) filename = filename.substring(filename.length() - 120);
        if (filename.equals(".") || filename.equals("..")) throw new IllegalArgumentException("Invalid filename");
        Path directory = Files.createDirectory(uploads.resolve(UUID.randomUUID().toString()));
        Path file = directory.resolve(filename);
        long total = 0;
        try (InputStream input = exchange.getRequestBody(); OutputStream output = Files.newOutputStream(file)) {
            byte[] buffer = new byte[64 * 1024];
            int read;
            while ((read = input.read(buffer)) != -1) {
                total += read;
                if (total > MAX_UPLOAD) throw new IllegalArgumentException("Browser imports are limited to 512 MB. Use --open for larger programs.");
                output.write(buffer, 0, read);
            }
        }
        catch (Exception exception) { Files.deleteIfExists(file); Files.deleteIfExists(directory); throw exception; }
        if (total == 0) { Files.deleteIfExists(file); Files.deleteIfExists(directory); throw new IllegalArgumentException("The selected file is empty."); }
        try { engine.open(file); }
        catch (Exception exception) { Files.deleteIfExists(file); Files.deleteIfExists(directory); throw exception; }
        json(exchange, 202, outcome(null));
    }

    /** Actions report the new state so clients and agents need not re-read the whole project. */
    private JsonObject outcome(String findingId) throws Exception {
        JsonObject snapshot = engine.snapshot();
        JsonObject result = new JsonObject();
        result.addProperty("ok", true);
        result.add("analysis", snapshot.get("analysis"));
        if (findingId != null) {
            for (JsonElement finding : snapshot.getAsJsonArray("findings")) {
                if (findingId.equals(finding.getAsJsonObject().get("id").getAsString())) result.add("finding", finding);
            }
        }
        return result;
    }

    private void staticFile(HttpExchange exchange, String path) throws IOException {
        if (!"GET".equals(exchange.getRequestMethod())) { error(exchange, 405, "Use GET"); return; }
        Path file;
        try { file = assets.resolve(path.equals("/") ? "index.html" : path.substring(1)).normalize(); }
        catch (InvalidPathException invalid) { file = assets; }
        if (!file.startsWith(assets) || !Files.isRegularFile(file)) { error(exchange, 404, "Workspace file not found"); return; }
        String name = file.getFileName().toString();
        String type = name.endsWith(".html") ? "text/html; charset=utf-8" : name.endsWith(".js") ? "text/javascript; charset=utf-8" :
            name.endsWith(".css") ? "text/css; charset=utf-8" : name.endsWith(".svg") ? "image/svg+xml" : name.endsWith(".png") ? "image/png" :
            name.endsWith(".woff2") ? "font/woff2" : "application/octet-stream";
        send(exchange, 200, type, Files.readAllBytes(file));
    }

    private static JsonObject body(HttpExchange exchange) throws IOException {
        byte[] bytes = exchange.getRequestBody().readNBytes(64 * 1024 + 1);
        if (bytes.length > 64 * 1024) throw new IllegalArgumentException("Request body is too large");
        if (bytes.length == 0) return new JsonObject();
        try { return JsonParser.parseString(new String(bytes, StandardCharsets.UTF_8)).getAsJsonObject(); }
        catch (RuntimeException exception) { throw new IllegalArgumentException("Request body must be a JSON object"); }
    }

    private static String required(JsonObject body, String name) {
        String value = value(body, name, "");
        if (value.isBlank()) throw new IllegalArgumentException(name + " is required");
        return value;
    }
    private static String value(JsonObject body, String name, String fallback) {
        return body.has(name) && !body.get(name).isJsonNull() ? body.get(name).getAsString() : fallback;
    }
    private static String safeMessage(Exception exception) {
        String message = exception.getMessage();
        if (message == null || message.isBlank()) return exception.getClass().getSimpleName();
        return message.replaceAll("apikey_[A-Za-z0-9_]+", "[credential]");
    }
    private static void error(HttpExchange exchange, int status, String message) throws IOException {
        JsonObject result = new JsonObject(); result.addProperty("error", message); json(exchange, status, result);
    }
    private static void json(HttpExchange exchange, int status, JsonElement result) throws IOException {
        send(exchange, status, "application/json; charset=utf-8", JSON.toJson(result).getBytes(StandardCharsets.UTF_8));
    }
    private static void send(HttpExchange exchange, int status, String type, byte[] bytes) throws IOException {
        exchange.getResponseHeaders().set("Content-Type", type);
        exchange.sendResponseHeaders(status, bytes.length);
        exchange.getResponseBody().write(bytes);
    }
    @Override public void close() {
        server.stop(0);
        requests.shutdownNow();
        // Imported originals remain until the process exits, so reopen-by-path keeps working.
        try (var paths = Files.walk(uploads)) {
            paths.sorted(Comparator.reverseOrder()).forEach(path -> { try { Files.deleteIfExists(path); } catch (IOException ignored) { } });
        } catch (IOException ignored) { }
    }
}
