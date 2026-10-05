// Starts a Ghidra++ investigation server for the script's current program.
// Run in the Ghidra Script Manager or with analyzeHeadless -postScript.
// The server lives until the script task is cancelled.
// @category Ghidra++

import ghidra.app.script.GhidraScript;
import ghidraplus.bridge.GhidraProgramBridge;
import ghidraplus.core.AnalysisEngine;
import ghidraplus.server.InvestigationServer;

public class GhidraPlusPlusServerScript extends GhidraScript {
    @Override
    protected void run() throws Exception {
        if (currentProgram == null) {
            printerr("Ghidra++ requires an open program");
            return;
        }
        AnalysisEngine engine = new AnalysisEngine(
                new GhidraProgramBridge(currentProgram, state.getTool()),
                System.getenv("TYPESAFE_API_KEY"));
        InvestigationServer server = new InvestigationServer(engine, 0, null);
        try {
            server.start();
            println("Ghidra++ investigation: " + server.url());
            println("Cancel this script task to stop the server.");
            while (!monitor.isCancelled()) {
                Thread.sleep(1000);
            }
        }
        finally {
            server.close();
            engine.close();
        }
    }
}
