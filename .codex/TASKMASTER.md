# Task Master MCP

The project config pins `task-master-ai@0.43.1`, matching the working sibling
Syncmote configuration. No API keys are stored in this configuration.

Official Codex MCP configuration reference:
https://learn.chatgpt.com/docs/extend/mcp?surface=cli

Codex reads project `.codex/config.toml` for trusted projects. Verify configuration
with `codex mcp get taskmaster`. A configuration listing alone does not prove that
the current chat has loaded the server. On 2026-10-23 the current chat's native
tool catalog had no Task Master tools, so the client below was used.

## MCP client for sessions without native tools

Run from the repository root:

```sh
python3 .codex/taskmaster-mcp-client.py initialize
python3 .codex/taskmaster-mcp-client.py tools/list
python3 .codex/taskmaster-mcp-client.py get_tasks '{"tag":"master"}'
python3 .codex/taskmaster-mcp-client.py next_task '{"tag":"master"}'
python3 .codex/taskmaster-mcp-client.py get_task '{"id":"11","tag":"master"}'
```

The Python 3.7-compatible stdlib client starts the pinned stdio server, exchanges
MCP initialize/initialized messages, then sends tools/list or tools/call. It
automatically supplies the checkout's absolute projectRoot. It does not directly
write task JSON, call git, or print server diagnostic stderr. Node and npx must be
on PATH; the initial npx package resolution may need network access. Calls are
bounded to 60 seconds for initialization and 300 seconds for tool responses.

To record a verified status change through MCP:

```sh
python3 .codex/taskmaster-mcp-client.py set_task_status '{"id":"11","status":"review","tag":"master"}'
```

Only use a status justified by actual evidence. Serialize backlog mutations
between workers. Read the result and follow with get_task/get_tasks to verify.
For explicit task creation, add_task accepts manual title, description, details,
testStrategy, priority, and dependencies fields; these do not require AI task
generation. Avoid prompt-driven generation/update tools unless the relevant
provider call is intended. Never put credentials in task descriptions or CLI args.

## Verified setup evidence, 2026-10-23

- MCP initialize: protocol 2024-11-05; Task Master MCP Server version 0.43.1.
- MCP tools/list: 44 tools.
- MCP get_tasks and next_task succeeded; next_task selected existing subtask 5.1,
  in-progress, rather than a newly added demo task.
- Tasks 11-14 were added through MCP; original tasks 1-10 compared equal before
  and after those additions. They retain their separate live acceptance gates.

## Demo milestones

| ID | Scope | Owner | Dependencies |
| --- | --- | --- | --- |
| 11 | Backend generation | Backend worker | None |
| 12 | Interactive demo UX | UX worker | None |
| 13 | Browser acceptance | Coordinator | 11, 12 |
| 14 | PR integration | Coordinator | 13 |
| 15 | Service setup and live-provider functional demo | Coordinator | 11, 12 |

Read current statuses through MCP. A local or fixture demo does not complete the
existing production/live-provider acceptance tasks.
