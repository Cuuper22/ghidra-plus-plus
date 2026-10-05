package ghidraplus.bridge;

import java.io.IOException;
import java.io.InputStream;
import java.awt.GraphicsEnvironment;
import java.nio.file.Files;
import java.nio.file.Path;
import java.security.MessageDigest;
import java.util.HexFormat;
import java.util.Arrays;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Objects;
import java.util.Set;
import java.util.function.Consumer;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicReference;

import com.google.gson.JsonArray;
import com.google.gson.JsonNull;
import com.google.gson.JsonObject;

import ghidra.app.decompiler.DecompInterface;
import ghidra.app.decompiler.DecompileResults;
import ghidra.app.script.GhidraScriptUtil;
import docking.ComponentProvider;
import ghidra.app.services.GoToService;
import ghidra.app.services.ProgramManager;
import ghidra.app.util.importer.ProgramLoader;
import ghidra.app.util.opinion.LoadResults;
import ghidra.base.project.GhidraProject;
import ghidra.framework.model.DomainFile;
import ghidra.framework.model.ProjectLocator;
import ghidra.framework.model.ProjectManager;
import ghidra.framework.main.FrontEndTool;
import ghidra.framework.model.ToolTemplate;
import ghidra.framework.model.ToolManager;
import ghidra.framework.model.Workspace;
import ghidra.framework.options.Options;
import ghidra.framework.plugintool.PluginTool;
import ghidra.framework.ToolUtils;
import ghidra.program.model.address.Address;
import ghidra.program.model.data.DataType;
import ghidra.program.model.listing.Data;
import ghidra.program.model.listing.Function;
import ghidra.program.model.listing.FunctionIterator;
import ghidra.program.model.listing.Instruction;
import ghidra.program.model.listing.InstructionIterator;
import ghidra.program.model.listing.Program;
import ghidra.program.model.symbol.Reference;
import ghidra.program.util.GhidraProgramUtilities;
import ghidra.program.model.symbol.SourceType;
import ghidra.util.data.DataTypeParser;
import ghidra.util.Swing;
import ghidra.util.Msg;
import ghidra.util.task.TaskMonitor;
import ghidraplus.plugin.GhidraPlusPlusPlugin;

/** Real Ghidra program access shared by the standalone server and classic tool. */
public final class GhidraProgramBridge implements ProgramBridge {
    private static final String OPTIONS = "Ghidra++";
    private static final String STATE = "investigationState";
    private static final int MAX_SOURCE_CHARS = 24_000;
    private static final int MAX_ASSEMBLY_INSTRUCTIONS = 120;
    private static final int MAX_STRINGS = 120;

    private static volatile Program standaloneProgram;

    private final Path projectDirectory;
    private final String projectName;
    private final PluginTool tool;
    private final boolean attached;
    private GhidraProject project;
    private Program program;
    private DecompInterface decompiler;
    private Program decompilerProgram;
    private long decompilerModification;
    private PluginTool classicTool;
    // Classic tools need Ghidra's OSGi bundle host, which only the front end starts on its own.
    private boolean bundleHostHeld;
    private FrontEndTool frontEnd;

    /** A front end whose disposal must not exit the whole Ghidra++ process. */
    private static final class HiddenFrontEnd extends FrontEndTool {
        HiddenFrontEnd(ProjectManager manager) {
            super(manager);
        }

        @Override
        protected void shutdown() {
        }
    }

    /** Application initialization is the caller's responsibility. This constructor is persistent. */
    public GhidraProgramBridge(Path projectDirectory, String projectName) {
        this.projectDirectory = Objects.requireNonNull(projectDirectory).toAbsolutePath().normalize();
        this.projectName = Objects.requireNonNull(projectName);
        this.tool = null;
        this.attached = false;
    }

    /** Attaches to the exact Program object open in a classic Ghidra tool. */
    public GhidraProgramBridge(Program program, PluginTool tool) {
        this.projectDirectory = null;
        this.projectName = null;
        this.program = Objects.requireNonNull(program);
        // A headless GhidraScript has a current Program but no PluginTool.
        this.tool = tool;
        this.attached = true;
    }

