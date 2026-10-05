# How Ghidra++ works

Ghidra++ uses Ghidra for program facts, then adds a review layer for semantic judgments. It does not execute an imported program.

## From binary to investigation

Opening a program creates or reopens a persistent Ghidra project for the binary and runs Ghidra's normal static analysis. The program snapshot includes every discovered function, call edges, and Ghidra types. Selecting a function asks Ghidra for its decompiled C, a bounded assembly excerpt, referenced strings, and callers and callees. The Connections and Code views and the function panel read this program evidence.

The standalone launcher stores the program under a content hash in its chosen project. Importing the same binary again opens the saved program rather than replacing the project. The classic plugin instead attaches to the exact program already open in Ghidra, so navigation and edits refer to the same program.

## What the model decides

With a key configured, Ghidra++ sends each function's evidence to TypeSafe's Jev model in its own request. The request includes bounded source and instruction excerpts, signature and type information, call relationships, and referenced strings. Jev selects a role from a fixed list of 16 that includes `unknown`. For generic function names such as `FUN_140001000`, it may also choose a name from a short list of common names and names suggested by the program's calls and strings. It cannot return a new name of its own.

A name becomes a suggestion only after validation and a confidence threshold. Existing meaningful names are left alone. The function panel turns the role into a plain sentence, shows how sure Jev is, and lists the evidence behind a suggested name. Using a suggestion changes the Ghidra program in a transaction; Undo restores the previous value. A manual Rename is separate from a suggestion. Ghidra validates changes, and a suggestion is set aside when its underlying evidence changes. Renaming a called function also changes the evidence of its callers, so their pending suggestions can become **Out of date**; click **Describe functions** again for fresh ones.

**Settings → Advanced** chooses the depth and order. Detail `fast` (Quick look), `balanced` (Normal), or `exhaustive` (Thorough) selects how many functions and how much source and assembly context are used. Quick look describes only the first 40 functions in order; the program graph itself still contains all functions. Order `fixed` (Address order) visits functions by address, `dynamic` (Busiest first) prioritizes highly connected functions, and `hybrid` (Mixed) alternates between the two. These settings change effort and order, not what the binary does.

Ghidra++ caches model answers against evidence, questions, and model version. Saving writes findings, roles, cache, usage, and review state into the Ghidra program's options alongside normal Ghidra project data. The API key is never serialized.

## How well it works

Jev was checked by hand on three tiny programs built without symbols, with the right answers written down before each run: the two parcel builds and a second program whose functions mostly match no name on Ghidra++'s list. Together they have 21 functions. Thirteen of those functions have a fitting name on the list; Jev suggested 12 of them correctly and made no wrong suggestions. For the other eight it suggested nothing, which is the right answer. Its role was plausible for 18 of the 21 functions. The least reliable roles were for each program's main function, which is why a low-confidence description is shown as a best guess.

The previous version sent six functions in one request. Their evidence mixed: a function that keeps a number between 0 and 100 was called a checksum, the job of its neighbor in the same request. That version suggested 8 correct names and 2 wrong or misleading ones on the same programs. One function per request uses about 10% more input tokens, which is still well under a cent for programs of this size at TypeSafe's listed price in October 2026.

These programs are small, and the name list includes the kinds of utility functions they contain. In a real program, expect a description for most functions and a suggested name for only a few.

## Local interfaces

The browser workspace is served on the local loopback interface with a random session token in its URL fragment. The token is sent in an `X-Ghidra-Token` header; the server checks it and the request origin. The workspace polls progress while work is active and less often when idle.

The standalone launcher accepts these options:

| Option | What it does |
| --- | --- |
| `--open PROGRAM` | Import or reopen a compiled file on startup. |
| `--workspace DIR` | Choose where Ghidra projects are stored. Default: `~/Documents/Ghidra++ Projects`. |
| `--project NAME` | Choose a project name. Default: `Investigation`. |
| `--output DIR` | Analyze, save the project, write `analysis.json` and `reconstructed.c`, then exit. Requires `--open`; disables desktop tools and browser launch. |
| `--port NUMBER` | Use a specific local port. Default: choose a free port. |
| `--headless` | Disable Classic desktop tools; the browser workspace still runs. |
| `--no-browser` | Print the workspace link without opening the browser. |
| `--assets DIR` | Serve a custom built web workspace, useful during development. |
| `--help` or `-h` | Print usage and exit. |

For example, from an extracted Windows package:

```powershell
.\ghidra-plus-plus.bat --open ".\GhidraPlusPlus-examples\parcel.exe" --output ".\parcel-analysis"
```

Without a key, batch output contains Ghidra static analysis only. With `TYPESAFE_API_KEY` set, it also contains role judgments and name proposals. Batch analysis does not apply proposals.

## Connect an agent through MCP

MCP (Model Context Protocol) lets a compatible agent call the workspace's tools. The included [adapter](../Ghidra/Features/GhidraPlusPlus/tools/mcp.py) uses standard input and output to communicate with the agent and connects to one running local workspace. Python 3 is required for the adapter; it is not bundled in the Windows ZIP.

Start Ghidra++ and import a program first. Configure your MCP client to launch:

```text
python ghidra-plus-plus-mcp.py --url <the complete Ghidra++ workspace link>
```

Use the `ghidra-plus-plus-mcp.py` at the portable package root. In a source checkout, use `Ghidra/Features/GhidraPlusPlus/tools/mcp.py`. Use an absolute script path in your client's configuration. You can provide the link through `GHIDRAPLUS_URL` in the client's environment instead of `--url`. Include its `#token=...` fragment, and update the link when Ghidra++ restarts.

The adapter offers 11 tools:

| Task | Tools |
| --- | --- |
| Inspect evidence and proposals | `inspect_project`, `inspect_function` |
| Control analysis | `start_analysis`, `pause_analysis`, `resume_analysis` |
| Review and edit | `rename_function`, `apply_finding`, `undo_finding` |
| Save and export | `save_project`, `export_project`, `export_source` |

An agent can read a function's evidence and explain a proposal before you ask it to apply the change. Analysis runs in the background; the client checks `inspect_project` for completion. Starting semantic analysis sends evidence to TypeSafe, and edit tools change the same live Ghidra program used by the browser and Classic. The adapter accepts only the local `http://127.0.0.1` workspace link and does not launch the imported binary.

Reconstructed C and inferred types come from Ghidra. They are useful for reading and export, but do not establish the original source layout or a buildable replacement. Custom AI structure recovery and training are not implemented in this version.
