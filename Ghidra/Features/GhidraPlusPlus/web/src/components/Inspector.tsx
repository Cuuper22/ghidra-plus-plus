import { useEffect, useMemo, useState } from "react";
import type { EvidenceEntry, Finding, FunctionEvidence, FunctionItem, Role } from "../types";
import {
  inputsText,
  isStart,
  isUnnamed,
  returnsText,
  roleInfo,
  sureness,
} from "../describe";
import { Icon } from "./Icon";

const statusWords: Record<Finding["status"], string> = {
  proposed: "Suggestion",
  applied: "In use",
  undone: "Undone",
  rejected: "Out of date",
};

function entryText(entry: EvidenceEntry): string {
  if (typeof entry === "string") return entry;
  return entry.text ?? JSON.stringify(entry);
}

/** Turns an evidence line such as "140001000 strings: [...]" into a reader-facing label and value. */
function reason(entry: EvidenceEntry): { label: string; value: string } {
  const text = entryText(entry);
  const match = /^\S+\s+(signature|calledNames|strings|source):\s*([\s\S]*)$/.exec(text);
  if (!match) return { label: "Evidence", value: text };
  const [, field, raw] = match;
  const labels: Record<string, string> = {
    signature: "Inputs and result",
    calledNames: "Calls",
    strings: "Text inside",
    source: "Rebuilt code",
  };
  if (field === "source") return { label: labels.source, value: "" };
  const truncated = raw.endsWith(" [truncated]");
  const body = truncated ? raw.slice(0, -12) : raw;
  let value: string;
  try {
    const decoded: unknown = JSON.parse(body);
    value = Array.isArray(decoded) ? decoded.map(String).join(", ") : String(decoded);
  } catch {
    value = body.replace(/^\[|\]$/g, "").replace(/^"|"$/g, "").replace(/","/g, ", ");
  }
  return { label: labels[field], value: `${value}${truncated ? "…" : ""}` };
}

