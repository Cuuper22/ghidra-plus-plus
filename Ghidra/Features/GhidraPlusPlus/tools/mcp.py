#!/usr/bin/env python3
"""Local stdio MCP adapter for a running Ghidra++ investigation workspace.

Set GHIDRAPLUS_URL to the URL printed by Ghidra++, or pass --url. The fragment's
session token is sent only to the loopback InvestigationServer as X-Ghidra-Token.
This process never launches programs or accepts arbitrary HTTP destinations.
"""

from __future__ import annotations

import argparse
import http.client
import json
import os
import re
import sys
from dataclasses import dataclass
from typing import Any
from urllib.parse import parse_qs, quote, urlsplit


LEGACY_VERSION = "2025-11-25"
MODERN_VERSION = "2026-07-28"
SERVER_INFO = {"name": "ghidraplus", "version": "0.1.0"}
MAX_LINE = 2 * 1024 * 1024
MAX_RESPONSE = 64 * 1024 * 1024


class InputError(ValueError):
    pass


class ApiError(RuntimeError):
    pass


@dataclass(frozen=True)
class Tool:
    name: str
    description: str
    method: str
    path: str
    schema: dict[str, Any]
    read_only: bool
    destructive: bool = False
    idempotent: bool = False
    open_world: bool = False

    def definition(self) -> dict[str, Any]:
        return {
            "name": self.name,
            "description": self.description,
            "inputSchema": self.schema,
            "annotations": {
                "readOnlyHint": self.read_only,
                "destructiveHint": self.destructive,
                "idempotentHint": self.idempotent,
                "openWorldHint": self.open_world,
            },
        }


def schema(properties: dict[str, Any] | None = None, required: tuple[str, ...] = ()) -> dict[str, Any]:
    return {"type": "object", "properties": properties or {}, "required": list(required), "additionalProperties": False}


ADDRESS = {"type": "string", "minLength": 1, "maxLength": 128, "description": "Function address from inspect_project"}
FINDING = {"type": "string", "pattern": "^[0-9a-fA-F-]{36}$", "description": "Finding ID from inspect_project"}
TOOLS = (
    Tool("inspect_project", "Read the open program: functions, call edges, types, analysis progress (analysis.status is idle, queued, importing, analyzing, paused, complete or error), findings (id, address, before, after, status proposed/applied/rejected/undone), roles, and usage.", "GET", "/api/project", schema(), True, idempotent=True),
    Tool("inspect_function", "Read one function by an address listed in inspect_project. The result is the function summary plus source (decompiled C), instructions, strings, calledNames, callers, callees, truncation flags, its role, and its findings.", "GET", "/api/functions/{address}", schema({"address": ADDRESS}, ("address",)), True, idempotent=True),
    Tool("start_analysis", "Start semantic analysis of the open program. It runs in the background: poll inspect_project until analysis.status is complete or error. This sends bounded decompiled evidence to the configured TypeSafe service.", "POST", "/api/analyze", schema({
        "depth": {"type": "string", "enum": ["fast", "balanced", "exhaustive"], "default": "balanced"},
        "mode": {"type": "string", "enum": ["fixed", "hybrid", "dynamic"], "default": "hybrid"},
    }), False, open_world=True),
    Tool("pause_analysis", "Pause semantic analysis at a task boundary; an import pauses after static analysis.", "POST", "/api/pause", schema(), False, idempotent=True),
    Tool("resume_analysis", "Resume paused semantic analysis.", "POST", "/api/resume", schema(), False, idempotent=True),
    Tool("rename_function", "Explicitly rename one function in the open Ghidra program. Use only when the user requested this name.", "POST", "/api/rename", schema({"address": ADDRESS, "name": {"type": "string", "minLength": 1, "maxLength": 255}}, ("address", "name")), False, destructive=True),
    Tool("apply_finding", "Apply one reviewed name proposal to the Ghidra program; stale proposals are rejected. Returns the updated finding.", "POST", "/api/findings/{findingId}/apply", schema({"findingId": FINDING}, ("findingId",)), False, destructive=True),
    Tool("undo_finding", "Undo one previously applied finding in the Ghidra program. Returns the updated finding.", "POST", "/api/findings/{findingId}/undo", schema({"findingId": FINDING}, ("findingId",)), False, destructive=True),
    Tool("save_project", "Save the current program and Ghidra++ investigation state to its Ghidra project.", "POST", "/api/save", schema(), False, idempotent=True),
    Tool("export_project", "Return the complete Ghidra++ analysis JSON for the open project.", "GET", "/api/export/project", schema(), True, idempotent=True),
    Tool("export_source", "Return the Ghidra decompiler's reconstructed C for the open program.", "GET", "/api/export/source", schema(), True, idempotent=True),
)
TOOL_BY_NAME = {tool.name: tool for tool in TOOLS}


