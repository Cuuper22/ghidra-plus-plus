import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api } from "./api";
import { Icon } from "./components/Icon";
import { FunctionRail } from "./components/FunctionRail";
import { GraphView } from "./components/GraphView";
import { SourceView } from "./components/SourceView";
import { Inspector } from "./components/Inspector";
import { SettingsDialog } from "./components/SettingsDialog";
import { HelpDialog } from "./components/HelpDialog";
import { isStart, roleInfo, type RoleLabel } from "./describe";
import type { FunctionEvidence, Snapshot } from "./types";

const activeStatus = /import|analyz|running|working|queued|saving/i;
const tipsKey = "ghidra-plus-plus-show-tips";

function startAddress(snapshot: Snapshot): string | null {
  const start = snapshot.functions.find((item) => isStart(item.name));
  return (start ?? snapshot.functions[0])?.address ?? null;
}

function statusText(snapshot: Snapshot | null, loading: boolean): string {
  const analysis = snapshot?.analysis;
  if (loading) return "Connecting…";
  switch (analysis?.status) {
    case "queued":
      return "Starting…";
    case "importing":
      return "Reading the program…";
    case "analyzing":
      return analysis.total
        ? `Describing functions: ${analysis.completed} of ${analysis.total}`
        : "Describing functions…";
    case "paused":
      return "Paused";
    case "error":
      return "Stopped";
    case "complete":
      return analysis.message.startsWith("Fast pass") ? analysis.message : "Ready";
    default:
      return snapshot?.program ? "Ready" : "No program open";
  }
}

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
  const [helpOpen, setHelpOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [tab, setTab] = useState<"graph" | "source">("graph");
  const [mode, setMode] = useState("hybrid");
  const [depth, setDepth] = useState("balanced");
  const [railCollapsed, setRailCollapsed] = useState(false);
  const [inspectorCollapsed, setInspectorCollapsed] = useState(false);
  const [showTips, setShowTips] = useState(
    () => localStorage.getItem(tipsKey) !== "false",
  );
  const fileInput = useRef<HTMLInputElement>(null);

  const refresh = useCallback(async () => {
    const next = await api.snapshot();
    setSnapshot(next);
    setConnectionError(null);
    setLoading(false);
    setSelected((previous) =>
      previous && next.functions.some((item) => item.address === previous)
        ? previous
        : startAddress(next),
    );
    return next;
  }, []);

  useEffect(() => {
    if (!api.connected) {
      setLoading(false);
      setConnectionError(
        "This page was opened without its access link. Start Ghidra++ again and use the link it opens.",
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
      setHelpOpen(false);
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
  const roleLabels = useMemo(() => {
    const labels = new Map<string, RoleLabel>();
    for (const value of snapshot?.roles ?? []) {
      const info = roleInfo(value);
      if (info?.known) labels.set(value.address, { label: info.label, level: info.sure.level });
    }
    return labels;
  }, [snapshot]);
  const suggested = useMemo(
    () =>
      new Set(
        (snapshot?.findings ?? [])
          .filter((value) => value.status === "proposed")
          .map((value) => value.address),
      ),
    [snapshot],
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
      : "Describing stopped";
  const isActive = activeStatus.test(analysis?.status || "");
  const isPaused = /paused/i.test(analysis?.status || "");
  const hasProgram = Boolean(snapshot?.program);
  const configured = snapshot?.configured ?? false;
  const progress = analysis?.total
    ? Math.max(0, Math.min(100, (analysis.completed / analysis.total) * 100))
    : null;

  const toggleTips = (value: boolean) => {
    localStorage.setItem(tipsKey, String(value));
    setShowTips(value);
  };
  const importFile = (file: File | undefined) => {
    if (file)
      void run(() => api.import(file), "Could not open the program", `Opening ${file.name}`);
  };
  const openExample = () =>
    void run(
      async () => {
        const response = await fetch("./example/parcel.exe");
        if (!response.ok)
          throw new Error("This copy of Ghidra++ does not include the example program.");
        await api.import(new File([await response.blob()], "parcel.exe"));
      },
      "Could not open the example",
      "Opening the example program",
    );
  const describe = () =>
    configured
      ? void run(
          () => api.command("/analyze", { depth, mode }),
          "Could not start describing functions",
        )
      : setSettingsOpen(true);
  const download = (kind: "source" | "project") => {
    setExportOpen(false);
    const base =
      snapshot?.program?.name?.replace(/\.[^.]+$/, "") || "ghidra-project";
    const filename = `${base}${kind === "source" ? ".c" : "-analysis.json"}`;
    void run(
      () =>
        api.download(
          kind === "source" ? "/export/source" : "/export/project",
          filename,
        ),
      "Export failed",
      `Saved ${filename} to your Downloads folder`,
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
      setNotice(`Renamed to ${name}.`);
      return null;
    } catch (reason) {
      return (reason as Error).message;
    } finally {
      setBusy(false);
    }
  };
  const openInGhidra = (address: string) =>
    void run(
      () => api.command("/navigate", { address }),
      "Could not open full Ghidra",
      "Opened in full Ghidra",
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
          <strong>{snapshot?.program?.name || ""}</strong>
          {snapshot?.program && (
            <span>
              {snapshot.program.format} · {snapshot.program.language}
            </span>
          )}
        </div>
        <div className="top-status" title={analysis?.message || undefined}>
          <span className={`activity-dot ${isActive ? "active" : ""}`} />
          <span>{statusText(snapshot, loading)}</span>
          {progress !== null && progress > 0 && isActive && (
            <strong>{Math.round(progress)}%</strong>
          )}
        </div>
        <button
          className="icon-button"
          type="button"
          onClick={() => setHelpOpen(true)}
          title="Help"
          aria-label="Help"
        >
          <Icon name="help" size={18} />
        </button>
        <button
          className="icon-button"
          type="button"
          onClick={() => setSettingsOpen(true)}
          title="Settings"
          aria-label="Settings"
        >
          <Icon name="settings" size={18} />
        </button>
      </header>
      <input
        ref={fileInput}
        type="file"
        className="sr-only"
        onChange={(event) => {
          importFile(event.target.files?.[0]);
          event.target.value = "";
        }}
        aria-label="Choose a program file"
      />
      {hasProgram && (
        <nav className="toolbar" aria-label="Program actions">
          <button
            type="button"
            disabled={busy || isActive}
            onClick={() => fileInput.current?.click()}
          >
            <Icon name="import" /> Open program
          </button>
          <button
            type="button"
            disabled={busy || isActive || isPaused}
            onClick={describe}
            title={
              configured
                ? "Ask TypeSafe to describe each function and suggest names"
                : "Add a TypeSafe key to describe functions"
            }
          >
            <Icon name="spark" /> Describe functions
          </button>
          {(isActive || isPaused) && (
            <button
              type="button"
              disabled={busy}
              onClick={() =>
                void run(
                  () => api.command(isPaused ? "/resume" : "/pause"),
                  isPaused ? "Could not resume" : "Could not pause",
                )
              }
            >
              <Icon name={isPaused ? "play" : "pause"} />{" "}
              {isPaused ? "Resume" : "Pause"}
            </button>
          )}
          <span className="toolbar-separator" />
          <button
            type="button"
            disabled={busy}
            onClick={() =>
              void run(
                () => api.command("/save"),
                "Save failed",
                "Saved. Open the same file later to pick up where you left off.",
              )
            }
          >
            <Icon name="save" /> Save
          </button>
          <div className="export-wrap">
            <button
              type="button"
              disabled={busy}
              onClick={() => setExportOpen((value) => !value)}
              aria-expanded={exportOpen}
            >
              <Icon name="download" /> Export <Icon name="chevron" size={13} />
            </button>
            {exportOpen && (
              <div className="export-menu">
                <button type="button" onClick={() => download("source")}>
                  <strong>Rebuilt code</strong>
                  <span>All functions as one .c file</span>
                </button>
                <button type="button" onClick={() => download("project")}>
                  <strong>Analysis report</strong>
                  <span>Functions, descriptions and names as .json</span>
                </button>
              </div>
            )}
          </div>
        </nav>
      )}
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
              Open settings
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
            aria-label="Dismiss message"
          >
            <Icon name="close" />
          </button>
        </div>
      )}
      {hasProgram && !configured && (
        <div className="info-banner">
          <span>
            Plain descriptions and name suggestions are off. Everything else
            works without them.
          </span>
          <button
            type="button"
            className="text-button"
            onClick={() => setSettingsOpen(true)}
          >
            Turn them on
          </button>
        </div>
      )}
      {loading ? (
        <main className="center-state">
          <div className="loading-spinner" />
          <h1>Connecting to Ghidra++</h1>
        </main>
      ) : !hasProgram && isActive ? (
        <main className="center-state">
          <div className="loading-spinner" />
          <h1>Reading the program</h1>
          <p>
            Ghidra is turning the machine code into functions you can read.
            Small programs take a few seconds; large ones can take several
            minutes. The program is never run.
          </p>
          <span className="center-detail">{analysis?.message}</span>
        </main>
      ) : !hasProgram ? (
        <main className="center-state welcome">
          <h1>See what is inside a program</h1>
          <p>
            Open a Windows program (an .exe or .dll file). Ghidra++ reads its
            machine code and rebuilds it as code you can read. The program
            itself is never run.
          </p>
          <div className="welcome-actions">
            <button
              className="primary-button"
              type="button"
              disabled={busy || !api.connected}
              onClick={() => fileInput.current?.click()}
            >
              <Icon name="import" /> Open a program
            </button>
            <button
              className="secondary-button"
              type="button"
              disabled={busy || !api.connected}
              onClick={openExample}
            >
              Try the example
            </button>
          </div>
          <ol className="welcome-steps">
            <li>
              <strong>Open a program</strong>
              <span>Ghidra reads it and splits it into functions.</span>
            </li>
            <li>
              <strong>Pick a function</strong>
              <span>
                A function is a small piece of the program that does one job.
                Start with the one marked Start.
              </span>
            </li>
            <li>
              <strong>Read it and name it</strong>
              <span>
                See what it does in plain words, read the rebuilt code, and
                give it a name that makes sense.
              </span>
            </li>
          </ol>
          <p className="welcome-note">
            The example is a tiny shipping calculator. Its original C source is
            in the GhidraPlusPlus-examples folder, so you can check your
            guesses. Opened a program before? Choose the same file again and
            your names come back.
          </p>
        </main>
      ) : (
        <main className="workspace">
          <FunctionRail
            functions={snapshot!.functions}
            roleLabels={roleLabels}
            suggested={suggested}
            selected={selected}
            onSelect={setSelected}
            collapsed={railCollapsed}
            onCollapse={() => setRailCollapsed((value) => !value)}
            showTips={showTips}
          />
          <section className="primary-pane" aria-label="Function view">
            <div className="pane-tabs" role="tablist" aria-label="Function view">
              <button
                type="button"
                role="tab"
                aria-selected={tab === "graph"}
                className={tab === "graph" ? "active" : ""}
                onClick={() => setTab("graph")}
              >
                <Icon name="graph" /> Connections
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={tab === "source"}
                className={tab === "source" ? "active" : ""}
                onClick={() => setTab("source")}
              >
                <Icon name="source" /> Code
              </button>
              <span className="pane-context">{item?.name}</span>
            </div>
            {showTips && (
              <p className="tip">
                {tab === "graph"
                  ? "Each box is a function. Arrows point from a function to the ones it uses. Click a box to open it."
                  : "Ghidra rebuilt this C code from machine code. Names such as param_1 and local_18 are placeholders, because the original names are gone."}
              </p>
            )}
            <div className="pane-content">
              {tab === "graph" && selected ? (
                <GraphView
                  functions={snapshot!.functions}
                  edges={snapshot!.edges}
                  roleLabels={roleLabels}
                  selected={selected}
                  onSelect={setSelected}
                />
              ) : tab === "source" ? (
                <SourceView evidence={current} loading={evidenceLoading && !current} />
              ) : (
                <div className="pane-empty">
                  Ghidra found no functions in this program.
                </div>
              )}
            </div>
          </section>
          <Inspector
            item={item}
            functions={snapshot!.functions}
            evidence={current}
            loading={evidenceLoading && !current}
            findings={findings}
            role={role}
            busy={busy}
            configured={configured}
            analyzing={isActive}
            showTips={showTips}
            onApply={(id) =>
              void run(
                () => api.command(`/findings/${encodeURIComponent(id)}/apply`),
                "Could not use this name",
                "Name applied. Undo puts the old name back.",
              )
            }
            onUndo={(id) =>
              void run(
                () => api.command(`/findings/${encodeURIComponent(id)}/undo`),
                "Could not undo",
                "The previous name is back.",
              )
            }
            onRename={renameFunction}
            onOpenInGhidra={openInGhidra}
            onSelect={setSelected}
            onShowCode={() => setTab("source")}
            onOpenSettings={() => setSettingsOpen(true)}
            onDescribe={describe}
            collapsed={inspectorCollapsed}
            onCollapse={() => setInspectorCollapsed((value) => !value)}
          />
        </main>
      )}
      {hasProgram && (
        <footer className="statusbar">
          <span>{snapshot?.program?.name}</span>
          <span>{snapshot?.functions.length.toLocaleString()} functions</span>
          <span>{snapshot?.edges.length.toLocaleString()} connections</span>
          <span className="statusbar-grow" />
          {notice && <span role="status">{notice}</span>}
        </footer>
      )}
      {settingsOpen && (
        <SettingsDialog
          configured={configured}
          busy={busy}
          mode={mode}
          depth={depth}
          onMode={setMode}
          onDepth={setDepth}
          onClose={() => setSettingsOpen(false)}
          onSave={async (key) => {
            const saved = await run(
              () => api.command("/settings", { apiKey: key }),
              "Could not save the key",
              hasProgram
                ? "Key saved. Click Describe functions to use it."
                : "Key saved. Descriptions start after you open a program.",
            );
            if (saved) setSettingsOpen(false);
            return saved;
          }}
        />
      )}
      {helpOpen && (
        <HelpDialog
          showTips={showTips}
          onTips={toggleTips}
          onClose={() => setHelpOpen(false)}
        />
      )}
    </div>
  );
}
