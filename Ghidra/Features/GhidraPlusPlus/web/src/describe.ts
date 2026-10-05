import type { Role } from "./types";

export type RoleLabel = { label: string; level: "high" | "medium" | "low" };

/** Plain-language wording for the engine's role labels, for readers new to reverse engineering. */
const roles: Record<string, { label: string; sentence: string }> = {
  unknown: { label: "Unclear", sentence: "The code does not show clearly what this function is for." },
  initialization: { label: "Sets up", sentence: "Prepares something: fills in starting values or gets memory ready." },
  input: { label: "Reads input", sentence: "Reads data coming into the program, such as a file or what a user typed." },
  output: { label: "Writes output", sentence: "Sends data out of the program, such as text on screen or a file." },
  parsing: { label: "Reads text", sentence: "Turns text or raw data into values the program can work with." },
  validation: { label: "Checks values", sentence: "Checks whether a value is acceptable, or keeps it inside limits." },
  encoding: { label: "Transforms data", sentence: "Converts data into another form, for example by encoding or scrambling it." },
  decoding: { label: "Decodes data", sentence: "Turns encoded or compressed data back into its original form." },
  memory: { label: "Handles memory", sentence: "Reserves, copies, clears, or frees a block of memory." },
  comparison: { label: "Compares", sentence: "Compares two things and reports whether they match." },
  dispatch: { label: "Directs work", sentence: "Decides which other function should handle a task." },
  network: { label: "Network", sentence: "Talks to other computers over a network." },
  logging: { label: "Logs", sentence: "Writes messages that record what the program is doing." },
  arithmetic: { label: "Calculates", sentence: "Does math to work out a value." },
  checksum: { label: "Checksum", sentence: "Combines bytes into one number, often used to spot changed or damaged data." },
  search: { label: "Searches", sentence: "Looks through data to find or count something." },
};

export function roleInfo(role: Role | null | undefined) {
  if (!role) return null;
  const text = roles[role.role] ?? roles.unknown;
  const value = role.confidence <= 1 ? role.confidence : role.confidence / 100;
  return { ...text, known: role.role !== "unknown", sure: sureness(value), percent: Math.round(value * 100) };
}

/** TypeSafe's confidence is calibrated, so plain words map onto fixed bands. */
export function sureness(value: number): { word: string; level: "high" | "medium" | "low" } {
  if (value >= 0.85) return { word: "Very likely", level: "high" };
  if (value >= 0.6) return { word: "Probably", level: "medium" };
  return { word: "Not sure", level: "low" };
}

export function isStart(name: string): boolean {
  return /^(entry|main|wmain|WinMain|wWinMain|_start)$/.test(name);
}

export function isUnnamed(name: string): boolean {
  return /^(FUN|SUB|thunk_FUN)_[0-9a-f]+$/i.test(name);
}

export function inputsText(count: number | undefined): string {
  if (!count) return "Takes no inputs";
  return count === 1 ? "Takes 1 input" : `Takes ${count} inputs`;
}

export function returnsText(type: string | undefined): string {
  if (!type) return "Unknown result";
  if (type === "void") return "Gives nothing back";
  if (type.includes("*")) return `Gives back a memory address (${type})`;
  if (type === "bool") return "Gives back yes or no (bool)";
  if (/float|double/.test(type)) return `Gives back a decimal number (${type})`;
  const unknownBytes = /^undefined(\d+)$/.exec(type);
  if (unknownBytes) return `Gives back ${unknownBytes[1]} bytes Ghidra could not identify`;
  if (/^u?(int|long|longlong|short|char)$|^(byte|word|dword|qword|size_t)$/.test(type)) return `Gives back a number (${type})`;
  return `Gives back ${type}`;
}
