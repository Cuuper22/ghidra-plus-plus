package ghidraplus.core;

import com.google.gson.JsonArray;
import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import java.nio.file.Path;
import java.util.Map;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;

/** Dependency-free behavior checks. Run with assertions enabled. */
public final class AnalysisEngineTest {
    public static void main(String[] args) throws Exception {
        applyUndoAndRestore();
        cacheAndStaleEvidence();
        pauseAtTaskBoundary();
        importSnapshotResponsive();
        fastProgressAndRequestBudget();
        importDoesNotFinishBeforeSemanticAnalysis();
        sourceOnlyFunctionGetsConcreteNameChoices();
        serviceFailuresAreClearAndKeyFree();
        renameInvalidatesCachedResults();
        invalidRenameDoesNotAffectNextRename();
        resumeRestoresAnalyzingStatus();
        unreadableSavedStateIsIgnored();
        System.out.println("AnalysisEngineTest passed");
    }

    private static void applyUndoAndRestore() throws Exception {
        FakeBridge bridge = new FakeBridge(1);
        FakeClient client = new FakeClient();
        AnalysisEngine engine = new AnalysisEngine(bridge, "private-key", client);
        engine.analyze("balanced", "fixed");
        await(engine, "complete");
        JsonObject snapshot = engine.snapshot();
        check(snapshot.getAsJsonArray("functions").size() == 1, "complete graph");
        check(snapshot.getAsJsonArray("findings").size() == 1, "proposal exists");
        String id = snapshot.getAsJsonArray("findings").get(0).getAsJsonObject().get("id").getAsString();
        engine.apply(id);
        check("allocate_buffer".equals(bridge.names.get("1000")), "apply changes bridge");
        check("applied".equals(engine.snapshot().getAsJsonArray("findings").get(0).getAsJsonObject().get("status").getAsString()), "applied status");
        engine.undo(id);
        check("FUN_1000".equals(bridge.names.get("1000")), "undo restores exact previous name");
        engine.save();
        check(bridge.saved && bridge.state.contains("\"undone\""), "state saved");
        check(!bridge.state.contains("private-key"), "key never persisted");
        engine.close();
        AnalysisEngine reopened = new AnalysisEngine(bridge, null, new FakeClient());
        check(reopened.snapshot().getAsJsonArray("findings").size() == 1, "findings restored");
        check(reopened.snapshot().getAsJsonObject("usage").get("requests").getAsInt() == 1, "usage restored");
        reopened.close();
    }

    private static void cacheAndStaleEvidence() throws Exception {
        FakeBridge bridge = new FakeBridge(1);
        FakeClient client = new FakeClient();
        AnalysisEngine engine = new AnalysisEngine(bridge, "key", client);
        engine.analyze("balanced", "fixed");
        await(engine, "complete");
        engine.analyze("balanced", "fixed");
        await(engine, "complete");
        check(client.calls.get() == 1, "same evidence and question hit cache");
        check(engine.snapshot().getAsJsonArray("findings").size() == 1, "cache does not duplicate proposals");
        String staleId = engine.snapshot().getAsJsonArray("findings").get(0).getAsJsonObject().get("id").getAsString();
        bridge.source = "changed decompiled evidence";
        try {
            engine.apply(staleId);
            throw new AssertionError("stale evidence must prevent applying proposal");
        } catch (IllegalStateException expected) {
            check(expected.getMessage().contains("evidence changed"), "stale evidence error");
        }
        check("FUN_1000".equals(bridge.names.get("1000")), "stale proposal did not change label");
        engine.analyze("balanced", "fixed");
        await(engine, "complete");
        check(client.calls.get() == 2, "changed evidence causes new request");
        JsonArray findings = engine.snapshot().getAsJsonArray("findings");
        check("rejected".equals(findings.get(0).getAsJsonObject().get("status").getAsString()), "stale proposal rejected");
        engine.close();
    }