def parse_workspace_url(value: str | None) -> tuple[int, str]:
    """Accept exactly the loopback workspace URL shape, without resolving DNS."""
    if not value:
        raise InputError("Set GHIDRAPLUS_URL or pass --url with the Ghidra++ workspace link.")
    if any(ord(character) < 33 for character in value):
        raise InputError("Invalid Ghidra++ workspace URL.")
    try:
        parsed = urlsplit(value)
        port = parsed.port
        fragments = parse_qs(parsed.fragment, strict_parsing=True)
    except ValueError as exc:
        raise InputError("Invalid Ghidra++ workspace URL.") from exc
    if (parsed.scheme != "http" or parsed.hostname != "127.0.0.1" or
            parsed.username is not None or parsed.password is not None or
            port is None or not 1 <= port <= 65535 or
            parsed.path not in ("", "/") or parsed.query or
            set(fragments) != {"token"} or len(fragments["token"]) != 1 or
            not re.fullmatch(r"[A-Za-z0-9_-]{32,128}", fragments["token"][0])):
        raise InputError("Expected a Ghidra++ link on http://127.0.0.1 with its #token fragment.")
    return port, fragments["token"][0]


def validate_arguments(tool: Tool, arguments: Any) -> dict[str, Any]:
    if not isinstance(arguments, dict):
        raise InputError("Tool arguments must be an object.")
    definition = tool.schema
    properties = definition["properties"]
    extra = set(arguments) - set(properties)
    if extra:
        raise InputError("Unknown argument: " + sorted(extra)[0])
    for name in definition["required"]:
        if name not in arguments:
            raise InputError("Missing required argument: " + name)
    result = dict(arguments)
    for name, prop in properties.items():
        if name not in result:
            if "default" in prop:
                result[name] = prop["default"]
            continue
        value = result[name]
        if prop["type"] == "string" and not isinstance(value, str):
            raise InputError(name + " must be a string.")
        if "minLength" in prop and len(value) < prop["minLength"]:
            raise InputError(name + " is too short.")
        if "maxLength" in prop and len(value) > prop["maxLength"]:
            raise InputError(name + " is too long.")
        if "enum" in prop and value not in prop["enum"]:
            raise InputError(name + " must be one of: " + ", ".join(prop["enum"]))
        if "pattern" in prop and not re.fullmatch(prop["pattern"], value):
            raise InputError(name + " has an invalid format.")
        if name == "address" and ("/" in value or "\\" in value or any(ord(c) < 32 for c in value)):
            raise InputError("address has an invalid format.")
        if name == "name" and (value != value.strip() or any(ord(c) < 32 for c in value)):
            raise InputError("name has an invalid format.")
    return result