function Suggestion({
  finding,
  busy,
  onApply,
  onUndo,
  onShowCode,
}: {
  finding: Finding;
  busy: boolean;
  onApply: (id: string) => void;
  onUndo: (id: string) => void;
  onShowCode: () => void;
}) {
  const value = finding.confidence <= 1 ? finding.confidence : finding.confidence / 100;
  const sure = sureness(value);
  return (
    <article className={`proposal ${finding.status}`}>
      <div className="proposal-value">{finding.after}</div>
      <p className="sureness">
        <span className={`sure-badge ${sure.level}`}>{sure.word}</span>
        <span>
          {Math.round(value * 100)}% sure · {statusWords[finding.status]}
        </span>
      </p>
      {finding.status === "rejected" && (
        <p className="muted-copy">
          The code changed after this suggestion, so it was set aside. Click
          Describe functions for a fresh one.
        </p>
      )}
      <div className="proposal-actions">
        {finding.status === "proposed" || finding.status === "undone" ? (
          <button
            className="primary-button"
            type="button"
            disabled={busy}
            onClick={() => onApply(finding.id)}
          >
            <Icon name="check" /> Use this name
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
      {finding.evidence?.length > 0 && (
        <details className="why">
          <summary>Why this name?</summary>
          <ul>
            {finding.evidence.map((entry, index) => {
              const line = reason(entry);
              return (
                <li key={index}>
                  <strong>{line.label}</strong>{" "}
                  {line.label === "Rebuilt code" ? (
                    <button type="button" className="text-button inline" onClick={onShowCode}>
                      View the code
                    </button>
                  ) : (
                    line.value
                  )}
                </li>
              );
            })}
          </ul>
        </details>
      )}
    </article>
  );
}

function FunctionLinks({
  title,
  addresses,
  names,
  byAddress,
  empty,
  onSelect,
}: {
  title: string;
  addresses: string[] | undefined;
  names?: string[];
  byAddress: Map<string, FunctionItem>;
  empty: string;
  onSelect: (address: string) => void;
}) {
  const links = addresses ?? [];
  return (
    <div className="fact-group">
      <h5>{title}</h5>
      {links.length ? (
        <div className="chips">
          {links.map((address, index) => {
            const target = byAddress.get(address);
            return target ? (
              <button
                key={address}
                type="button"
                className="chip-button"
                onClick={() => onSelect(address)}
                title={`Open ${target.name}`}
              >
                {target.name}
              </button>
            ) : (
              <span key={address} className="chip" title="Outside this program, for example in a system library">
                {names?.[index] ?? address}
              </span>
            );
          })}
        </div>
      ) : (
        <p className="muted-copy">{empty}</p>
      )}
    </div>
  );
}

export function Inspector({
  item,
  functions,
  evidence,
  loading,
  findings,
  role,
  busy,
  configured,
  analyzing,
  showTips,
  onApply,
  onUndo,
  onRename,
  onOpenInGhidra,
  onSelect,
  onShowCode,
  onOpenSettings,
  onDescribe,
  collapsed,
  onCollapse,
}: {
  item: FunctionItem | null;
  functions: FunctionItem[];
  evidence: FunctionEvidence | null;
  loading: boolean;
  findings: Finding[];
  role: Role | null;
  busy: boolean;
  configured: boolean;
  analyzing: boolean;
  showTips: boolean;
  onApply: (id: string) => void;
  onUndo: (id: string) => void;
  onRename: (address: string, name: string) => Promise<string | null>;
  onOpenInGhidra: (address: string) => void;
  onSelect: (address: string) => void;
  onShowCode: () => void;
  onOpenSettings: () => void;
  onDescribe: () => void;
  collapsed: boolean;
  onCollapse: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState("");
  const [renameError, setRenameError] = useState<string | null>(null);
  const byAddress = useMemo(
    () => new Map(functions.map((value) => [value.address, value])),
    [functions],
  );
  useEffect(() => {
    setName(item?.name ?? "");
    setEditing(false);
    setRenameError(null);
  }, [item?.address, item?.name]);
  const info = roleInfo(role);
  // Ghidra lists each string as "address: text"; readers only need the text.
  const strings = (evidence?.strings ?? [])
    .map(entryText)
    .filter((value) => !value.startsWith("[Ghidra++"))
    .map((value) => /^([0-9a-f]+): ([\s\S]*)$/i.exec(value) ?? [value, "", value]);
  return (
    <aside
      className={`inspector ${collapsed ? "is-collapsed" : ""}`}
      aria-label="About this function"
    >
      <div className="inspector-heading">
        <h2>About this function</h2>
        <button
          className="icon-button"
          onClick={onCollapse}
          type="button"
          aria-label={collapsed ? "Show details" : "Hide details"}
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
              </div>
              <p className="identity-address">
                At address <code>{item.address}</code>
                {isStart(item.name) && " · the program starts here"}
              </p>
              {showTips && isUnnamed(item.name) && !editing && (
                <p className="tip-inline">
                  Ghidra made up this name from the address. Rename it once you
                  know what it does.
                </p>
              )}
              {editing && (
                <form
                  className="rename-form"
                  onSubmit={async (event) => {
                    event.preventDefault();
                    const trimmed = name.trim();
                    if (!trimmed || trimmed === item.name) return setEditing(false);
                    const failure = /\s/.test(trimmed)
                      ? "Use letters, digits and underscores, with no spaces. Example: read_settings"
                      : /^\d/.test(trimmed)
                        ? "A name cannot start with a digit. Example: step2_check"
                        : await onRename(item.address, trimmed);
                    setRenameError(failure);
                    if (!failure) setEditing(false);
                  }}
                >
                  <label htmlFor="new-function-name">New name</label>
                  <input
                    id="new-function-name"
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
              <button
                className="link-button"
                type="button"
                onClick={() => onOpenInGhidra(item.address)}
                title="Opens the classic Ghidra window on this function, for deeper work"
              >
                <Icon name="external" /> Open in full Ghidra
              </button>
            </div>
            <section className="inspector-section">
              <h4>What it does</h4>
              {info?.known ? (
                <>
                  <p className={`plain-description ${info.sure.level}`}>
                    {info.sure.level === "low" && <strong>Best guess: </strong>}
                    {info.sentence}
                  </p>
                  <p className="sureness">
                    <span className={`sure-badge ${info.sure.level}`}>
                      {info.sure.word}
                    </span>
                    <span>
                      {info.label} · {info.percent}% sure
                    </span>
                  </p>
                  {showTips && (
                    <p className="tip-inline">
                      TypeSafe chose this by reading the rebuilt code. Treat
                      it as a hint and check it in the Code tab.
                    </p>
                  )}
                </>
              ) : info ? (
                <p className="muted-copy">{info.sentence}</p>
              ) : !configured ? (
                <p className="muted-copy">
                  Add a TypeSafe key to get a one-line description of each
                  function.{" "}
                  <button type="button" className="text-button inline" onClick={onOpenSettings}>
                    Add a key
                  </button>
                </p>
              ) : analyzing ? (
                <p className="muted-copy">Describing functions now…</p>
              ) : (
                <p className="muted-copy">
                  Not described yet.{" "}
                  <button type="button" className="text-button inline" onClick={onDescribe}>
                    Describe functions
                  </button>
                </p>
              )}
            </section>
            {findings.length > 0 && (
              <section className="inspector-section">
                <h4>Suggested name</h4>
                {findings.map((finding) => (
                  <Suggestion
                    key={finding.id}
                    finding={finding}
                    busy={busy}
                    onApply={onApply}
                    onUndo={onUndo}
                    onShowCode={onShowCode}
                  />
                ))}
              </section>
            )}
            <section className="inspector-section">
              <h4>Facts from Ghidra</h4>
              {loading ? (
                <p className="muted-copy">Loading…</p>
              ) : evidence ? (
                <>
                  <ul className="fact-list">
                    <li>{inputsText(evidence.parameterCount)}</li>
                    <li>{returnsText(evidence.returnType)}</li>
                    <li>{(evidence.size ?? 0).toLocaleString()} bytes of machine code</li>
                  </ul>
                  <FunctionLinks
                    title="Uses"
                    addresses={evidence.callees}
                    names={evidence.calledNames}
                    byAddress={byAddress}
                    empty="Does not call other functions."
                    onSelect={onSelect}
                  />
                  <FunctionLinks
                    title="Used by"
                    addresses={evidence.callers}
                    byAddress={byAddress}
                    empty="Nothing in this program calls it directly."
                    onSelect={onSelect}
                  />
                  {strings.length > 0 && (
                    <div className="fact-group">
                      <h5>Text inside</h5>
                      <ul className="text-list">
                        {strings.map(([, address, value], index) => (
                          <li key={index} title={address ? `At address ${address}` : undefined}>
                            “{value}”
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  <div className="fact-group">
                    <h5>Ghidra’s signature</h5>
                    <code className="signature">{item.signature}</code>
                  </div>
                </>
              ) : (
                <p className="muted-copy">Ghidra has no details for this function.</p>
              )}
            </section>
          </div>
        ) : (
          <div className="inspector-empty">
            Pick a function on the left to see what it does.
          </div>
        ))}
    </aside>
  );
}
