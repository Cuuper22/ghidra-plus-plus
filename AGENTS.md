# Working on Ghidra++

Ghidra++ is an open-source Ghidra fork that helps people understand compiled programs. Preserve Ghidra plugins and scripts. Keep the investigation workspace and classic tools connected to the same program.

## Work style

- Build complete user flows. Read existing code before adding machinery.
- Use GPT-6 Sol subagents for independent work, with explicit file ownership. The lead integrates and verifies their changes.
- Keep tests local. Use Colab CLI/MCP only if local work makes the laptop sluggish.
- Use direct names, small focused methods, and a few useful module boundaries. Add abstractions and dependencies when real work justifies them.
- Reuse Ghidra's decoding, decompilation, project storage, and plugin services. Avoid changing upstream code unless required.
- Keep model access replaceable. TypeSafe supplies structured judgments now; custom model training is deferred.
- Keep secrets, private binaries, generated analysis, build products, and temporary test files out of Git.
- Ask the model about one function per request; mixing functions in one request lowered accuracy. Cache answers against evidence, questions, and model version. Invalidate dependent results when evidence changes.
- Verify real behavior, including applying and undoing changes and saving/reopening a project. Use the running interface to check the experience.
- Finish changes by removing superseded code and updating the page affected by the change.

## Writing

Explain what the reader is trying to do, then show an example. Define unfamiliar terms where they first appear. Keep the README short and link to deeper material. Describe features that actually exist and put future work in the roadmap. Preserve upstream licensing and attribution.

## Windows

Use one profile-free PowerShell layer. Use explicit Git and GitHub CLI executables when wrapper scripts shadow them. Keep downloads and runtime dependencies outside the source checkout. Do not run unknown imported programs as part of ordinary analysis.
