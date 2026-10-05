import type { FunctionEvidence } from "../types";

export function SourceView({
  evidence,
  loading,
}: {
  evidence: FunctionEvidence | null;
  loading: boolean;
}) {
  if (loading)
    return <div className="pane-empty">Loading the rebuilt code…</div>;
  if (!evidence)
    return (
      <div className="pane-empty">Pick a function to read its code.</div>
    );
  const source = evidence.source?.trim();
  return (
    <div className="source-view">
      <div className="source-meta">
        <span>{evidence.signature || evidence.name}</span>
        <span>{evidence.address}</span>
      </div>
      {source ? (
        <pre tabIndex={0}>
          <code>{evidence.source}</code>
        </pre>
      ) : (
        <div className="pane-empty">
          Ghidra could not rebuild code for this function. Open it in full
          Ghidra to see its machine instructions.
        </div>
      )}
      {(evidence.sourceTruncated || evidence.truncated) && (
        <p className="truncated">
          This code is cut short because the function is long. Open it in full
          Ghidra to see all of it.
        </p>
      )}
    </div>
  );
}
