import { useState } from "react";
import { Icon } from "./Icon";

const orders = [
  { value: "hybrid", label: "Mixed (recommended)", hint: "Alternates between the busiest functions and address order." },
  { value: "dynamic", label: "Busiest first", hint: "Starts with the functions that are connected to the most others." },
  { value: "fixed", label: "Address order", hint: "Goes through the program from beginning to end." },
];
const details = [
  { value: "balanced", label: "Normal (recommended)", hint: "Sends a medium-length excerpt of each function." },
  { value: "fast", label: "Quick look", hint: "Describes only the first 40 functions, using short excerpts." },
  { value: "exhaustive", label: "Thorough", hint: "Sends longer excerpts. Slower, and sends more text to TypeSafe." },
];

export function SettingsDialog({
  configured,
  busy,
  mode,
  depth,
  onMode,
  onDepth,
  onClose,
  onSave,
}: {
  configured: boolean;
  busy: boolean;
  mode: string;
  depth: string;
  onMode: (value: string) => void;
  onDepth: (value: string) => void;
  onClose: () => void;
  onSave: (key: string) => Promise<boolean>;
}) {
  const [key, setKey] = useState("");
  return (
    <div
      className="dialog-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        className="dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="settings-title"
      >
        <div className="dialog-heading">
          <h2 id="settings-title">Settings</h2>
          <button
            type="button"
            className="icon-button"
            onClick={onClose}
            aria-label="Close settings"
          >
            <Icon name="close" />
          </button>
        </div>
        <h3>Descriptions and name suggestions</h3>
        <p>
          Ghidra++ can ask TypeSafe, an online service, to say what each
          function does and to suggest a name when one fits. It sends short
          excerpts of the rebuilt code and the text found in each function. The
          program file itself stays on this computer.
        </p>
        <div className="setting-state">
          <Icon name="key" />{" "}
          {configured ? "A key is set for this session." : "No key yet."}
        </div>
        <form
          onSubmit={async (event) => {
            event.preventDefault();
            if (!key.trim()) return;
            if (await onSave(key.trim())) setKey("");
          }}
        >
          <label htmlFor="model-key">TypeSafe API key</label>
          <input
            id="model-key"
            type="password"
            value={key}
            onChange={(event) => setKey(event.target.value)}
            autoComplete="off"
            placeholder={configured ? "Paste a different key" : "Paste your key"}
            autoFocus
          />
          <p className="field-hint">
            Ghidra++ keeps the key only while it is running and never saves it
            in your project. Get a key at{" "}
            <a href="https://typesafe.ai/" target="_blank" rel="noreferrer">
              typesafe.ai
            </a>
            .
          </p>
          <div className="dialog-actions">
            <button className="secondary-button" type="button" onClick={onClose}>
              Close
            </button>
            <button
              className="primary-button"
              type="submit"
              disabled={busy || !key.trim()}
            >
              Save key
            </button>
          </div>
        </form>
        <details className="advanced">
          <summary>Advanced: how functions get described</summary>
          <label htmlFor="describe-order">Order</label>
          <select id="describe-order" value={mode} onChange={(event) => onMode(event.target.value)}>
            {orders.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          <p className="field-hint">{orders.find((option) => option.value === mode)?.hint}</p>
          <label htmlFor="describe-detail">Detail</label>
          <select id="describe-detail" value={depth} onChange={(event) => onDepth(event.target.value)}>
            {details.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          <p className="field-hint">{details.find((option) => option.value === depth)?.hint}</p>
        </details>
      </div>
    </div>
  );
}
