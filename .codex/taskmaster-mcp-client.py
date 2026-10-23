#!/usr/bin/env python3
"""Call the pinned Task Master stdio MCP server, without editing its data files.

Usage: python3 .codex/taskmaster-mcp-client.py tools/list
       python3 .codex/taskmaster-mcp-client.py get_tasks '{"withSubtasks":true}'
Tool arguments automatically receive this checkout's projectRoot.
"""
import json
import os
from pathlib import Path
import selectors
import signal
import subprocess
import sys
import time

ROOT = Path(__file__).resolve().parent.parent


def main():
    method = sys.argv[1] if len(sys.argv) > 1 else "tools/list"
    arguments = json.loads(sys.argv[2]) if len(sys.argv) > 2 else {}
    env = dict(os.environ, TASK_MASTER_TOOLS="all")
    # Server diagnostics stay off stdout and are not printed: they may contain
    # provider/environment information. MCP responses are the evidence surface.
    process = subprocess.Popen(
        ["npx", "-y", "task-master-ai@0.43.1"], cwd=ROOT, env=env,
        stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL,
        start_new_session=True,
    )
    selector = selectors.DefaultSelector()
    selector.register(process.stdout, selectors.EVENT_READ)
    pending = b""

    def send(value):
        process.stdin.write((json.dumps(value) + "\n").encode())
        process.stdin.flush()

    def receive(request_id, timeout=300):
        nonlocal pending
        deadline = time.monotonic() + timeout
        while time.monotonic() < deadline:
            while b"\n" in pending:
                line, pending = pending.split(b"\n", 1)
                try:
                    response = json.loads(line)
                except (ValueError, UnicodeDecodeError):
                    continue
                if response.get("id") == request_id:
                    if "error" in response:
                        raise RuntimeError(json.dumps(response["error"]))
                    return response["result"]
            if not selector.select(min(1, max(0, deadline - time.monotonic()))):
                continue
            chunk = os.read(process.stdout.fileno(), 65536)
            if not chunk:
                raise RuntimeError("Task Master MCP server closed stdout")
            pending += chunk
        raise TimeoutError("Task Master MCP response timed out")

    try:
        send({"jsonrpc": "2.0", "id": 1, "method": "initialize", "params": {
            "protocolVersion": "2024-11-05", "capabilities": {},
            "clientInfo": {"name": "vibekidding-mcp-client", "version": "1.0.0"},
        }})
        initialized = receive(1, 60)
        send({"jsonrpc": "2.0", "method": "notifications/initialized"})
        if method == "initialize":
            result = initialized
        elif method == "tools/list":
            send({"jsonrpc": "2.0", "id": 2, "method": "tools/list", "params": {}})
            result = receive(2)
        else:
            arguments.setdefault("projectRoot", str(ROOT))
            send({"jsonrpc": "2.0", "id": 2, "method": "tools/call", "params": {
                "name": method, "arguments": arguments,
            }})
            result = receive(2)
        print(json.dumps(result, indent=2))
        return 1 if result.get("isError") else 0
    finally:
        selector.close()
        try:
            os.killpg(process.pid, signal.SIGTERM)
        except ProcessLookupError:
            pass
        try:
            process.wait(timeout=5)
        except subprocess.TimeoutExpired:
            os.killpg(process.pid, signal.SIGKILL)
            process.wait()


if __name__ == "__main__":
    sys.exit(main())
