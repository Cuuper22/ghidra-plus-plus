# Contributing

Ghidra++ is a small addition to the Ghidra source tree. Keep upstream Ghidra functionality intact and make changes around the module at `Ghidra/Features/GhidraPlusPlus` when possible. The [upstream README](upstream-readme.md) and [Ghidra developer guide](../DevGuide.md) cover the larger Ghidra project.

## Build the current source

The module builder targets an extracted **Ghidra 12.1.4** distribution and needs **JDK 25**, Python 3, Node.js, and npm. It compiles the workspace and module against that distribution; it does not rebuild all of upstream Ghidra. Use a separate extracted distribution because the builder installs the module and launchers into it.

On Windows, from the repository root:

```powershell
python Ghidra/Features/GhidraPlusPlus/tools/build.py --ghidra "C:\path\to\ghidra_12.1.4_PUBLIC" --java-home "C:\path\to\jdk-25" --test
```

The builder's `--test` option runs `AnalysisEngineTest` and `InvestigationServerTest`. Run the MCP adapter's tests from the repository root with `python -m unittest discover -s Ghidra/Features/GhidraPlusPlus/tests -p test_mcp.py -v`. The [Ghidra++ workflow](../.github/workflows/ghidra-plus-plus.yml) builds the web workspace, runs the Java and Python tests against the verified Ghidra 12.1.4 archive, and runs a batch analysis of the parcel example without a model key.

The built distribution gets `ghidra-plus-plus.bat` at its root. Double-click it for the browser workspace. The optional `--package "C:\path\to\Ghidra++-0.2.0.zip" --bundle-java` flags make a portable ZIP containing the supplied JDK. Packaging is a local build step; check [Releases](https://github.com/Cuuper22/ghidra-plus-plus/releases) for published assets.

## Build the example

The source checkout and portable package include [`parcel.c`](../Ghidra/Features/GhidraPlusPlus/examples/parcel.c), `parcel.exe`, and `parcel-optimized.exe`. You can import the executables directly. To rebuild them, use a Visual Studio Developer Command Prompt:

```bat
cd Ghidra\Features\GhidraPlusPlus\examples
cl /nologo /Od /Fe:parcel.exe parcel.c
cl /nologo /O2 /Fe:parcel-optimized.exe parcel.c
```

The two small example executables are checked in so a fresh clone can follow the walk-through and CI can analyze a known binary. Other generated binaries and project data should stay outside Git.

The module's web source lives in `web/` and builds into `data/web/`; the plain-language wording for roles and confidence is in `web/src/describe.ts`. The Java bridge and desktop plugin are in `ghidraplus/bridge` and `ghidraplus/plugin`; the analysis engine is in `ghidraplus/core`; the loopback server is in `ghidraplus/server`. `tools/mcp.py` is the local MCP adapter. Keep secrets, imported binaries, generated project data, and build products out of Git.

## Work on behavior

For a change to function evidence, compare what the bridge returns with what the function panel shows. For a model change, keep questions typed and bounded, preserve an `unknown` answer, send one function per request, and show the real supporting evidence with each suggestion. Numeric facts, call edges, and types should come from Ghidra rather than model guesses. Applying and undoing must remain reviewable and transactional.

Run the builder's `--test` option for the Java tests. Then use a running workspace: click **Try the example**, check Connections and Code, use and undo a suggestion when one exists, save, and reopen the same file. Check that full Ghidra and the browser refer to the same program when changing desktop integration. A passing compile alone cannot verify those user flows.

If a change affects the public behavior, update the relevant page in `docs/` and keep this README short. Do not claim a feature or release is available until it exists.
