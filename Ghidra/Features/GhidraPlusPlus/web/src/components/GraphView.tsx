import { useEffect, useMemo, useRef, useState } from "react";
import type { Edge, FunctionItem } from "../types";
import { Icon } from "./Icon";

type Node = { item: FunctionItem; x: number; y: number; level: number };

function layout(
  functions: FunctionItem[],
  edges: Edge[],
  selected: string,
  query: string,
): {
  nodes: Node[];
  edges: Edge[];
  width: number;
  height: number;
  total: number;
} {
  const byAddress = new Map(functions.map((item) => [item.address, item]));
  const all = new Set<string>();
  const term = query.toLowerCase().trim();
  if (term)
    functions.forEach((item) => {
      if (`${item.name} ${item.address}`.toLowerCase().includes(term))
        all.add(item.address);
    });
  else all.add(selected);
  const levels = new Map<string, number>();
  for (const address of all) levels.set(address, 0);
  // Two steps in either direction keep the local call structure readable.
  if (!term)
    for (let step = 1; step <= 2; step++) {
      for (const edge of edges) {
        if (levels.get(edge.to) === -(step - 1) && !levels.has(edge.from))
          levels.set(edge.from, -step);
        if (levels.get(edge.from) === step - 1 && !levels.has(edge.to))
          levels.set(edge.to, step);
      }
    }
  const groups = new Map<number, FunctionItem[]>();
  for (const [address, level] of levels) {
    const item = byAddress.get(address);
    if (!item) continue;
    const group = groups.get(level) ?? [];
    group.push(item);
    groups.set(level, group);
  }
  const sortedLevels = [...groups.keys()].sort((a, b) => a - b);
  const maxGroup = Math.max(
    1,
    ...[...groups.values()].map((group) => group.length),
  );
  const width = Math.max(720, maxGroup * 230 + 80);
  const height = Math.max(520, sortedLevels.length * 166 + 80);
  const nodes: Node[] = [];
  sortedLevels.forEach((level, row) => {
    const group = groups.get(level)!;
    group.sort((a, b) => a.address.localeCompare(b.address));
    group.forEach((item, index) =>
      nodes.push({
        item,
        level,
        x: width / 2 + (index - (group.length - 1) / 2) * 230,
        y: 86 + row * 166,
      }),
    );
  });
  const visible = new Set(nodes.map((node) => node.item.address));
  return {
    nodes,
    edges: edges.filter(
      (edge) => visible.has(edge.from) && visible.has(edge.to),
    ),
    width,
    height,
    total: functions.length,
  };
}

export function GraphView({
  functions,
  edges,
  selected,
  onSelect,
}: {
  functions: FunctionItem[];
  edges: Edge[];
  selected: string;
  onSelect: (address: string) => void;
}) {
  const [query, setQuery] = useState("");
  const graph = useMemo(
    () => layout(functions, edges, selected, query),
    [functions, edges, selected, query],
  );
  const scroller = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const node = graph.nodes.find((value) => value.item.address === selected);
    const area = scroller.current;
    if (node && area)
      area.scrollTo({
        left: node.x - area.clientWidth / 2,
        top: node.y - area.clientHeight / 2,
      });
    // Recenter only when the user changes the selection or the filter.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected, query]);
  const positions = new Map(
    graph.nodes.map((node) => [node.item.address, node]),
  );
  return (
    <div className="graph-view">
      <div className="graph-controls">
        <label className="graph-search">
          <Icon name="search" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Filter graph"
            aria-label="Filter graph"
          />
        </label>
        <span>
          {query
            ? `${graph.nodes.length.toLocaleString()} matching functions`
            : `${graph.nodes.length.toLocaleString()} nearby of ${graph.total.toLocaleString()} functions`}
        </span>
      </div>
      <div className="graph-scroll" aria-label="Call graph" ref={scroller}>
        <svg
          width={graph.width}
          height={graph.height}
          viewBox={`0 0 ${graph.width} ${graph.height}`}
          role="group"
          aria-label="Call graph. Select a function node to inspect it."
        >
          <defs>
            <marker
              id="arrow"
              viewBox="0 0 10 10"
              refX="8"
              refY="5"
              markerWidth="5"
              markerHeight="5"
              orient="auto-start-reverse"
            >
              <path
                d="M0 0 10 5 0 10"
                fill="none"
                stroke="#4c9cc4"
                strokeWidth="1.6"
              />
            </marker>
          </defs>
          {graph.edges.map((edge, index) => {
            const from = positions.get(edge.from)!;
            const to = positions.get(edge.to)!;
            const startY = from.y + 29;
            const endY = to.y - 29;
            const mid = (startY + endY) / 2;
            return (
              <path
                key={`${edge.from}-${edge.to}-${index}`}
                className="graph-edge"
                d={`M ${from.x} ${startY} C ${from.x} ${mid}, ${to.x} ${mid}, ${to.x} ${endY}`}
                markerEnd="url(#arrow)"
              />
            );
          })}
          {graph.nodes.map((node) => (
            <g
              key={node.item.address}
              className={`graph-node ${node.item.address === selected ? "selected" : ""}`}
              transform={`translate(${node.x - 94} ${node.y - 29})`}
              role="button"
              tabIndex={0}
              aria-label={`${node.item.name}, address ${node.item.address}`}
              onClick={() => onSelect(node.item.address)}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  onSelect(node.item.address);
                }
              }}
            >
              <title>{node.item.name}</title>
              <rect width="188" height="58" rx="7" />
              <text x="12" y="22" className="node-name">
                {node.item.name.length > 21
                  ? `${node.item.name.slice(0, 20)}…`
                  : node.item.name}
              </text>
              <text x="12" y="43" className="node-address">
                {node.item.address}
              </text>
            </g>
          ))}
        </svg>
        {graph.nodes.length === 0 && (
          <p className="graph-empty">No functions match this filter.</p>
        )}
      </div>
    </div>
  );
}