    private GhidraProject project() throws Exception {
        if (project != null) {
            return project;
        }
        Files.createDirectories(projectDirectory);
        ProjectLocator locator = new ProjectLocator(projectDirectory.toString(), projectName);
        boolean marker = locator.getMarkerFile().exists();
        boolean repository = locator.getProjectDir().exists();
        if (marker && repository) {
            project = GhidraProject.openProject(projectDirectory.toString(), projectName);
        }
        else if (!marker && !repository) {
            // GhidraProject.createProject deletes a matching existing project. Never call it
            // while either half of a project exists, including a damaged or partial project.
            project = GhidraProject.createProject(projectDirectory.toString(), projectName, false);
        }
        else {
            throw new IOException("Incomplete Ghidra project; refusing to replace it: " + locator);
        }
        return project;
    }

    /** The program the standalone workspace has open, so the classic plugin can reuse its page. */
    public static Program standaloneProgram() {
        return standaloneProgram;
    }

    private Program requireProgram() {
        if (program == null) {
            throw new IllegalStateException("No program is open");
        }
        return program;
    }

    private Function function(String address) {
        Program p = requireProgram();
        Address a = p.getAddressFactory().getAddress(address);
        if (a == null) {
            throw new IllegalArgumentException("Invalid address: " + address);
        }
        Function f = p.getFunctionManager().getFunctionAt(a);
        if (f == null) {
            throw new IllegalArgumentException("No function starts at " + address);
        }
        return f;
    }

    /** Ghidra stores Windows import paths as "/C:/dir/file"; show the path the OS uses. */
    private static String osPath(String path) {
        if (path != null && path.matches("/[A-Za-z]:[/\\\\].*")) {
            return Path.of(path.substring(1)).toString();
        }
        return path;
    }

    private static JsonObject functionSummary(Function f) {
        JsonObject o = new JsonObject();
        o.addProperty("address", f.getEntryPoint().toString());
        o.addProperty("name", f.getName());
        o.addProperty("signature", f.getPrototypeString(false, false));
        o.addProperty("size", f.getBody().getNumAddresses());
        o.addProperty("external", f.isExternal());
        o.addProperty("returnType", f.getReturnType().getDisplayName());
        o.addProperty("parameterCount", f.getParameterCount());
        return o;
    }

    @Override
    public synchronized long revision() {
        return program == null ? 0 : program.getModificationNumber();
    }

    @Override
    public synchronized JsonObject snapshot() {
        JsonObject result = new JsonObject();
        JsonArray functions = new JsonArray();
        JsonArray edges = new JsonArray();
        JsonArray types = new JsonArray();
        result.add("functions", functions);
        result.add("edges", edges);
        result.add("types", types);
        if (program == null) {
            result.add("program", JsonNull.INSTANCE);
            return result;
        }
        Program p = program;
        JsonObject meta = new JsonObject();
        meta.addProperty("name", p.getName());
        meta.addProperty("format", p.getExecutableFormat());
        meta.addProperty("language", p.getLanguageID().toString());
        meta.addProperty("compiler", p.getCompilerSpec().getCompilerSpecID().toString());
        meta.addProperty("imageBase", p.getImageBase().toString());
        meta.addProperty("sha256", p.getExecutableSHA256());
        meta.addProperty("path", osPath(p.getExecutablePath()));
        DomainFile file = p.getDomainFile();
        meta.addProperty("projectPath", file == null ? null : file.getPathname());
        result.add("program", meta);

        FunctionIterator iterator = p.getFunctionManager().getFunctions(true);
        while (iterator.hasNext()) {
            addFunction(iterator.next(), functions, edges);
        }
        // getFunctions() explicitly excludes external functions in Ghidra's API.
        FunctionIterator external = p.getFunctionManager().getExternalFunctions();
        while (external.hasNext()) {
            addFunction(external.next(), functions, edges);
        }
        // DataTypeManager includes built-in types and all program-defined types.
        var dataTypes = p.getDataTypeManager().getAllDataTypes();
        while (dataTypes.hasNext()) {
            DataType dt = dataTypes.next();
            JsonObject type = new JsonObject();
            type.addProperty("name", dt.getPathName());
            type.addProperty("length", dt.getLength());
            type.addProperty("kind", dt.getClass().getSimpleName());
            types.add(type);
        }
        return result;
    }

