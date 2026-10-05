package ghidraplus.plugin;

import java.awt.Desktop;
import java.net.URI;

import docking.ActionContext;
import docking.action.DockingAction;
import docking.action.MenuData;
import docking.tool.ToolConstants;
import ghidra.app.CorePluginPackage;
import ghidra.app.plugin.PluginCategoryNames;
import ghidra.app.plugin.ProgramPlugin;
import ghidra.framework.plugintool.PluginInfo;
import ghidra.framework.plugintool.PluginTool;
import ghidra.framework.plugintool.util.PluginStatus;
import ghidra.program.model.listing.Program;
import ghidra.util.Msg;
import ghidraplus.bridge.GhidraProgramBridge;
import ghidraplus.core.AnalysisEngine;
import ghidraplus.server.InvestigationServer;

/** Opens the investigation workspace for the current classic Ghidra program. */
@PluginInfo(
    status = PluginStatus.RELEASED,
    packageName = CorePluginPackage.NAME,
    category = PluginCategoryNames.COMMON,
    shortDescription = "Ghidra++ Investigation",
    description = "Opens the Ghidra++ investigation workspace for the active program"
)
public final class GhidraPlusPlusPlugin extends ProgramPlugin {
    private InvestigationServer server;
    private AnalysisEngine engine;
    private Program servedProgram;

    public GhidraPlusPlusPlugin(PluginTool tool) {
        super(tool);
        DockingAction action = new DockingAction("Open Investigation", getName()) {
            @Override
            public void actionPerformed(ActionContext context) {
                openInvestigation();
            }

            @Override
            public boolean isEnabledForContext(ActionContext context) {
                return currentProgram != null;
            }
        };
        action.setMenuBarData(new MenuData(
                new String[] { ToolConstants.MENU_TOOLS, "Ghidra++", "Open Investigation" }));
        action.setDescription("Investigate this program in Ghidra++");
        tool.addAction(action);
    }

    private synchronized void openInvestigation() {
        Program selected = currentProgram;
        if (selected == null) {
            tool.setStatusInfo("Open a program before starting Ghidra++");
            return;
        }
        try {
            String workspace = System.getProperty("ghidraplus.workspace.url");
            if (workspace != null && selected == GhidraProgramBridge.standaloneProgram()) {
                // Opened from the Ghidra++ launcher: its workspace already serves this program.
                browse(workspace);
                return;
            }
            if (server == null || servedProgram != selected) {
                closeInvestigation();
                engine = new AnalysisEngine(new GhidraProgramBridge(selected, tool),
                        System.getenv("TYPESAFE_API_KEY"));
                server = new InvestigationServer(engine, 0, null);
                server.start();
                servedProgram = selected;
            }
            browse(server.url());
        }
        catch (Exception e) {
            Msg.showError(this, tool.getToolFrame(), "Ghidra++", "Could not open investigation", e);
            closeInvestigation();
        }
    }

    private static void browse(String url) throws Exception {
        if (!Desktop.isDesktopSupported() || !Desktop.getDesktop().isSupported(Desktop.Action.BROWSE)) {
            throw new IllegalStateException("Desktop browser is unavailable");
        }
        Desktop.getDesktop().browse(URI.create(url));
    }

    @Override
    protected synchronized void programActivated(Program program) {
        if (servedProgram != null && servedProgram != program) {
            closeInvestigation();
        }
    }

    @Override
    protected synchronized void programClosed(Program program) {
        if (servedProgram == program) {
            closeInvestigation();
        }
    }

    private synchronized void closeInvestigation() {
        if (server != null) {
            server.close();
            server = null;
        }
        if (engine != null) {
            try {
                engine.close();
            }
            catch (Exception e) {
                Msg.error(this, "Failed to close Ghidra++ engine", e);
            }
            engine = null;
        }
        servedProgram = null;
    }

    @Override
    protected void dispose() {
        closeInvestigation();
        super.dispose();
    }
}
