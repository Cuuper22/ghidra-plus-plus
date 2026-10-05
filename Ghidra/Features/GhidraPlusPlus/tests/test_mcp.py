"""Behavior checks for the stdio MCP bridge, using a local fake workspace API."""

from __future__ import annotations

import importlib.util
import json
import os
from pathlib import Path
import subprocess
import sys
import threading
import unittest
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer


MODULE_PATH = Path(__file__).resolve().parents[1] / "tools" / "mcp.py"
spec = importlib.util.spec_from_file_location("ghidraplus_mcp", MODULE_PATH)
assert spec and spec.loader
mcp = importlib.util.module_from_spec(spec)
sys.modules[spec.name] = mcp
spec.loader.exec_module(mcp)
TOKEN = "A" * 43


class FakeWorkspace(BaseHTTPRequestHandler):
    calls: list[tuple[str, str, dict, dict]] = []

    def log_message(self, *_args):
        pass

    def _handle(self):
        length = int(self.headers.get("Content-Length", "0"))
        body = json.loads(self.rfile.read(length)) if length else {}
        headers = {key.lower(): value for key, value in self.headers.items()}
        self.calls.append((self.command, self.path, body, headers))
        if headers.get("x-ghidra-token") != TOKEN:
            self._send(401, {"error": "Missing workspace token"})
        elif self.path == "/api/project":
            self._send(200, {"program": {"name": "sample"}, "secretEcho": TOKEN})
        elif self.path == "/api/functions/1000":
            self._send(200, {"address": "1000", "name": "FUN_1000"})
        elif self.path == "/api/export/source":
            self._send(200, "int main(void) { return 0; }", "text/plain")
        elif self.path == "/api/export/project":
            self._send(200, {"program": {"name": "sample"}})
        elif self.path == "/api/analyze" and body.get("depth") == "exhaustive":
            self._send(409, {"error": "Analysis is already running"})
        else:
            self._send(200, {"ok": True})

    def _send(self, status, value, media="application/json"):
        data = (json.dumps(value) if media == "application/json" else value).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", media)
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    do_GET = _handle
    do_POST = _handle


class McpTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.server = ThreadingHTTPServer(("127.0.0.1", 0), FakeWorkspace)
        cls.thread = threading.Thread(target=cls.server.serve_forever, daemon=True)
        cls.thread.start()
        cls.url = f"http://127.0.0.1:{cls.server.server_port}/#token={TOKEN}"

    @classmethod
    def tearDownClass(cls):
        cls.server.shutdown()
        cls.server.server_close()
        cls.thread.join(timeout=2)

    def setUp(self):
        FakeWorkspace.calls.clear()

    def run_wire(self, messages, *, url=None):
        env = dict(os.environ)
        env["GHIDRAPLUS_URL"] = url or self.url
        process = subprocess.Popen(
            [sys.executable, str(MODULE_PATH)],
            stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
            env=env,
        )
        payload = b"".join(json.dumps(message).encode("utf-8") + b"\n" for message in messages)
        stdout, stderr = process.communicate(payload, timeout=30)
        self.assertEqual(process.returncode, 0, stderr.decode("utf-8", errors="replace"))
        self.assertNotIn(TOKEN.encode(), stdout)
        self.assertNotIn(TOKEN.encode(), stderr)
        return [json.loads(line) for line in stdout.splitlines()], stderr

    def test_legacy_handshake_tools_and_auth_forwarding(self):
        messages = [
            {"jsonrpc": "2.0", "id": 1, "method": "initialize", "params": {"protocolVersion": mcp.LEGACY_VERSION, "capabilities": {}, "clientInfo": {"name": "test", "version": "1"}}},
            {"jsonrpc": "2.0", "method": "notifications/initialized"},
            {"jsonrpc": "2.0", "id": 2, "method": "ping"},
            {"jsonrpc": "2.0", "id": 3, "method": "tools/list"},
            {"jsonrpc": "2.0", "id": 4, "method": "tools/call", "params": {"name": "inspect_project", "arguments": {}}},
            {"jsonrpc": "2.0", "id": 5, "method": "tools/call", "params": {"name": "inspect_function", "arguments": {"address": "1000"}}},
            {"jsonrpc": "2.0", "id": 6, "method": "tools/call", "params": {"name": "start_analysis", "arguments": {"depth": "fast", "mode": "dynamic"}}},
            {"jsonrpc": "2.0", "id": 7, "method": "tools/call", "params": {"name": "rename_function", "arguments": {"address": "1000", "name": "allocate_buffer"}}},
            {"jsonrpc": "2.0", "id": 8, "method": "tools/call", "params": {"name": "apply_finding", "arguments": {"findingId": "11111111-1111-1111-1111-111111111111"}}},
            {"jsonrpc": "2.0", "id": 9, "method": "tools/call", "params": {"name": "undo_finding", "arguments": {"findingId": "11111111-1111-1111-1111-111111111111"}}},
            {"jsonrpc": "2.0", "id": 10, "method": "tools/call", "params": {"name": "save_project", "arguments": {}}},
            {"jsonrpc": "2.0", "id": 11, "method": "tools/call", "params": {"name": "export_project", "arguments": {}}},
            {"jsonrpc": "2.0", "id": 12, "method": "tools/call", "params": {"name": "export_source", "arguments": {}}},
            {"jsonrpc": "2.0", "id": 13, "method": "tools/call", "params": {"name": "pause_analysis", "arguments": {}}},
            {"jsonrpc": "2.0", "id": 14, "method": "tools/call", "params": {"name": "resume_analysis", "arguments": {}}},
        ]
        replies, stderr = self.run_wire(messages)
        self.assertEqual(stderr, b"")
        self.assertEqual([reply["id"] for reply in replies], list(range(1, 15)))
        self.assertEqual(replies[0]["result"]["protocolVersion"], mcp.LEGACY_VERSION)
        names = {tool["name"] for tool in replies[2]["result"]["tools"]}
        self.assertEqual(names, {tool.name for tool in mcp.TOOLS})
        self.assertTrue(all(tool["inputSchema"]["additionalProperties"] is False for tool in replies[2]["result"]["tools"]))
        self.assertEqual(replies[3]["result"]["structuredContent"]["secretEcho"], "[credential]")
        self.assertIn("int main", replies[11]["result"]["content"][0]["text"])
        self.assertEqual(len(FakeWorkspace.calls), 11)
        self.assertTrue(all(call[3]["x-ghidra-token"] == TOKEN for call in FakeWorkspace.calls))
        self.assertTrue(all(call[3]["origin"] == f"http://127.0.0.1:{self.server.server_port}" for call in FakeWorkspace.calls))
        self.assertIn(("POST", "/api/analyze", {"depth": "fast", "mode": "dynamic"}), [(a, b, c) for a, b, c, _ in FakeWorkspace.calls])
        self.assertIn(("POST", "/api/rename", {"address": "1000", "name": "allocate_buffer"}), [(a, b, c) for a, b, c, _ in FakeWorkspace.calls])

    def test_modern_discovery_and_tool_results(self):
        meta = {"io.modelcontextprotocol/protocolVersion": mcp.MODERN_VERSION, "io.modelcontextprotocol/clientCapabilities": {}}
        replies, _ = self.run_wire([
            {"jsonrpc": "2.0", "id": "d", "method": "server/discover", "params": {"_meta": meta}},
            {"jsonrpc": "2.0", "id": "l", "method": "tools/list", "params": {"_meta": meta}},
            {"jsonrpc": "2.0", "id": "c", "method": "tools/call", "params": {"_meta": meta, "name": "inspect_project", "arguments": {}}},
        ])
        self.assertEqual(replies[0]["result"]["supportedVersions"], [mcp.MODERN_VERSION])
        self.assertEqual(replies[0]["result"]["resultType"], "complete")
        self.assertEqual(replies[1]["result"]["resultType"], "complete")
        self.assertEqual(replies[2]["result"]["resultType"], "complete")
        self.assertEqual(replies[2]["result"]["structuredContent"]["secretEcho"], "[credential]")

    def test_protocol_and_tool_errors(self):
        replies, _ = self.run_wire([
            {"jsonrpc": "2.0", "id": 1, "method": "tools/list"},
            {"jsonrpc": "2.0", "id": 2, "method": "initialize", "params": {"protocolVersion": mcp.LEGACY_VERSION}},
            {"jsonrpc": "2.0", "method": "notifications/initialized"},
            {"jsonrpc": "2.0", "id": 3, "method": "tools/call", "params": {"name": "missing", "arguments": {}}},
            {"jsonrpc": "2.0", "id": 4, "method": "tools/call", "params": {"name": "inspect_function", "arguments": {"address": "../escape"}}},
            {"jsonrpc": "2.0", "id": 5, "method": "tools/call", "params": {"name": "start_analysis", "arguments": {"depth": "exhaustive"}}},
        ])
        self.assertEqual([reply.get("id") for reply in replies], [1, 2, 3, 4, 5])
        self.assertEqual(replies[0]["error"]["code"], -32600)
        self.assertEqual(replies[2]["error"]["code"], -32602)
        self.assertEqual(replies[3]["error"]["code"], -32602)
        self.assertTrue(replies[4]["result"]["isError"])
        self.assertIn("already running", replies[4]["result"]["content"][0]["text"])
        self.assertEqual(len(FakeWorkspace.calls), 1)

    def test_wire_parse_error_and_unsupported_modern_version(self):
        env = dict(os.environ)
        env["GHIDRAPLUS_URL"] = self.url
        message = {"jsonrpc": "2.0", "id": 7, "method": "server/discover", "params": {"_meta": {
            "io.modelcontextprotocol/protocolVersion": "1900-01-01",
            "io.modelcontextprotocol/clientCapabilities": {},
        }}}
        process = subprocess.Popen(
            [sys.executable, str(MODULE_PATH)], stdin=subprocess.PIPE,
            stdout=subprocess.PIPE, stderr=subprocess.PIPE, env=env,
        )
        payload = b"{broken\n" + json.dumps(message).encode("utf-8") + b"\n"
        stdout, stderr = process.communicate(payload, timeout=30)
        self.assertEqual(process.returncode, 0)
        self.assertEqual(stderr, b"")
        self.assertNotIn(TOKEN.encode(), stdout)
        replies = [json.loads(line) for line in stdout.splitlines()]
        self.assertEqual(replies[0]["error"]["code"], -32700)
        self.assertEqual(replies[1]["error"]["code"], -32022)
        self.assertEqual(replies[1]["error"]["data"]["supported"], [mcp.MODERN_VERSION])

    def test_invalid_destinations_and_unavailable_workspace(self):
        for value in (
            f"http://example.com:1234/#token={TOKEN}",
            f"https://127.0.0.1:1234/#token={TOKEN}",
            f"http://localhost:1234/#token={TOKEN}",
            f"http://127.0.0.1:1234/api/project#token={TOKEN}",
            "http://127.0.0.1:1234/#token=short",
        ):
            with self.assertRaises(mcp.InputError):
                mcp.parse_workspace_url(value)
        adapter = mcp.McpAdapter(mcp.WorkspaceApi(1, TOKEN))
        adapter.handle({"jsonrpc": "2.0", "id": 1, "method": "initialize", "params": {"protocolVersion": mcp.LEGACY_VERSION}})
        adapter.handle({"jsonrpc": "2.0", "method": "notifications/initialized"})
        reply = adapter.handle({"jsonrpc": "2.0", "id": 2, "method": "tools/call", "params": {"name": "inspect_project", "arguments": {}}})
        self.assertTrue(reply["result"]["isError"])
        self.assertIn("unavailable", reply["result"]["content"][0]["text"])


if __name__ == "__main__":
    unittest.main()
