package ghidraplus.core;

import com.google.gson.JsonArray;
import com.google.gson.JsonObject;
import ghidraplus.bridge.ProgramBridge;
import java.nio.file.Path;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.function.Consumer;

/** In-memory program with generic function names, shared by the engine and server tests. */
public final class FakeBridge implements ProgramBridge {
    final LinkedHashMap<String, String> names = new LinkedHashMap<>();
    String source = "void *x = malloc(64);";
    java.util.List<String> calledNames = java.util.List.of("malloc");
    String state = "";
    boolean saved;
    CountDownLatch importEntered;
    CountDownLatch importRelease;
    public volatile Path opened;
    public FakeBridge(int count) {
        for (int i = 0; i < count; i++) names.put(Integer.toHexString(0x1000 + i), "FUN_" + Integer.toHexString(0x1000 + i));
    }
    @Override public JsonObject snapshot() {
        JsonObject graph = new JsonObject();
        JsonObject program = new JsonObject();
        program.addProperty("sha256", "test-binary");
        program.addProperty("path", "test.bin");
        program.addProperty("imageBase", "1000");
        program.addProperty("projectPath", "fake-project");
        graph.add("program", program);
        JsonArray functions = new JsonArray();
        for (Map.Entry<String, String> entry : names.entrySet()) {
            JsonObject function = new JsonObject();
            function.addProperty("address", entry.getKey());
            function.addProperty("name", entry.getValue());
            function.addProperty("external", false);
            functions.add(function);
        }
        graph.add("functions", functions);
        graph.add("edges", new JsonArray());
        graph.add("types", new JsonArray());
        return graph;
    }
    @Override public JsonObject evidence(String address) {
        if (!names.containsKey(address)) return null;
        JsonObject evidence = new JsonObject();
        evidence.addProperty("address", address);
        evidence.addProperty("name", names.get(address));
        evidence.addProperty("signature", "void *" + names.get(address) + "(void)");
        evidence.addProperty("source", source);
        evidence.addProperty("instructions", "call malloc");
        JsonArray calls = new JsonArray();
        for (String called : calledNames) calls.add(called);
        evidence.add("calledNames", calls);
        evidence.add("strings", new JsonArray());
        return evidence;
    }
    @Override public void open(Path binary, Consumer<String> progress) throws Exception {
        opened = binary;
        if (importEntered != null) importEntered.countDown();
        if (importRelease != null && !importRelease.await(5, TimeUnit.SECONDS)) throw new AssertionError("import release timed out");
        progress.accept("Opened");
    }
    @Override public String change(String address, String field, String value) {
        if (!"name".equals(field)) throw new IllegalArgumentException(field);
        if (!names.containsKey(address)) throw new IllegalArgumentException(address);
        return names.put(address, value);
    }
    @Override public boolean navigate(String address) { return names.containsKey(address); }
    @Override public String readState() { return state; }
    @Override public void writeState(String json) { state = json; }
    @Override public void save() { saved = true; }
    @Override public String exportSource() { return source; }
    @Override public void close() {}
}
