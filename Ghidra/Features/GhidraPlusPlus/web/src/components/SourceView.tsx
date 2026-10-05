import type { FunctionEvidence } from "../types";

export function SourceView({
  evidence,
  loading,
}: {
  evidence: FunctionEvidence | null;
  loading: boolean;
}) {
  if (loading)
    return <div className="pane-empty">Loading decompiled source…</div>;
  if (!evidence)
    return (
      <div className="pane-empty">Select a function to read its source.</div>
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
          Decompiler source is unavailable for this function.
        </div>
      )}
      {(evidence.sourceTruncated || evidence.truncated) && (
        <p className="truncated">
          This excerpt is truncated. Open the function in Classic for the full
          view.
        </p>
      )}
    </div>
  );
}
