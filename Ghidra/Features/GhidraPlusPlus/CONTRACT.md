# Shared shapes

The shapes below are shared by the engine, the bridge, the server, the web workspace and the MCP adapter. Extend them only when a consumer needs the addition. The deeper explanation is in [docs/how-it-works.md](../../../docs/how-it-works.md).

## Program bridge

`ProgramBridge` (implemented by `GhidraProgramBridge`) is the only code that touches a Ghidra program.

- `snapshot()` returns `{program, functions, edges, types}`. `program` is null with no open program. It has name, format, language, compiler, imageBase, sha256, path and projectPath. Functions have address, name, signature, size, external, returnType and parameterCount. Edges are `{from, to}` function addresses. Types have name, length and kind. Addresses are strings and act as stable IDs; no function is ever dropped.
- `evidence(address)` returns the function summary plus source (decompiled C), instructions (bounded assembly), strings, calledNames, callers and callees (addresses). Truncated excerpts say so in their text.
- `change(address, field, value)` supports name, returnType and comment, runs in one transaction and returns the previous value. `revision()` changes on any program edit, including edits made in classic Ghidra.
- `readState/writeState` keep Ghidra++ JSON in the program's options. `open` imports into a persistent project and runs Ghidra's static analysis without executing the binary; existing project data is never overwritten.

## Engine

`AnalysisEngine(bridge, apiKey)` runs one background worker for import and analysis. Its snapshot adds to the bridge snapshot:

- `analysis: {status, message, completed, total, depth, mode, error}`, where status is idle, queued, importing, analyzing, paused, complete or error. Depth is fast, balanced or exhaustive; mode is fixed, hybrid or dynamic.
- `findings: [{id, address, field, before, after, role, confidence, status, evidence, model}]`. Status is proposed, applied, rejected or undone. Evidence is an array of short strings that start with the function address.
- `roles: [{address, role, confidence, evidence, model}]`, `usage: {inputTokens, outputTokens, requests}` and `configured` (whether a key is set).

`function(address)` returns the bridge evidence plus `sourceTruncated`, `instructionsTruncated`, `stringsTruncated`, the function's `role` and its `findings`. The API key is never serialized, persisted or returned; error text has it removed.

## HTTP

The server binds 127.0.0.1. Every `/api` request needs the session token in `X-Ghidra-Token` (given to the browser in the URL fragment), an `Origin` equal to the server's own origin when one is sent, and a matching `Host`. JSON bodies are limited to 64 KB; imports to 512 MB. Errors are `{error}`.

| Route | Purpose |
| --- | --- |
| GET /api/project | engine snapshot |
| GET /api/functions/{address} | function evidence |
| GET /api/export/source, /api/export/project | reconstructed C, snapshot JSON |
| POST /api/import | raw binary body with URL-encoded `X-Filename`; returns 202 |
| POST /api/analyze `{depth, mode}`, /api/pause, /api/resume, /api/save | analysis and project controls |
| POST /api/findings/{id}/apply, /api/findings/{id}/undo | review a proposal |
| POST /api/rename `{address, name}`, /api/navigate `{address}`, /api/settings `{apiKey}` | direct edits and settings |

Actions answer `{ok, analysis}`, plus `finding` for apply and undo. Navigate answers 409 when no classic Ghidra window exists.

`new InvestigationServer(engine, port, assets)` has `start()`, `url()` and `close()`; port 0 picks a free port and null assets means the module's `data/web`.
