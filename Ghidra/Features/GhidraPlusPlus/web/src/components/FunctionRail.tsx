import { useMemo, useState } from "react";
import { Icon } from "./Icon";
import type { FunctionItem } from "../types";

export function FunctionRail({
  functions,
  selected,
  onSelect,
  collapsed,
  onCollapse,
}: {
  functions: FunctionItem[];
  selected: string | null;
  onSelect: (address: string) => void;
  collapsed: boolean;
  onCollapse: () => void;
}) {
  const [query, setQuery] = useState("");
  const matches = useMemo(
    () =>
      functions.filter((item) =>
        `${item.name} ${item.address} ${item.signature}`
          .toLowerCase()
          .includes(query.toLowerCase().trim()),
      ),
    [functions, query],
  );
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
          <label className="rail-search">
            <Icon name="search" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search name or address"
              aria-label="Search functions"
            />
          </label>
          <div className="rail-columns">
            <span>Address</span>
            <span>Name</span>
          </div>
          <div className="function-list" role="listbox" aria-label="Functions">
            {matches.length ? (
              matches.map((item) => (
                <button
                  key={item.address}
                  className={`function-row ${item.address === selected ? "selected" : ""}`}
                  role="option"
                  aria-selected={item.address === selected}
                  type="button"
                  onClick={() => onSelect(item.address)}
                  title={item.signature}
                >
                  <span>{item.address}</span>
                  <strong>{item.name}</strong>
                </button>
              ))
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
