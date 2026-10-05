import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api } from "./api";
import { Icon } from "./components/Icon";
import { FunctionRail } from "./components/FunctionRail";
import { GraphView } from "./components/GraphView";
import { SourceView } from "./components/SourceView";
import { Inspector } from "./components/Inspector";
import { SettingsDialog } from "./components/SettingsDialog";
import type { FunctionEvidence, Snapshot } from "./types";

const activeStatus = /import|analyz|running|working|queued|saving/i;

export function App() {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [evidence, setEvidence] = useState<FunctionEvidence | null>(null);
  const [evidenceLoading, setEvidenceLoading] = useState(false);
  const [evidenceRevision, setEvidenceRevision] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [errorTitle, setErrorTitle] = useState("Something went wrong");
  const [dismissedAnalysisError, setDismissedAnalysisError] = useState<
    string | null
  >(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [tab, setTab] = useState<"graph" | "source">("graph");
  const [mode, setMode] = useState("hybrid");
  const [depth, setDepth] = useState("balanced");
  const [railCollapsed, setRailCollapsed] = useState(false);
  const [inspectorCollapsed, setInspectorCollapsed] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  const refresh = useCallback(async () => {
    const next = await api.snapshot();
    setSnapshot(next);
    setConnectionError(null);
    setLoading(false);
    setSelected((previous) =>
      previous && next.functions.some((item) => item.address === previous)
        ? previous
        : (next.functions[0]?.address ?? null),
    );
    return next;
  }, []);

  useEffect(() => {
    if (!api.connected) {
      setLoading(false);
      setConnectionError(
        "Connection link is missing its session token. Open Ghidra++ from the desktop app again.",
      );
      return;
    }
    let cancelled = false;
    let timer: number | undefined;
    const poll = async () => {
      try {
        const next = await refresh();
        if (!cancelled)
          timer = window.setTimeout(
            poll,
            activeStatus.test(next.analysis?.status || "") ? 1000 : 4000,
          );
      } catch (reason) {
        if (!cancelled) {
          setLoading(false);
          setConnectionError((reason as Error).message);
          timer = window.setTimeout(poll, 4000);
        }
      }
    };
    void poll();
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [refresh]);

  useEffect(() => {
    if (!selected) {
      setEvidence(null);
      return;
    }
    let cancelled = false;
    setEvidenceLoading(true);
    api
      .function(selected)
      .then((value) => {
        if (!cancelled) setEvidence(value);
      })
      .catch((reason) => {
        if (!cancelled) setError((reason as Error).message);
      })
      .finally(() => {
        if (!cancelled) setEvidenceLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [selected, snapshot?.analysis?.status, evidenceRevision]);

  useEffect(() => {
    const close = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setExportOpen(false);
      setSettingsOpen(false);
    };
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, []);

  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(null), 6000);
    return () => window.clearTimeout(timer);
  }, [notice]);

  useEffect(() => {
    if (snapshot && !snapshot.analysis?.error) setDismissedAnalysisError(null);
  }, [snapshot]);

  const run = useCallback(
    async (
      action: () => Promise<unknown>,
      failure = "Something went wrong",
      success?: string,
    ) => {
      setBusy(true);
      try {
        await action();
        await refresh();
        setError(null);
        setNotice(success ?? null);
        setEvidenceRevision((value) => value + 1);
        return true;
      } catch (reason) {
        setErrorTitle(failure);
        setError((reason as Error).message);
        return false;
      } finally {
        setBusy(false);
      }
    },
    [refresh],
  );

  const item = useMemo(
    () =>
      snapshot?.functions.find((value) => value.address === selected) ?? null,
    [snapshot, selected],
  );
  const findings = useMemo(
    () =>
      snapshot?.findings.filter((value) => value.address === selected) ?? [],
    [snapshot, selected],
  );
  const role = useMemo(
    () => snapshot?.roles?.find((value) => value.address === selected) ?? null,
    [snapshot, selected],
  );
  const analysis = snapshot?.analysis;
  const current = evidence?.address === selected ? evidence : null;
  const analysisError =
    analysis?.error && analysis.error !== dismissedAnalysisError
      ? analysis.error
      : null;
  const displayError = error || connectionError || analysisError;
  const bannerTitle = error
    ? errorTitle
    : connectionError
      ? "Cannot reach Ghidra++"
      : "Analysis problem";
  const isActive = activeStatus.test(analysis?.status || "");
  const isPaused = /paused/i.test(analysis?.status || "");
  const hasProgram = Boolean(snapshot?.program);
  const progress = analysis?.total
    ? Math.max(0, Math.min(100, (analysis.completed / analysis.total) * 100))
    : null;

  const importFile = (file: File | undefined) => {
    if (file)
      void run(() => api.import(file), "Import failed", `Imported ${file.name}`);
  };
  const download = (kind: "source" | "project") => {
    setExportOpen(false);
    const base =
      snapshot?.program?.name?.replace(/\.[^.]+$/, "") || "ghidra-project";
    void run(() =>
      api.download(
        kind === "source" ? "/export/source" : "/export/project",
        `${base}${kind === "source" ? ".c" : "-analysis.json"}`,
      ),
      "Export failed",
      `Sent ${base}${kind === "source" ? ".c" : "-analysis.json"} to your browser's downloads`,
    );
  };
  const renameFunction = async (address: string, name: string) => {
    setBusy(true);
    try {
      await api.command("/rename", { address, name });
      const next = await refresh();
      setEvidenceRevision((value) => value + 1);
      if (next.functions.find((value) => value.address === address)?.name !== name)
        return "Ghidra did not apply the new name. Try again.";
      setNotice(`Renamed to ${name}`);
      return null;
    } catch (reason) {
      return (reason as Error).message;
    } finally {
      setBusy(false);
    }
  };
  const navigate = (address: string) =>
    void run(
      () => api.command("/navigate", { address }),
      "Cannot open in Classic Ghidra",
      "Opened in Classic Ghidra",
    );

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark" aria-hidden="true">
            <span />
            <span />
            <span />
          </span>
          <span>
            Ghidra<span className="brand-plus">++</span>
          </span>
        </div>
        <div className="top-program">
          <strong>{snapshot?.program?.name || "No program open"}</strong>
          {snapshot?.program && (
            <span>
              {snapshot.program.format} · {snapshot.program.language}
            </span>
          )}
        </div>
        <div className="top-status">
          <span className={`activity-dot ${isActive ? "active" : ""}`} />
          <span>
            {analysis?.message ||
              analysis?.status ||
              (loading
                ? "Connecting…"
                : hasProgram
                  ? "Ready"
                  : "Waiting for a program")}
          </span>
          {progress !== null && progress > 0 && isActive && (
            <strong>{Math.round(progress)}%</strong>
          )}
        </div>
        <button
          className="icon-button settings-trigger"
          type="button"
          onClick={() => setSettingsOpen(true)}
          title="Model settings"
          aria-label="Model settings"
        >
          <Icon name="settings" size={18} />
        </button>
      </header>
      <nav className="toolbar" aria-label="Project actions">
        <input
          ref={fileInput}
          type="file"
          className="sr-only"
          onChange={(event) => {
            importFile(event.target.files?.[0]);
            event.target.value = "";
          }}
          aria-label="Select compiled program"
        />
        <button
          type="button"
          disabled={busy}
          onClick={() => fileInput.current?.click()}
        >
          <Icon name="import" /> Import
        </button>
        <span className="toolbar-separator" />
        <label className="compact-select">
          Mode
          <select
            aria-label="Analysis mode"
            value={mode}
            onChange={(event) => setMode(event.target.value)}
          >
            <option value="fixed">Fixed</option>
            <option value="hybrid">Hybrid</option>
            <option value="dynamic">Dynamic</option>
          </select>
        </label>
        <label className="compact-select">
          Depth
          <select
            aria-label="Analysis depth"
            value={depth}
            onChange={(event) => setDepth(event.target.value)}
          >
            <option value="fast">Fast</option>
            <option value="balanced">Balanced</option>
            <option value="exhaustive">Exhaustive</option>
          </select>
        </label>
        <button
          type="button"
          disabled={busy || !hasProgram || isActive || isPaused}
          onClick={() =>
            snapshot?.configured
              ? void run(
                  () => api.command("/analyze", { depth, mode }),
                  "Analysis could not start",
                )
              : setSettingsOpen(true)
          }
        >
          <Icon name="play" /> Analyze
        </button>
        <button
          type="button"
          disabled={busy || !hasProgram || (!isActive && !isPaused)}
          onClick={() =>
            void run(
              () => api.command(isPaused ? "/resume" : "/pause"),
              isPaused ? "Cannot resume" : "Cannot pause",
            )
          }
        >
          <Icon name={isPaused ? "play" : "pause"} />{" "}
          {isPaused ? "Resume" : "Pause"}
        </button>
        <span className="toolbar-separator" />
        <button
          type="button"
          disabled={busy || !hasProgram}
          onClick={() =>
            void run(
              () => api.command("/save"),
              "Save failed",
              "Saved to the Ghidra project",
            )
          }
        >
          <Icon name="save" /> Save
        </button>
        <div className="export-wrap">
          <button
            type="button"
            disabled={busy || !hasProgram}
            onClick={() => setExportOpen((value) => !value)}
            aria-expanded={exportOpen}
          >
            <Icon name="download" /> Export <Icon name="chevron" size={13} />
          </button>
          {exportOpen && (
            <div className="export-menu">
              <button type="button" onClick={() => download("source")}>
                Decompiled source
              </button>
              <button type="button" onClick={() => download("project")}>
                Analysis snapshot
              </button>
            </div>
          )}
        </div>
        <button
          type="button"
          disabled={busy || !selected}
          onClick={() => selected && navigate(selected)}
        >
          <Icon name="classic" /> Classic
        </button>
      </nav>
      {displayError && (
        <div className="error-banner" role="alert">
          <strong>{bannerTitle}</strong>
          <span>{displayError}</span>
          {!error && !connectionError && (
            <button
              type="button"
              className="text-button"
              onClick={() => setSettingsOpen(true)}
            >
              Model settings
            </button>
          )}
          <button
            type="button"
            className="icon-button"
            onClick={() => {
              setError(null);
              setConnectionError(null);
              setDismissedAnalysisError(analysis?.error || null);
            }}
            aria-label="Dismiss error"
          >
            <Icon name="close" />
          </button>
        </div>
      )}
      {hasProgram && snapshot && !snapshot.configured && (
        <div className="info-banner">
          <span>
            Name and role proposals are off. Add a TypeSafe API key to turn them
            on. Static analysis, the graph and decompiled source work without
            one.
          </span>
          <button
            type="button"
            className="text-button"
            onClick={() => setSettingsOpen(true)}
          >
            Add API key
          </button>
        </div>
      )}
      {loading ? (
        <main className="center-state">
          <div className="loading-spinner" />
          <h1>Connecting to Ghidra++</h1>
          <p>Loading the current program and analysis state.</p>
        </main>
      ) : !hasProgram ? (
        <main className="center-state import-state">
          <div className="empty-symbol">
            <Icon name="graph" size={36} />
          </div>
          <h1>Start with a compiled program</h1>
          <p>
            Import an executable or library to see its functions, call
            relationships, and decompiled source. Ghidra++ analyzes the file
            without running it.
          </p>
          <button
            className="primary-button"
            type="button"
            disabled={busy || !api.connected}
            onClick={() => fileInput.current?.click()}
          >
            <Icon name="import" /> {busy ? "Importing…" : "Choose a file"}
          </button>
          <span>
            Ghidra’s static analysis starts after import. To reopen a program you
            saved before, choose the same file again. Your names, proposals and
            roles come back with it.
          </span>
        </main>
      ) : (
        <main className="workspace">
          <FunctionRail
            functions={snapshot!.functions}
            selected={selected}
            onSelect={setSelected}
            collapsed={railCollapsed}
            onCollapse={() => setRailCollapsed((value) => !value)}
          />
          <section className="primary-pane" aria-label="Investigation">
            <div
              className="pane-tabs"
              role="tablist"
              aria-label="Function view"
            >
              <button
                type="button"
                role="tab"
                aria-selected={tab === "graph"}
                className={tab === "graph" ? "active" : ""}
                onClick={() => setTab("graph")}
              >
                <Icon name="graph" /> Graph
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={tab === "source"}
                className={tab === "source" ? "active" : ""}
                onClick={() => setTab("source")}
              >
                <Icon name="source" /> Source
              </button>
              <span className="pane-context">
                {item ? `${item.name} · ${item.address}` : "Select a function"}
              </span>
            </div>
            <div className="pane-content">
              {tab === "graph" && selected ? (
                <GraphView
                  functions={snapshot!.functions}
                  edges={snapshot!.edges}
                  selected={selected}
                  onSelect={setSelected}
                />
              ) : tab === "source" ? (
                <SourceView evidence={current} loading={evidenceLoading && !current} />
              ) : (
                <div className="pane-empty">
                  No functions are available in this program.
                </div>
              )}
            </div>
          </section>
          <Inspector
            item={item}
            evidence={current}
            loading={evidenceLoading && !current}
            findings={findings}
            role={role}
            busy={busy}
            configured={snapshot!.configured}
            onApply={(id) =>
              void run(() =>
                api.command(`/findings/${encodeURIComponent(id)}/apply`),
                "Cannot apply proposal",
                "Applied. Undo restores the previous name.",
              )
            }
            onUndo={(id) =>
              void run(() =>
                api.command(`/findings/${encodeURIComponent(id)}/undo`),
                "Cannot undo proposal",
                "Undone. The previous name is back.",
              )
            }
            onRename={renameFunction}
            onClassic={navigate}
            onShowSource={() => setTab("source")}
            collapsed={inspectorCollapsed}
            onCollapse={() => setInspectorCollapsed((value) => !value)}
          />
        </main>
      )}
      {hasProgram && (
        <footer className="statusbar">
          <span>{snapshot?.program?.name}</span>
          <span>{snapshot?.functions.length.toLocaleString()} functions</span>
          <span>{snapshot?.edges.length.toLocaleString()} calls</span>
          <span className="statusbar-grow" />
          {notice && <span role="status">{notice}</span>}
          <span>{analysis?.status || "Ready"}</span>
        </footer>
      )}
      {settingsOpen && (
        <SettingsDialog
          configured={snapshot?.configured ?? false}
          busy={busy}
          onClose={() => setSettingsOpen(false)}
          onSave={async (key) => {
            const saved = await run(
              () => api.command("/settings", { apiKey: key }),
              "Cannot save key",
              "Key set for this session",
            );
            if (saved) setSettingsOpen(false);
            return saved;
          }}
        />
      )}
    </div>
  );
}