    private static void addFunction(Function f, JsonArray functions, JsonArray edges) {
            functions.add(functionSummary(f));
            for (Function callee : f.getCalledFunctions(TaskMonitor.DUMMY)) {
                JsonObject edge = new JsonObject();
                edge.addProperty("from", f.getEntryPoint().toString());
                edge.addProperty("to", callee.getEntryPoint().toString());
                edges.add(edge);
            }
    }

    private DecompInterface decompiler() {
        Program p = requireProgram();
        if (decompiler == null || decompilerProgram != p ||
                decompilerModification != p.getModificationNumber()) {
            if (decompiler != null) {
                decompiler.dispose();
            }
            decompiler = new DecompInterface();
            decompiler.toggleCCode(true);
            if (!decompiler.openProgram(p)) {
                String error = decompiler.getLastMessage();
                decompiler.dispose();
                decompiler = null;
                throw new IllegalStateException("Decompiler could not open program: " + error);
            }
            decompilerProgram = p;
            decompilerModification = p.getModificationNumber();
        }
        return decompiler;
    }

    private String decompile(Function f) {
        if (f.isExternal()) {
            return "/* External function; no local body. */";
        }
        DecompileResults result = decompiler().decompileFunction(f, 60, TaskMonitor.DUMMY);
        if (!result.decompileCompleted() || result.getDecompiledFunction() == null) {
            return "/* Decompilation unavailable: " + result.getErrorMessage() + " */";
        }
        return result.getDecompiledFunction().getC().replace("\r\n", "\n").replace('\r', '\n');
    }

    private static String excerpt(String source, int max) {
        if (source.length() <= max) {
            return source;
        }
        return source.substring(0, max) + "\n/* Ghidra++ excerpt truncated; full source available in export. */";
    }

    @Override
    public synchronized JsonObject evidence(String address) {
        Program p = requireProgram();
        Function f = function(address);
        JsonObject result = functionSummary(f);
        result.addProperty("source", excerpt(decompile(f), MAX_SOURCE_CHARS));
        StringBuilder assembly = new StringBuilder();
        int count = 0;
        InstructionIterator instructions = p.getListing().getInstructions(f.getBody(), true);
        while (instructions.hasNext() && count < MAX_ASSEMBLY_INSTRUCTIONS) {
            Instruction instruction = instructions.next();
            assembly.append(instruction.getAddress()).append("  ").append(instruction).append('\n');
            count++;
        }
        if (instructions.hasNext()) {
            assembly.append("; Ghidra++ assembly excerpt truncated after ")
                    .append(MAX_ASSEMBLY_INSTRUCTIONS).append(" instructions\n");
        }
        result.addProperty("instructions", assembly.toString());

        Set<String> stringValues = new LinkedHashSet<>();
        InstructionIterator allInstructions = p.getListing().getInstructions(f.getBody(), true);
        while (allInstructions.hasNext()) {
            Instruction instruction = allInstructions.next();
            for (Reference ref : p.getReferenceManager().getReferencesFrom(instruction.getAddress())) {
                Data data = p.getListing().getDataContaining(ref.getToAddress());
                if (data != null && data.hasStringValue()) {
                    Object value = data.getValue();
                    if (value != null) {
                        stringValues.add(ref.getToAddress() + ": " + value);
                    }
                }
            }
        }
        JsonArray strings = new JsonArray();
        int stringCount = 0;
        for (String value : stringValues) {
            if (stringCount++ >= MAX_STRINGS) {
                break;
            }
            strings.add(value);
        }
        if (stringValues.size() > MAX_STRINGS) {
            strings.add("[Ghidra++ strings excerpt truncated; " + stringValues.size() + " total references]");
        }
        result.add("strings", strings);

        JsonArray calledNames = new JsonArray();
        JsonArray callers = new JsonArray();
        JsonArray callees = new JsonArray();
        for (Function caller : f.getCallingFunctions(TaskMonitor.DUMMY)) {
            callers.add(caller.getEntryPoint().toString());
        }
        for (Function callee : f.getCalledFunctions(TaskMonitor.DUMMY)) {
            callees.add(callee.getEntryPoint().toString());
            calledNames.add(callee.getName());
        }
        result.add("calledNames", calledNames);
        result.add("callers", callers);
        result.add("callees", callees);
        return result;
    }

