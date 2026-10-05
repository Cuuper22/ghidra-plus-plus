# Ghidra++

Automatic reverse engineering, built on [Ghidra](https://github.com/NationalSecurityAgency/ghidra).

Ghidra++ opens a compiled program, runs Ghidra's static analysis, and gives you a focused workspace for exploring functions, calls, and decompiled C. With a TypeSafe API key, it also classifies function roles and suggests names drawn from concrete evidence in the program. You review each proposed change before applying it to the Ghidra project.

For example, import the included [`parcel.exe`](Ghidra/Features/GhidraPlusPlus/examples/parcel.exe), follow calls from its entry function, and inspect the function that references `Parcel priority delivery`. Check a proposed name against [`parcel.c`](Ghidra/Features/GhidraPlusPlus/examples/parcel.c), then apply it or undo it.

## Get started

Download the Windows portable ZIP from [v0.1.0](https://github.com/Cuuper22/ghidra-plus-plus/releases/tag/v0.1.0), extract it, and double-click `ghidra-plus-plus.bat`. It bundles Ghidra 12.1.4 and Java 25; the investigation workspace opens in your browser. See [Getting Started](docs/getting-started.md) for the first import, key setup, and the parcel walk-through. To build from source, use the [contributor guide](docs/contributing.md).

Select a function and click **Classic** to open it in Ghidra's CodeBrowser. You can return through **Tools → Ghidra++ → Open Investigation**. Both views use the same Ghidra program. The standalone launcher stores projects in `Documents/Ghidra++ Projects` under your home directory by default.

The browser workspace shows a searchable function list, a call graph, decompiled source, code evidence, and reviewable proposals. Import and static analysis work without a model key. Semantic analysis uses [TypeSafe Jev](https://typesafe.ai/) and sends bounded code evidence to TypeSafe; check its site for current pricing. The key is held for the current process and is not saved in the project.

## Current scope

- Ghidra handles import, disassembly, decompilation, inferred types, project storage, and classic tools.
- Jev chooses a function role, including `unknown`, and may select a name from candidates derived from called names and referenced strings. Existing meaningful names are not automatically replaced.
- You can apply or undo a proposal, save and reopen the project, export an analysis JSON snapshot, or export Ghidra's reconstructed C. That C is a decompiler projection, not recovered original source or a promise that it will recompile.
- `fixed`, `hybrid`, and `dynamic` modes change function analysis order; `fast`, `balanced`, and `exhaustive` change effort. They do not change what the binary executes.
- A [local MCP adapter](Ghidra/Features/GhidraPlusPlus/tools/mcp.py) exposes project inspection and review actions to compatible agents. A batch launcher can write `analysis.json` and `reconstructed.c`.

Custom AI structure recovery and model training are future work. See [How It Works](docs/how-it-works.md) for the present pipeline and [Contributing](docs/contributing.md) for development.

Ghidra++ is a fork of NSA Ghidra. The [upstream README](docs/upstream-readme.md), upstream license, and original attribution remain available.
