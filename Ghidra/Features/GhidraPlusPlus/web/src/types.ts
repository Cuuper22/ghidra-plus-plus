export type Program = {
  name: string;
  format: string;
  language: string;
  compiler: string;
  imageBase: string;
  sha256: string;
  path: string;
  projectPath: string;
};
export type FunctionItem = {
  address: string;
  name: string;
  signature: string;
  size: number;
  external: boolean;
  returnType: string;
  parameterCount: number;
};
export type Edge = { from: string; to: string };
export type EvidenceEntry =
  | string
  | { address?: string; text?: string; [key: string]: unknown };
export type Finding = {
  id: string;
  address: string;
  field: string;
  before: string;
  after: string;
  role: string;
  confidence: number;
  status: "proposed" | "applied" | "rejected" | "undone";
  evidence: EvidenceEntry[];
  model: string;
};
export type Analysis = {
  status: string;
  message: string;
  completed: number;
  total: number;
  depth: string;
  mode: string;
  error: string;
};
export type Role = {
  address: string;
  role: string;
  confidence: number;
  model: string;
  evidence: EvidenceEntry[];
};
export type Snapshot = {
  program: Program | null;
  functions: FunctionItem[];
  edges: Edge[];
  types: { name: string; length: number; kind: string }[];
  analysis: Analysis;
  findings: Finding[];
  roles: Role[];
  usage: { inputTokens: number; outputTokens: number; requests: number };
  configured: boolean;
};
export type FunctionEvidence = FunctionItem & {
  source?: string;
  instructions?: string | string[];
  strings?: EvidenceEntry[];
  calledNames?: string[];
  callers?: string[];
  callees?: string[];
  truncated?: boolean | Record<string, boolean>;
  sourceTruncated?: boolean;
  instructionsTruncated?: boolean;
  stringsTruncated?: boolean;
  role?: Role;
  findings?: Finding[];
};