    private static void pauseAtTaskBoundary() throws Exception {
        FakeBridge bridge = new FakeBridge(7);
        FakeClient client = new FakeClient();
        client.entered = new CountDownLatch(1);
        client.release = new CountDownLatch(1);
        AnalysisEngine engine = new AnalysisEngine(bridge, "key", client);
        engine.analyze("balanced", "fixed");
        check(client.entered.await(5, TimeUnit.SECONDS), "first request began");
        engine.pause();
        check("paused".equals(engine.snapshot().getAsJsonObject("analysis").get("status").getAsString()), "pause visible");
        client.release.countDown();
        Thread.sleep(250);
        check(client.calls.get() == 1, "second batch waits for resume");
        engine.resume();
        await(engine, "complete");
        check(client.calls.get() == 2, "remaining task runs after resume");
        engine.close();
    }

    private static void importSnapshotResponsive() throws Exception {
        FakeBridge bridge = new FakeBridge(1);
        bridge.importEntered = new CountDownLatch(1);
        bridge.importRelease = new CountDownLatch(1);
        AnalysisEngine engine = new AnalysisEngine(bridge, "key", new FakeClient());
        engine.open(Path.of("test.bin"));
        check(bridge.importEntered.await(5, TimeUnit.SECONDS), "import began");
        long before = System.nanoTime();
        JsonObject snapshot = engine.snapshot();
        long elapsedMillis = TimeUnit.NANOSECONDS.toMillis(System.nanoTime() - before);
        check(elapsedMillis < 500, "snapshot responds while Ghidra import holds bridge lock");
        check("importing".equals(snapshot.getAsJsonObject("analysis").get("status").getAsString()), "import progress visible");
        try {
            engine.analyze("fast", "fixed");
            throw new AssertionError("overlapping work should be rejected");
        } catch (IllegalStateException expected) {
            check(expected.getMessage().contains("already running"), "clear busy error");
        }
        engine.pause();
        check(engine.snapshot().getAsJsonObject("analysis").get("message").getAsString().contains("Will pause after static analysis"), "import pause limitation visible");
        bridge.importRelease.countDown();
        await(engine, "paused");
        engine.resume();
        await(engine, "complete");
        check(engine.snapshot().getAsJsonArray("functions").size() == 1, "complete graph published after import");
        engine.close();
    }

    private static void fastProgressAndRequestBudget() throws Exception {
        FakeBridge bridge = new FakeBridge(45);
        bridge.source = "x".repeat(10_000);
        FakeClient client = new FakeClient();
        AnalysisEngine engine = new AnalysisEngine(bridge, "key", client);
        engine.analyze("fast", "fixed");
        await(engine, "complete");
        JsonObject progress = engine.snapshot().getAsJsonObject("analysis");
        check(progress.get("completed").getAsInt() == 40, "fast pass analyzes 40");
        check(progress.get("total").getAsInt() == 45, "fast pass retains actual total");
        check(progress.get("message").getAsString().contains("40 of 45"), "partial completion disclosed");
        check(client.maxRequestBytes.get() <= 24_000, "batched request stays inside conservative context budget");
        engine.close();

        FakeBridge exhaustiveBridge = new FakeBridge(5);
        exhaustiveBridge.source = "x".repeat(10_000);
        FakeClient exhaustiveClient = new FakeClient();
        AnalysisEngine exhaustive = new AnalysisEngine(exhaustiveBridge, "key", exhaustiveClient);
        exhaustive.analyze("exhaustive", "fixed");
        await(exhaustive, "complete");
        check(exhaustiveClient.maxRequestBytes.get() <= 24_000, "exhaustive request stays inside context budget");
        check(exhaustiveClient.calls.get() > 1, "large evidence splits into multiple batches");
        exhaustive.close();
    }

