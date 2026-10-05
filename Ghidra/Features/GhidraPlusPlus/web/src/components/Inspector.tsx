import { useEffect, useState } from "react";
import type { Finding, FunctionEvidence, FunctionItem, Role } from "../types";
import { Icon } from "./Icon";

function evidenceText(entry: unknown): string {
  if (typeof entry === "string") return entry;
  if (entry && typeof entry === "object") {
    const data = entry as { address?: string; text?: string };
    return `${data.address ? `${data.address} · ` : ""}${data.text ?? JSON.stringify(entry)}`;
  }
  return String(entry);
}

function roleLabel(role: string): string {
  return role
    .replace(/_/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function supportLine(entry: unknown): {
  address: string;
  field: string;
  value: string;
} {
  const text = evidenceText(entry);
  const match =
    /^(\S+)\s+(signature|calledNames|strings|source):\s*([\s\S]*)$/.exec(text);
  if (!match) return { address: "", field: "Evidence", value: text };
  const [, address, field, raw] = match;
  if (field === "source") return { address, field, value: "" };
  const truncated = raw.endsWith(" [truncated]");
  const body = truncated ? raw.slice(0, -12) : raw;
  let value: string;
  try {
    const decoded: unknown = JSON.parse(body);
    value = Array.isArray(decoded)
      ? decoded.map(String).join(", ")
      : String(decoded);
  } catch {
    value = body
      .replace(/^\[/, "")
      .replace(/\]$/, "")
      .replace(/^"/, "")
      .replace(/"$/, "")
      .replace(/","/g, ", ")
      .replace(/\\n/g, " ")
      .replace(/\\"/g, '"');
  }
  return { address, field, value: `${value}${truncated ? "…" : ""}` };
}

function SupportList({
  entries,
  onShowSource,
}: {
  entries: unknown[];
  onShowSource: () => void;
}) {
  const labels: Record<string, string> = {
    signature: "Signature",
    calledNames: "Calls",
    strings: "Strings",
  };
  return (
    <div className="evidence-list">
      <h4>Evidence</h4>
      <ul>
        {entries.map((entry, index) => {
          const line = supportLine(entry);
          return (
            <li key={index}>
              {line.field === "source" ? (
                <button
                  className="evidence-source-link"
                  type="button"
                  onClick={onShowSource}
                >
                  Decompiled function at <code>{line.address}</code> · View
                  Source
                </button>
              ) : (
                <>
                  <span className="evidence-label">
                    {labels[line.field] || line.field}
                    {line.address && (
                      <>
                        {" "}
                        · <code>{line.address}</code>
                      </>
                    )}
                  </span>
                  <span>{line.value}</span>
                </>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function Proposal({
  finding,
  busy,
  onApply,
  onUndo,
  onShowSource,
}: {
  finding: Finding;
  busy: boolean;
  onApply: (id: string) => void;
  onUndo: (id: string) => void;
  onShowSource: () => void;
}) {
  const confidence = Number.isFinite(finding.confidence)
    ? finding.confidence <= 1
      ? finding.confidence * 100
      : finding.confidence
    : null;
  return (
    <article className="proposal">
      <div className="proposal-heading">
        <span className={`status-dot ${finding.status}`} />
        <span className="proposal-field">
          {finding.field === "name"
            ? "Proposed name"
            : `Proposed ${finding.field}`}
        </span>
        <span className="proposal-status">{finding.status}</span>
      </div>
      <div className="proposal-value">{finding.after}</div>
      {finding.role && (
        <div className="proposal-role">
          <span>Function role</span>
          <strong>{roleLabel(finding.role)}</strong>
        </div>
      )}
      {confidence !== null && (
        <div className="confidence">
          <div>
            <span>Confidence</span>
            <strong>{Math.round(confidence)}%</strong>
          </div>
          <meter
            min="0"
            max="100"
            value={Math.max(0, Math.min(100, confidence))}
            aria-label="Proposal confidence"
          />
        </div>
      )}
      {finding.evidence?.length > 0 && (
        <SupportList entries={finding.evidence} onShowSource={onShowSource} />
      )}
      <div className="proposal-actions">
        {finding.status === "proposed" || finding.status === "undone" ? (
          <button
            className="primary-button"
            type="button"
            disabled={busy}
            onClick={() => onApply(finding.id)}
          >
            <Icon name="check" /> Apply
          </button>
        ) : finding.status === "applied" ? (
          <button
            className="secondary-button"
            type="button"
            disabled={busy}
            onClick={() => onUndo(finding.id)}
          >
            <Icon name="undo" /> Undo
          </button>
        ) : null}
      </div>
    </article>
  );
}

export function Inspector({
  item,
  evidence,
  loading,
  findings,
  role,
  busy,
  configured,
  onApply,
  onUndo,
  onRename,
  onClassic,
  onShowSource,
  collapsed,
  onCollapse,
}: {
  item: FunctionItem | null;
  evidence: FunctionEvidence | null;
  loading: boolean;
  findings: Finding[];
  role: Role | null;
  busy: boolean;
  configured: boolean;
  onApply: (id: string) => void;
  onUndo: (id: string) => void;
  onRename: (address: string, name: string) => Promise<string | null>;
  onClassic: (address: string) => void;
  onShowSource: () => void;
  collapsed: boolean;
  onCollapse: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState("");
  const [renameError, setRenameError] = useState<string | null>(null);
  useEffect(() => {
    setName(item?.name ?? "");
    setEditing(false);
    setRenameError(null);
  }, [item?.address, item?.name]);
  return (
    <aside
      className={`inspector ${collapsed ? "is-collapsed" : ""}`}
      aria-label="Function inspector"
    >
      <div className="inspector-heading">
        <h2>Function inspector</h2>
        <button
          className="icon-button"
          onClick={onCollapse}
          type="button"
          aria-label={collapsed ? "Show inspector" : "Hide inspector"}
        >
          <Icon name={collapsed ? "menu" : "close"} />
        </button>
      </div>
      {!collapsed &&
        (item ? (
          <div className="inspector-scroll" key={item.address}>
            <div className="inspector-identity">
              <div className="identity-title">
                <h3>{item.name}</h3>
                <div className="identity-actions">
                  <button
                    className="text-button"
                    type="button"
                    onClick={() => {
                      setEditing(!editing);
                      setName(item.name);
                      setRenameError(null);
                    }}
                  >
                    {editing ? "Cancel" : "Rename"}
                  </button>
                  <button
                    className="icon-button"
                    type="button"
                    onClick={() => onClassic(item.address)}
                    title="Open in Classic"
                    aria-label="Open selected function in Classic"
                  >
                    <Icon name="classic" />
                  </button>
                </div>
              </div>
              <code>{item.address}</code>
              <p>{item.signature}</p>
              {editing && (
                <form
                  className="rename-form"
                  onSubmit={async (event) => {
                    event.preventDefault();
                    const trimmed = name.trim();
                    if (!trimmed || trimmed === item.name) return setEditing(false);
                    const failure = /\s/.test(trimmed)
                      ? "Names cannot contain spaces. Use letters, digits and underscores."
                      : /^\d/.test(trimmed)
                        ? "A name cannot start with a digit."
                        : await onRename(item.address, trimmed);
                    setRenameError(failure);
                    if (!failure) setEditing(false);
                  }}
                >
                  <input
                    aria-label="New function name"
                    value={name}
                    onChange={(event) => {
                      setName(event.target.value);
                      setRenameError(null);
                    }}
                    aria-invalid={renameError ? true : undefined}
                    autoFocus
                  />
                  <button
                    className="secondary-button"
                    type="submit"
                    disabled={busy || !name.trim()}
                  >
                    Save name
                  </button>
                  {renameError && (
                    <p className="field-error" role="alert">
                      {renameError}
                    </p>
                  )}
                </form>
              )}
            </div>
            {role && findings.length === 0 && (
              <div className="inspector-section">
                <h4>Function role</h4>
                <div className="role-summary">
                  <strong>{roleLabel(role.role)}</strong>
                  <span>
                    {Math.round(
                      (role.confidence <= 1
                        ? role.confidence * 100
                        : role.confidence) || 0,
                    )}
                    % confidence
                  </span>
                </div>
                {role.evidence?.length > 0 && (
                  <SupportList
                    entries={role.evidence}
                    onShowSource={onShowSource}
                  />
                )}
              </div>
            )}
            <div className="inspector-section">
              <div className="section-title">
                <h4>Analysis proposals</h4>
                <span className="quiet-count">{findings.length}</span>
              </div>
              {findings.length ? (
                findings.map((finding) => (
                  <Proposal
                    key={finding.id}
                    finding={finding}
                    busy={busy}
                    onApply={onApply}
                    onUndo={onUndo}
                    onShowSource={onShowSource}
                  />
                ))
              ) : (
                <p className="muted-copy">
                  {loading
                    ? "Loading evidence…"
                    : !configured
                      ? "Add a TypeSafe API key in Model settings to get proposals."
                    : role
                      ? "No name change proposed. The model kept the current name."
                      : "No proposals for this function yet."}
                </p>
              )}
            </div>
            <div className="inspector-section">
              <h4>Code evidence</h4>
              {loading ? (
                <p className="muted-copy">Loading evidence…</p>
              ) : evidence ? (
                <>
                  <dl className="detail-list">
                    <div>
                      <dt>Return type</dt>
                      <dd>{evidence.returnType || "Unknown"}</dd>
                    </div>
                    <div>
                      <dt>Parameters</dt>
                      <dd>{evidence.parameterCount ?? 0}</dd>
                    </div>
                    <div>
                      <dt>Size</dt>
                      <dd>{evidence.size ?? "Unknown"} bytes</dd>
                    </div>
                  </dl>
                  {evidence.calledNames?.length ? (
                    <div className="evidence-list">
                      <h4>Calls</h4>
                      <ul>
                        {evidence.calledNames.map((value, index) => (
                          <li key={index}>{value}</li>
                        ))}
                      </ul>
                    </div>
                  ) : null}
                  {evidence.strings?.length ? (
                    <div className="evidence-list">
                      <h4>Strings</h4>
                      <ul>
                        {evidence.strings.map((value, index) => (
                          <li key={index}>{evidenceText(value)}</li>
                        ))}
                      </ul>
                    </div>
                  ) : null}
                </>
              ) : (
                <p className="muted-copy">Evidence is unavailable.</p>
              )}
            </div>
          </div>
        ) : (
          <div className="inspector-empty">
            Select a function to inspect its evidence and proposed changes.
          </div>
        ))}
    </aside>
  );
}