class WorkspaceApi:
    def __init__(self, port: int, token: str):
        self.port = port
        self.token = token

    def request(self, method: str, path: str, body: dict[str, Any] | None = None) -> Any:
        connection = http.client.HTTPConnection("127.0.0.1", self.port, timeout=30)
        headers = {
            "X-Ghidra-Token": self.token,
            "Origin": f"http://127.0.0.1:{self.port}",
            "Accept": "application/json, text/plain",
        }
        payload = None
        if method == "POST":
            payload = json.dumps(body or {}, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
            headers["Content-Type"] = "application/json; charset=utf-8"
        try:
            connection.request(method, path, body=payload, headers=headers)
            response = connection.getresponse()
            data = response.read(MAX_RESPONSE + 1)
            if len(data) > MAX_RESPONSE:
                raise ApiError("Ghidra++ response is too large for this MCP adapter (64 MB limit).")
            text = data.decode("utf-8", errors="replace")
            if response.status >= 400:
                try:
                    detail = json.loads(text).get("error", "Request failed")
                except (ValueError, AttributeError):
                    detail = "Request failed"
                raise ApiError(f"Ghidra++ API returned {response.status}: {detail}")
            if response.getheader("Content-Type", "").startswith("application/json"):
                return json.loads(text)
            return text
        except (OSError, TimeoutError, http.client.HTTPException) as exc:
            raise ApiError("Ghidra++ workspace is unavailable on the configured loopback port.") from exc
        except ValueError as exc:
            raise ApiError("Ghidra++ returned invalid JSON.") from exc
        finally:
            connection.close()


class McpAdapter:
    def __init__(self, api: WorkspaceApi):
        self.api = api
        self.legacy_initialized = False
        self.legacy_ready = False

    def handle(self, message: Any) -> dict[str, Any] | None:
        if not isinstance(message, dict) or message.get("jsonrpc") != "2.0":
            return rpc_error(None, -32600, "Invalid JSON-RPC request")
        method = message.get("method")
        if not isinstance(method, str):
            return rpc_error(message.get("id"), -32600, "Method is required")
        request_id = message.get("id")
        notification = "id" not in message
        if not notification and (isinstance(request_id, bool) or not isinstance(request_id, (str, int))):
            return rpc_error(None, -32600, "Request ID must be a string or integer")
        params = message.get("params", {})
        if not isinstance(params, dict):
            return None if notification else rpc_error(request_id, -32602, "Params must be an object")
        if method == "notifications/initialized":
            self.legacy_ready = self.legacy_initialized
            return None
        if notification:
            return None
        if method == "initialize":
            if not isinstance(params.get("protocolVersion"), str):
                return rpc_error(request_id, -32602, "protocolVersion is required")
            self.legacy_initialized = True
            self.legacy_ready = False
            return rpc_result(request_id, {
                "protocolVersion": LEGACY_VERSION,
                "capabilities": {"tools": {}},
                "serverInfo": SERVER_INFO,
            })

        modern = isinstance(params.get("_meta"), dict) and "io.modelcontextprotocol/protocolVersion" in params["_meta"]
        if modern:
            metadata = params["_meta"]
            requested = metadata.get("io.modelcontextprotocol/protocolVersion")
            if requested != MODERN_VERSION:
                return rpc_error(request_id, -32022, "Unsupported protocol version", {"supported": [MODERN_VERSION], "requested": requested})
            if not isinstance(metadata.get("io.modelcontextprotocol/clientCapabilities"), dict):
                return rpc_error(request_id, -32602, "Missing client capabilities metadata")
        elif not self.legacy_ready and method != "ping":
            return rpc_error(request_id, -32600, "Initialize the MCP connection first")

        if method == "server/discover":
            if not modern:
                return rpc_error(request_id, -32601, "Method not found")
            return rpc_result(request_id, self._modern_result({
                "supportedVersions": [MODERN_VERSION],
                "capabilities": {"tools": {}},
                "ttlMs": 0,
                "cacheScope": "private",
            }))
        if method == "ping":
            return rpc_result(request_id, self._modern_result({}) if modern else {})
        if method == "tools/list":
            if params.get("cursor") is not None:
                return rpc_error(request_id, -32602, "This tool list has no pagination cursor")
            result = {"tools": [tool.definition() for tool in TOOLS]}
            return rpc_result(request_id, self._modern_result(result) if modern else result)
        if method == "tools/call":
            name = params.get("name")
            tool = TOOL_BY_NAME.get(name) if isinstance(name, str) else None
            if tool is None:
                return rpc_error(request_id, -32602, "Unknown tool")
            try:
                arguments = validate_arguments(tool, params.get("arguments", {}))
            except InputError as exc:
                return rpc_error(request_id, -32602, str(exc))
            try:
                path = tool.path
                for key in ("address", "findingId"):
                    if "{" + key + "}" in path:
                        path = path.replace("{" + key + "}", quote(arguments[key], safe=""))
                body = {key: value for key, value in arguments.items() if key in ("depth", "mode", "address", "name")}
                data = self.api.request(tool.method, path, body)
                result = tool_result(data)
            except ApiError as exc:
                result = tool_result({"error": str(exc)}, is_error=True)
            result = self._scrub(result)
            return rpc_result(request_id, self._modern_result(result) if modern else result)
        return rpc_error(request_id, -32601, "Method not found")

    @staticmethod
    def _modern_result(result: dict[str, Any]) -> dict[str, Any]:
        return {
            "resultType": "complete",
            **result,
            "_meta": {"io.modelcontextprotocol/serverInfo": SERVER_INFO},
        }

    def _scrub(self, value: Any) -> Any:
        """A workspace response must never echo the fragment credential to MCP stdout."""
        if isinstance(value, str):
            return value.replace(self.api.token, "[credential]")
        if isinstance(value, list):
            return [self._scrub(item) for item in value]
        if isinstance(value, dict):
            return {key: self._scrub(item) for key, item in value.items()}
        return value


def tool_result(data: Any, is_error: bool = False) -> dict[str, Any]:
    text = data if isinstance(data, str) else json.dumps(data, ensure_ascii=False, separators=(",", ":"))
    result: dict[str, Any] = {"content": [{"type": "text", "text": text}], "isError": is_error}
    if isinstance(data, dict):
        result["structuredContent"] = data
    return result


def rpc_result(request_id: str | int, result: dict[str, Any]) -> dict[str, Any]:
    return {"jsonrpc": "2.0", "id": request_id, "result": result}


def rpc_error(request_id: str | int | None, code: int, message: str, data: Any = None) -> dict[str, Any]:
    error: dict[str, Any] = {"code": code, "message": message}
    if data is not None:
        error["data"] = data
    return {"jsonrpc": "2.0", "id": request_id, "error": error}


def serve(adapter: McpAdapter) -> None:
    stdin = sys.stdin.buffer
    stdout = sys.stdout.buffer
    while True:
        raw = stdin.readline(MAX_LINE + 1)
        if not raw:
            return
        if len(raw) > MAX_LINE:
            while raw and not raw.endswith(b"\n"):
                raw = stdin.readline(MAX_LINE + 1)
            response = rpc_error(None, -32600, "MCP message exceeds 2 MB")
        else:
            try:
                message = json.loads(raw.decode("utf-8"))
                response = adapter.handle(message)
            except (UnicodeDecodeError, json.JSONDecodeError):
                response = rpc_error(None, -32700, "Parse error")
            except Exception:
                response = rpc_error(None, -32603, "Internal MCP adapter error")
        if response is not None:
            encoded = json.dumps(response, ensure_ascii=True, separators=(",", ":")).replace(
                adapter.api.token, "[credential]").encode("utf-8")
            stdout.write(encoded + b"\n")
            stdout.flush()


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Local stdio MCP adapter for Ghidra++")
    parser.add_argument("--url", help="Ghidra++ workspace link with #token fragment")
    options = parser.parse_args(argv)
    try:
        port, token = parse_workspace_url(options.url or os.environ.get("GHIDRAPLUS_URL"))
    except InputError as exc:
        print(str(exc), file=sys.stderr)
        return 2
    serve(McpAdapter(WorkspaceApi(port, token)))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