    private static void importDoesNotFinishBeforeSemanticAnalysis() throws Exception {
        FakeBridge bridge = new FakeBridge(1);
        FakeClient client = new FakeClient();
        client.entered = new CountDownLatch(1);
        client.release = new CountDownLatch(1);
        AnalysisEngine engine = new AnalysisEngine(bridge, "key", client);
        engine.open(Path.of("test.bin"));
        check(client.entered.await(5, TimeUnit.SECONDS), "automatic semantic request began");
        check("analyzing".equals(engine.snapshot().getAsJsonObject("analysis").get("status").getAsString()),
            "import does not report complete before semantic work finishes");
        client.release.countDown();
        await(engine, "complete");
        engine.close();
    }

    private static void sourceOnlyFunctionGetsConcreteNameChoices() throws Exception {
        FakeBridge bridge = new FakeBridge(1);
        bridge.calledNames = java.util.List.of();
        bridge.source = "unsigned long parse(char *p) { unsigned long n = 0; while (*p >= '0' && *p <= '9') { n = n * 10 + *p - '0'; p++; } return n; }";
        FakeClient client = new FakeClient();
        AnalysisEngine engine = new AnalysisEngine(bridge, "key", client);
        engine.analyze("balanced", "fixed");
        await(engine, "complete");
        JsonObject questions = client.lastRequest.getAsJsonObject("questions");
        check(questions.has("f0_name"), "source-only function receives a name question");
        JsonObject criteria = questions.getAsJsonObject("f0_name").getAsJsonObject("criteria");
        check(criteria.has("parse_unsigned_decimal") && criteria.has("unknown"), "pure-code candidate and unknown offered");
        check(!criteria.get("parse_unsigned_decimal").getAsString().isBlank(), "candidate has specific criterion");
        engine.close();
    }

    private static void serviceFailuresAreClearAndKeyFree() throws Exception {
        Exception[] failures = {
            new TypeSafeClient.HttpFailure(401, "bad key private-key"),
            new TypeSafeClient.HttpFailure(500, "private-key"),
            new TypeSafeClient.HttpFailure(400, "unsupported request for private-key"),
            new java.net.http.HttpTimeoutException("request timed out"),
        };
        String[] expected = {"API key", "service error", "unsupported request", "did not answer"};
        for (int i = 0; i < failures.length; i++) {
            Exception failure = failures[i];
            TypeSafeClient failing = new TypeSafeClient() {
                @Override public JsonObject evaluate(JsonObject request, String key) throws Exception { throw failure; }
            };
            AnalysisEngine engine = new AnalysisEngine(new FakeBridge(1), "private-key", failing);
            engine.analyze("balanced", "fixed");
            String error = "";
            for (int wait = 0; wait < 300 && error.isEmpty(); wait++) {
                error = engine.snapshot().getAsJsonObject("analysis").get("error").getAsString();
                Thread.sleep(20);
            }
            check(error.contains(expected[i]), "readable failure: " + error);
            check(!error.contains("private-key"), "service failure never exposes the key");
            engine.close();
        }
    }

    private static void renameInvalidatesCachedResults() throws Exception {
        FakeBridge bridge = new FakeBridge(1);
        FakeClient client = new FakeClient();
        AnalysisEngine engine = new AnalysisEngine(bridge, "key", client);
        engine.analyze("balanced", "fixed");
        await(engine, "complete");
        engine.rename("1000", "my_function");
        check("rejected".equals(engine.snapshot().getAsJsonArray("findings").get(0).getAsJsonObject().get("status").getAsString()),
            "rename retires the proposal for that function");
        engine.analyze("balanced", "fixed");
        await(engine, "complete");
        check(client.calls.get() == 2, "rename forces fresh model evidence instead of the cache");
        check("my_function".equals(bridge.names.get("1000")), "user name is never overwritten");
        engine.close();
    }