    @Override
    public synchronized void open(Path binary, Consumer<String> progress) throws Exception {
        if (attached) {
            throw new UnsupportedOperationException("Import into the classic tool with Ghidra's File > Import File");
        }
        Path path = Objects.requireNonNull(binary).toAbsolutePath().normalize();
        if (!Files.isRegularFile(path)) {
            throw new IOException("Binary does not exist: " + path);
        }
        MessageDigest hash = MessageDigest.getInstance("SHA-256");
        try (InputStream input = Files.newInputStream(path)) {
            byte[] bytes = new byte[1024 * 1024];
            int read;
            while ((read = input.read(bytes)) >= 0) {
                hash.update(bytes, 0, read);
            }
        }
        String digest = HexFormat.of().formatHex(hash.digest());
        // HTTP imports may arrive through a fresh temporary filename each time.
        // The content hash keeps the project identity stable across those paths.
        String storedName = "program-" + digest;
        GhidraProject gp = project();
        if (program != null) {
            invalidateDecompiler();
            program.release(this);
            program = null;
            standaloneProgram = null;
        }
        DomainFile existing = gp.getRootFolder().getFile(storedName);
        if (existing != null) {
            progress.accept("Opening analyzed program from project");
            // GhidraProject.openProgram would keep a transaction open for the program's whole
            // life, which makes CodeBrowser report the program as busy and blocks undo and close.
            program = (Program) existing.getDomainObject(this, true, false, TaskMonitor.DUMMY);
            if (!GhidraProgramUtilities.isAnalyzed(program)) {
                // Projects written before the flag was set were analyzed during import.
                int transaction = program.startTransaction("Mark analyzed");
                GhidraProgramUtilities.markProgramAnalyzed(program);
                program.endTransaction(transaction, true);
                existing.save(TaskMonitor.DUMMY);
            }
            standaloneProgram = program;
            return;
        }
        progress.accept("Importing binary with Ghidra");
        Program imported;
        try (LoadResults<Program> loaded = ProgramLoader.builder()
                .source(path.toFile())
                .project(gp.getProject())
                .monitor(TaskMonitor.DUMMY)
                .load()) {
            // Closing the LoadResults releases only the loader's own reference.
            imported = loaded.getPrimaryDomainObject(this);
        }
        int analysisTransaction = imported.startTransaction("Ghidra++ import and analysis");
        boolean analysisTransactionOpen = true;
        try {
            progress.accept("Running Ghidra static analysis");
            // Some built-in analyzers resolve bundled scripts during analysis.
            // HeadlessAnalyzer acquires this host before analyzing for the same reason.
            GhidraScriptUtil.acquireBundleHostReference();
            try {
                GhidraProject.analyze(imported);
            }
            finally {
                GhidraScriptUtil.releaseBundleHostReference();
            }
            // Without this flag CodeBrowser asks to analyze the program again.
            GhidraProgramUtilities.markProgramAnalyzed(imported);
            imported.endTransaction(analysisTransaction, true);
            analysisTransactionOpen = false;
            progress.accept("Saving analyzed program");
            gp.getRootFolder().createFile(storedName, imported, TaskMonitor.DUMMY);
            program = imported;
            standaloneProgram = program;
        }
        catch (Exception e) {
            if (analysisTransactionOpen) {
                imported.endTransaction(analysisTransaction, false);
            }
            imported.release(this);
            throw e;
        }
    }

