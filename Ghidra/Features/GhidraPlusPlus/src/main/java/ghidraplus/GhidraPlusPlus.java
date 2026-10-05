package ghidraplus;

import com.google.gson.*;
import ghidra.GhidraApplicationLayout;
import ghidra.GhidraLaunchable;
import ghidra.framework.*;
import ghidraplus.bridge.GhidraProgramBridge;
import ghidraplus.core.AnalysisEngine;
import ghidraplus.server.InvestigationServer;
import java.awt.Desktop;
import java.net.URI;
import java.nio.file.*;
import java.util.concurrent.CountDownLatch;

/** Starts the same analysis engine for the browser workspace or a batch export. */
public final class GhidraPlusPlus implements GhidraLaunchable {
    @Override public void launch(GhidraApplicationLayout layout, String[] args) throws Exception {
        Path workspace = Path.of(System.getProperty("user.home"), "Documents", "Ghidra++ Projects");
        Path binary = null;
        Path output = null;
        Path assets = null;
        String project = "Investigation";
        boolean headless = false;
        boolean browser = true;
        int port = 0;
        for (int i = 0; i < args.length; i++) {
            switch (args[i]) {
                case "--workspace" -> workspace = Path.of(argument(args, ++i));
                case "--project" -> project = argument(args, ++i);
                case "--open" -> binary = Path.of(argument(args, ++i));
                case "--output" -> { output = Path.of(argument(args, ++i)); headless = true; browser = false; }
                case "--assets" -> assets = Path.of(argument(args, ++i));
                case "--port" -> port = Integer.parseInt(argument(args, ++i));
                case "--headless" -> headless = true;
                case "--no-browser" -> browser = false;
                case "--help", "-h" -> { help(); return; }
                default -> throw new IllegalArgumentException("Unknown option: " + args[i]);
            }
        }
        if (!project.matches("[A-Za-z0-9][A-Za-z0-9._ -]{0,79}")) throw new IllegalArgumentException("Choose a project name using letters, digits, spaces, dots, underscores or hyphens.");
        if (output != null && binary == null) throw new IllegalArgumentException("Batch exports need --open followed by a compiled program.");
        Files.createDirectories(workspace);
        if (headless) {
            System.setProperty("java.awt.headless", "true");
            Application.initializeApplication(layout, new HeadlessGhidraApplicationConfiguration());
        } else {
            GhidraApplicationConfiguration configuration = new GhidraApplicationConfiguration();
            configuration.setShowSplashScreen(false);
            Application.initializeApplication(layout, configuration);
        }
        AnalysisEngine engine = new AnalysisEngine(new GhidraProgramBridge(workspace, project), System.getenv("TYPESAFE_API_KEY"));
        if (output != null) { batch(engine, binary, output); return; }
        InvestigationServer server = new InvestigationServer(engine, port, assets);
        Runtime.getRuntime().addShutdownHook(new Thread(() -> {
            server.close();
            try { engine.save(); engine.close(); } catch (Exception ignored) { }
        }, "ghidraplus-shutdown"));
        server.start();
        System.setProperty("ghidraplus.workspace.url", server.url());
        System.out.println("Ghidra++ workspace: " + server.url());
        if (binary != null) engine.open(binary.toAbsolutePath());
        if (browser && Desktop.isDesktopSupported()) Desktop.getDesktop().browse(URI.create(server.url()));
        new CountDownLatch(1).await();
    }

    private static void batch(AnalysisEngine engine, Path binary, Path output) throws Exception {
        try (engine) {
            engine.open(binary.toAbsolutePath());
            long deadline = System.nanoTime() + java.util.concurrent.TimeUnit.HOURS.toNanos(6);
            while (System.nanoTime() < deadline) {
                JsonObject snapshot = engine.snapshot();
                JsonObject analysis = snapshot.getAsJsonObject("analysis");
                String status = analysis.get("status").getAsString();
                if (status.equals("error")) throw new IllegalStateException(analysis.get("error").getAsString());
                if (status.equals("complete")) {
                    Files.createDirectories(output);
                    engine.save();
                    Files.writeString(output.resolve("analysis.json"), new GsonBuilder().setPrettyPrinting().create().toJson(snapshot));
                    Files.writeString(output.resolve("reconstructed.c"), engine.exportSource());
                    System.out.println("Analysis saved to " + output.toAbsolutePath());
                    return;
                }
                Thread.sleep(250);
            }
            throw new IllegalStateException("Analysis exceeded six hours.");
        }
    }

    private static String argument(String[] args, int index) {
        if (index >= args.length) throw new IllegalArgumentException("Missing option value");
        return args[index];
    }
    private static void help() {
        System.out.println("Ghidra++\n  --open PROGRAM       Import or reopen a compiled program\n  --workspace DIR      Directory for persistent Ghidra projects\n  --project NAME       Project name (default: Investigation)\n  --output DIR         Analyze, save JSON and C, then exit\n  --port NUMBER        Local HTTP port (default: choose a free port)\n  --headless           Disable classic desktop tools\n  --no-browser         Print the workspace link without opening it\nSet TYPESAFE_API_KEY to enable semantic analysis. Without a key, static analysis still works.");
    }
}
