import { useEffect, useMemo, useRef, useState } from "react";
import { Icon } from "./Icon";
import { isStart, type RoleLabel } from "../describe";
import type { FunctionItem } from "../types";

export function FunctionRail({
  functions,
  roleLabels,
  suggested,
  selected,
  onSelect,
  collapsed,
  onCollapse,
  showTips,
}: {
  functions: FunctionItem[];
  roleLabels: Map<string, RoleLabel>;
  suggested: Set<string>;
  selected: string | null;
  onSelect: (address: string) => void;
  collapsed: boolean;
  onCollapse: () => void;
  showTips: boolean;
}) {
  const [query, setQuery] = useState("");
  const list = useRef<HTMLDivElement>(null);
  const matches = useMemo(() => {
    const term = query.toLowerCase().trim();
    // The start function comes first so newcomers know where to begin.
    return functions
      .filter((item) =>
        `${item.name} ${item.address} ${roleLabels.get(item.address)?.label ?? ""}`
          .toLowerCase()
          .includes(term),
      )
      .sort((a, b) => Number(isStart(b.name)) - Number(isStart(a.name)));
  }, [functions, roleLabels, query]);
  useEffect(() => {
    list.current
      ?.querySelector(".function-row.selected")
      ?.scrollIntoView({ block: "nearest" });
  }, [selected]);
  return (
    <aside
      className={`function-rail ${collapsed ? "is-collapsed" : ""}`}
      aria-label="Functions"
    >
      <div className="rail-heading">
        <div>
          <h2>Functions</h2>
          <span className="quiet-count">
            {functions.length.toLocaleString()}
          </span>
        </div>
        <button
          className="icon-button rail-collapse"
          type="button"
          onClick={onCollapse}
          aria-label={collapsed ? "Show functions" : "Hide functions"}
        >
          <Icon name={collapsed ? "menu" : "close"} />
        </button>
      </div>
      {!collapsed && (
        <>
          {showTips && (
            <p className="rail-tip">
              Each function does one job. Start with the one marked Start.
            </p>
          )}
          <label className="rail-search">
            <Icon name="search" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search by name or job"
              aria-label="Search functions"
            />
          </label>
          <div className="function-list" role="listbox" aria-label="Functions" ref={list}>
            {matches.length ? (
              matches.map((item) => {
                const role = roleLabels.get(item.address);
                return (
                  <button
                    key={item.address}
                    className={`function-row ${item.address === selected ? "selected" : ""}`}
                    role="option"
                    aria-selected={item.address === selected}
                    type="button"
                    onClick={() => onSelect(item.address)}
                    title={item.signature}
                  >
                    <span className="function-name">
                      <strong>{item.name}</strong>
                      {isStart(item.name) && (
                        <span className="start-badge">Start</span>
                      )}
                      {suggested.has(item.address) && (
                        <span className="suggested-mark" title="Has a suggested name">
                          <Icon name="spark" size={14} />
                          <span className="sr-only">Has a suggested name</span>
                        </span>
                      )}
                    </span>
                    <span className="function-meta">
                      {role && (
                        <span
                          className={`role-chip ${role.level}`}
                          title={role.level === "low" ? "Not sure" : undefined}
                        >
                          {role.label}
                          {role.level === "low" ? "?" : ""}
                        </span>
                      )}
                      <code>{item.address}</code>
                    </span>
                  </button>
                );
              })
            ) : (
              <p className="no-results">No functions match “{query}”.</p>
            )}
          </div>
          <div className="rail-footer">
            {query
              ? `${matches.length.toLocaleString()} of ${functions.length.toLocaleString()} shown`
              : `${functions.length.toLocaleString()} functions`}
          </div>
        </>
      )}
    </aside>
  );
}