    @Override
    public synchronized String change(String address, String field, String value) throws Exception {
        // Reject user input before opening a transaction: an aborted transaction invalidates
        // Ghidra's cached database objects, including the Function being edited.
        if ("name".equals(field)) {
            if (value == null || value.isBlank()) {
                throw new IllegalArgumentException("Function name cannot be empty");
            }
            if (value.matches(".*\\s.*") || Character.isDigit(value.charAt(0))) {
                throw new IllegalArgumentException("Function name cannot contain spaces or start with a digit");
            }
        }
        Function f = function(address);
        String previous;
        int transaction = program.startTransaction("Ghidra++ change " + field);
        boolean commit = false;
        try {
            switch (field) {
                case "name" -> {
                    previous = f.getName();
                    f.setName(value, SourceType.USER_DEFINED);
                }
                case "returnType" -> {
                    previous = f.getReturnType().getDisplayName();
                    DataTypeParser parser = new DataTypeParser(program.getDataTypeManager(),
                            program.getDataTypeManager(), null, DataTypeParser.AllowedDataTypes.ALL);
                    DataType type = parser.parse(value);
                    f.setReturnType(type, SourceType.USER_DEFINED);
                }
                case "comment" -> {
                    previous = f.getComment();
                    f.setComment(value);
                }
                default -> throw new IllegalArgumentException("Unsupported function field: " + field);
            }
            commit = true;
            return previous;
        }
        finally {
            program.endTransaction(transaction, commit);
            invalidateDecompiler();
        }
    }

    @Override
    public synchronized boolean navigate(String address) throws Exception {
        if (program == null) {
            return false;
        }
        Address target = program.getAddressFactory().getAddress(address);
        if (target == null) {
            return false;
        }
        if (tool != null) {
            GoToService service = tool.getService(GoToService.class);
            return service != null && service.goTo(target, program);
        }
        if (project == null || GraphicsEnvironment.isHeadless()) {
            return false;
        }
        AtomicBoolean navigated = new AtomicBoolean(false);
        AtomicReference<Exception> failure = new AtomicReference<>();
        // Open an empty classic tool and hand it the same live Program. Opening its
        // DomainFile independently can acquire another lock and lose unsaved edits.
        Swing.runNow(() -> {
            try {
                ToolManager toolManager = project.getProject().getToolManager();
                // A project opened without the front end has no workspace yet.
                Workspace workspace = toolManager.getActiveWorkspace();
                if (workspace == null) {
                    Workspace[] existing = toolManager.getWorkspaces();
                    workspace = existing.length > 0 ? existing[0] : toolManager.createWorkspace("Ghidra++");
                }
                if (classicTool != null && Arrays.stream(workspace.getTools())
                        .noneMatch(running -> running == classicTool)) {
                    classicTool = null;
                }
                if (classicTool == null) {
                    if (!bundleHostHeld) {
                        // Classic plugins look up the front end tool through AppInfo. It stays
                        // hidden: the browser workspace is the front door, not the project window.
                        if (frontEnd == null) {
                            frontEnd = new HiddenFrontEnd(project.getProjectManager());
                            frontEnd.setActiveProject(project.getProject());
                        }
                        GhidraScriptUtil.acquireBundleHostReference();
                        bundleHostHeld = true;
                    }
                    ToolTemplate template = project.getProject().getToolServices()
                            .getToolChest().getToolTemplate("CodeBrowser");
                    if (template == null) {
                        template = ToolUtils.getAllApplicationTools().stream()
                                .filter(candidate -> "CodeBrowser".equals(candidate.getName()))
                                .findFirst().orElse(null);
                    }
                    if (template == null) {
                        throw new IllegalStateException("CodeBrowser tool template is unavailable");
                    }
                    classicTool = workspace.runTool(template);
                }
                if (classicTool == null) {
                    throw new IllegalStateException("CodeBrowser tool could not start");
                }
                boolean hasInvestigation = classicTool.getManagedPlugins().stream()
                        .anyMatch(plugin -> plugin instanceof GhidraPlusPlusPlugin);
                if (!hasInvestigation) {
                    classicTool.addPlugin(GhidraPlusPlusPlugin.class.getName());
                }
                ProgramManager manager = classicTool.getService(ProgramManager.class);
                GoToService goTo = classicTool.getService(GoToService.class);
                if (manager == null || goTo == null) {
                    throw new IllegalStateException("CodeBrowser is missing program navigation services");
                }
                manager.openProgram(program);
                manager.setCurrentProgram(program);
                classicTool.setVisible(true);
                ComponentProvider listing = classicTool.getComponentProvider("Listing");
                if (listing != null) {
                    classicTool.showComponentProvider(listing, true);
                }
                navigated.set(goTo.goTo(target, program));
            }
            catch (Exception e) {
                failure.set(e);
            }
        });
        if (failure.get() != null) {
            Msg.error(this, "Classic Ghidra could not open the current program", failure.get());
            throw new IllegalStateException("Classic Ghidra could not open the current program",
                    failure.get());
        }
        return navigated.get();
    }

