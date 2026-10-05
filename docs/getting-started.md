# Getting started

Ghidra++ helps you inspect a compiled program without running it. The browser workspace is the main path; classic Ghidra remains available for deeper work on the same program.

## Open the workspace

Get the Windows portable ZIP from [v0.1.0](https://github.com/Cuuper22/ghidra-plus-plus/releases/tag/v0.1.0), extract it to a new folder, and double-click `ghidra-plus-plus.bat`. The launcher opens a local browser workspace. If the browser does not open, use the `Ghidra++ workspace:` link printed by the launcher. Keep that link private: its fragment contains a local session token.

The Windows ZIP bundles Ghidra 12.1.4 and Java 25. A separate Java installation is not needed. See [Contributing](contributing.md) to build from source.

The standalone launcher keeps persistent projects in `Documents/Ghidra++ Projects` under your home directory unless you choose another workspace. Click **Save** before leaving. To reopen a program, choose the same file again with **Import**; Ghidra++ restores its saved program and investigation state. Keep the launcher running while you use the browser workspace.

## Try the parcel example

1. Click **Import** and choose `GhidraPlusPlus-examples/parcel.exe` from the extracted portable package. A source checkout includes the same executable in `Ghidra/Features/GhidraPlusPlus/examples/`. Ghidra imports the compiled file and runs static analysis; it does not execute it.
2. Search the function list or click nodes in **Graph** to follow calls. Select a function to see its address, signature, called names, and referenced strings. In **Source**, read Ghidra's decompiled C for that function.
3. Find the string `Parcel priority delivery` in the function evidence, then follow the related call path. Use [`parcel.c`](../Ghidra/Features/GhidraPlusPlus/examples/parcel.c) afterward to check what the example actually does. The source is a reference for you, not an input to analysis.
4. If you configured a model key, review any proposed role or name beside its supporting evidence. Click **Apply** only when the proposal fits. **Undo** reverses an applied proposal. **Save** writes your changes and Ghidra++ state into the Ghidra project.

You can also build an optimized version of the example and compare it with the first build to see how optimization changes the decompiled view.

## Enable semantic analysis

Static analysis, the graph, and decompiled C need no API key. The banner reads **Name and role proposals are off. Add a TypeSafe API key to turn them on.** Click **Add API key**, or open Model settings, and enter your TypeSafe key. You can also set `TYPESAFE_API_KEY` before starting Ghidra++. A key entered in the workspace lasts only for that running process; it is not stored in the project. The environment variable is read when the process starts.

After a key is configured, a new import starts semantic analysis after Ghidra finishes static analysis. For an already open program, choose a mode and depth, then click **Analyze**. **Pause** stops at an analysis boundary; **Resume** continues. The progress message and errors appear in the workspace. If a name proposal says **rejected (evidence changed)** after another rename, run **Analyze** again to get proposals based on the current names.

Semantic analysis sends bounded excerpts of decompiled C and assembly, function metadata, call relationships, and referenced strings to [TypeSafe's API](https://docs.typesafe.ai/api). The imported binary and Ghidra project stay local. Check [TypeSafe's site](https://typesafe.ai/) for current pricing and account terms before using the service.

## Export or use classic Ghidra

**Export → Decompiled source** downloads a C projection from Ghidra's decompiler. **Export → Analysis snapshot** downloads JSON with the current graph, findings, and progress. **Save** is the action that persists the actual Ghidra project; the JSON snapshot is not a `.gpr` project archive.

Select a function and click **Classic** to open it in Ghidra's CodeBrowser. Renames made in either view appear in the other. Return to the browser through **Tools → Ghidra++ → Open Investigation**. Classic is unavailable when you start with `--headless`.

The launcher enables the plugin automatically. If you start through `ghidraRun.bat` and use an existing CodeBrowser tool, you may need to enable it once: open **File → Configure…**, choose **Configure All Plugins**, and enable `GhidraPlusPlusPlugin`. Then open a program and choose **Tools → Ghidra++ → Open Investigation**.

For batch use, the launcher accepts `--open PROGRAM --output DIR`; it saves `analysis.json` and `reconstructed.c` in the output directory. See [How It Works](how-it-works.md) for the other launcher options and the local MCP adapter.