    private static void invalidRenameDoesNotAffectNextRename() throws Exception {
        FakeBridge bridge = new FakeBridge(1);
        AnalysisEngine engine = new AnalysisEngine(bridge, null, new FakeClient());
        engine.rename("1000", "aa_two");
        for (String invalid : new String[] {"bad name", "1abc", "bad\tname", ""}) {
            try {
                engine.rename("1000", invalid);
                throw new AssertionError("Invalid rename accepted: " + invalid);
            } catch (IllegalArgumentException expected) {
                check("aa_two".equals(bridge.names.get("1000")), "invalid name leaves program unchanged");
            }
        }
        engine.rename("1000", "aa_three");
        check("aa_three".equals(bridge.names.get("1000")), "valid rename after rejection succeeds");
        check("aa_three".equals(engine.snapshot().getAsJsonArray("functions").get(0)
            .getAsJsonObject().get("name").getAsString()), "graph reflects valid rename after rejection");
        engine.close();
    }

    private static void resumeRestoresAnalyzingStatus() throws Exception {
        FakeBridge bridge = new FakeBridge(7);
        FakeClient client = new FakeClient();
        client.entered = new CountDownLatch(1);
        client.release = new CountDownLatch(1);
        AnalysisEngine engine = new AnalysisEngine(bridge, "key", client);
        engine.open(Path.of("test.bin"));
        check(client.entered.await(5, TimeUnit.SECONDS), "semantic request began after import");
        engine.pause();
        engine.resume();
        check("analyzing".equals(engine.snapshot().getAsJsonObject("analysis").get("status").getAsString()),
            "resume returns to analyzing, not queued");
        client.release.countDown();
        await(engine, "complete");
        engine.close();
    }

    private static void unreadableSavedStateIsIgnored() throws Exception {
        FakeBridge bridge = new FakeBridge(1);
        bridge.state = "{not json";
        AnalysisEngine engine = new AnalysisEngine(bridge, null, new FakeClient());
        check(engine.snapshot().getAsJsonArray("functions").size() == 1, "project opens despite unreadable saved state");
        check(engine.snapshot().getAsJsonArray("findings").isEmpty(), "no findings restored from unreadable state");
        engine.close();
    }

    private static void await(AnalysisEngine engine, String target) throws Exception {
        long deadline = System.nanoTime() + TimeUnit.SECONDS.toNanos(8);
        while (System.nanoTime() < deadline) {
            JsonObject progress = engine.snapshot().getAsJsonObject("analysis");
            String status = progress.get("status").getAsString();
            if (target.equals(status)) return;
            if ("error".equals(status)) throw new AssertionError(progress.get("error").getAsString());
            Thread.sleep(20);
        }
        throw new AssertionError("Timed out waiting for " + target);
    }

    private static void check(boolean condition, String message) {
        if (!condition) throw new AssertionError(message);
    }

    private static final class FakeClient extends TypeSafeClient {
        final AtomicInteger calls = new AtomicInteger();
        final AtomicInteger maxRequestBytes = new AtomicInteger();
        volatile JsonObject lastRequest;
        CountDownLatch entered;
        CountDownLatch release;
        @Override public JsonObject evaluate(JsonObject request, String key) throws Exception {
            calls.incrementAndGet();
            lastRequest = request.deepCopy();
            maxRequestBytes.accumulateAndGet(request.toString().getBytes(java.nio.charset.StandardCharsets.UTF_8).length, Math::max);
            if (entered != null) entered.countDown();
            if (release != null && !release.await(5, TimeUnit.SECONDS)) throw new AssertionError("release timed out");
            JsonObject response = new JsonObject();
            response.addProperty("model", MODEL);
            JsonObject answers = new JsonObject();
            for (Map.Entry<String, JsonElement> question : request.getAsJsonObject("questions").entrySet()) {
                JsonObject answer = new JsonObject();
                answer.addProperty("type", "choice");
                answer.addProperty("choice", question.getKey().endsWith("_role") ? "memory" : "allocate_buffer");
                answer.addProperty("confidence", 0.9);
                answers.add(question.getKey(), answer);
            }
            response.add("answers", answers);
            JsonObject usage = new JsonObject();
            usage.addProperty("input_tokens", 100);
            usage.addProperty("output_tokens", 20);
            response.add("usage", usage);
            return response;
        }
    }
}
