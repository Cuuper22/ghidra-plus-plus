import type { FunctionEvidence, Snapshot } from "./types";

const tokenKey = "ghidra-plus-plus-session-token";

export function sessionToken(): string | null {
  const hash = location.hash.slice(1);
  const fragment = new URLSearchParams(hash);
  const incoming = fragment.get("token") || (!hash.includes("=") ? hash : null);
  if (incoming) {
    sessionStorage.setItem(tokenKey, incoming);
    history.replaceState(null, "", location.pathname + location.search);
    return incoming;
  }
  return sessionStorage.getItem(tokenKey);
}

const token = sessionToken();

async function request(
  path: string,
  init: RequestInit = {},
): Promise<Response> {
  if (!token)
    throw new Error(
      "Connection link is missing its session token. Open Ghidra++ from the desktop app again.",
    );
  const headers = new Headers(init.headers);
  headers.set("X-Ghidra-Token", token);
  const response = await fetch(`/api${path}`, { ...init, headers }).catch(
    () => {
      throw new Error(
        "Ghidra++ is not responding. Check that it is still running.",
      );
    },
  );
  if (!response.ok) {
    let message = `Request failed (${response.status})`;
    try {
      message =
        ((await response.json()) as { error?: string }).error || message;
    } catch {
      /* non-JSON response */
    }
    throw new Error(message);
  }
  return response;
}

export const api = {
  connected: Boolean(token),
  async snapshot() {
    return (await (await request("/project")).json()) as Snapshot;
  },
  async function(address: string) {
    return (await (
      await request(`/functions/${encodeURIComponent(address)}`)
    ).json()) as FunctionEvidence;
  },
  async import(file: File) {
    const response = await request("/import", {
      method: "POST",
      headers: {
        "X-Filename": encodeURIComponent(file.name),
        "Content-Type": "application/octet-stream",
      },
      body: file,
    });
    return response;
  },
  async command(path: string, body?: unknown) {
    return request(path, {
      method: "POST",
      headers:
        body === undefined ? undefined : { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  },
  async download(path: "/export/source" | "/export/project", filename: string) {
    const response = await request(path);
    const url = URL.createObjectURL(await response.blob());
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  },
};
