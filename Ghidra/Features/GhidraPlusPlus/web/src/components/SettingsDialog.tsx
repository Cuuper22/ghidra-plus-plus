import { useState } from "react";
import { Icon } from "./Icon";

export function SettingsDialog({
  configured,
  busy,
  onClose,
  onSave,
}: {
  configured: boolean;
  busy: boolean;
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
          <h2 id="settings-title">Model settings</h2>
          <button
            type="button"
            className="icon-button"
            onClick={onClose}
            aria-label="Close settings"
          >
            <Icon name="close" />
          </button>
        </div>
        <p>
          Semantic analysis uses a TypeSafe model key. The key stays in this
          Ghidra++ session and is never saved in the project.
        </p>
        <div className="setting-state">
          <Icon name="key" />{" "}
          {configured ? "Key configured for this session" : "No key configured"}
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
            placeholder={configured ? "Enter a replacement key" : "Enter key"}
            autoFocus
          />
          <div className="dialog-actions">
            <button
              className="secondary-button"
              type="button"
              onClick={onClose}
            >
              Cancel
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
      </div>
    </div>
  );
}