    @Override
    public synchronized String readState() {
        return requireProgram().getOptions(OPTIONS).getString(STATE, "");
    }

    @Override
    public synchronized void writeState(String json) {
        Program p = requireProgram();
        int transaction = p.startTransaction("Save Ghidra++ investigation state");
        boolean commit = false;
        try {
            Options options = p.getOptions(OPTIONS);
            options.setString(STATE, Objects.requireNonNull(json));
            commit = true;
        }
        finally {
            p.endTransaction(transaction, commit);
        }
    }

    @Override
    public synchronized void save() throws Exception {
        Program p = requireProgram();
        DomainFile file = p.getDomainFile();
        if (file == null) {
            throw new IOException("Program has no project file");
        }
        file.save(TaskMonitor.DUMMY);
    }

    @Override
    public synchronized String exportSource() {
        Program p = requireProgram();
        StringBuilder out = new StringBuilder("/* Decompiled C exported by Ghidra++.\n" +
                " * This is normalized decompiler output for investigation. It is not guaranteed\n" +
                " * to compile or reproduce the original program's behavior.\n */\n\n");
        FunctionIterator functions = p.getFunctionManager().getFunctions(true);
        while (functions.hasNext()) {
            Function f = functions.next();
            out.append("/* ").append(f.getEntryPoint()).append(" ").append(f.getName()).append(" */\n");
            out.append(decompile(f)).append("\n\n");
        }
        FunctionIterator external = p.getFunctionManager().getExternalFunctions();
        while (external.hasNext()) {
            Function f = external.next();
            out.append("/* external ").append(f.getEntryPoint()).append(" */\n")
                    .append(f.getPrototypeString(false, false)).append(";\n\n");
        }
        return out.toString();
    }

    private void invalidateDecompiler() {
        if (decompiler != null) {
            decompiler.dispose();
            decompiler = null;
            decompilerProgram = null;
            decompilerModification = 0;
        }
    }

    @Override
    public synchronized void close() {
        invalidateDecompiler();
        if (!attached) {
            if (classicTool != null) {
                PluginTool closing = classicTool;
                classicTool = null;
                // Callers save first, so the tool has no unsaved program changes to ask about.
                Swing.runNow(closing::close);
            }
            if (program != null) {
                program.release(this);
            }
            standaloneProgram = null;
            if (bundleHostHeld) {
                GhidraScriptUtil.releaseBundleHostReference();
                bundleHostHeld = false;
            }
            if (project != null) {
                project.close();
                project = null;
            }
        }
        program = null;
    }
}
