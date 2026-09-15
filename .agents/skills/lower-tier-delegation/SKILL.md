---
name: lower-tier-delegation
description: Delegate bounded coding, testing, and investigation tasks to lower-tier subagents while the lead agent handles architecture, integration, and review. Use for implementation work with independent subtasks or when the user requests economical multi-agent work.
---

# Lower-tier delegation

When this skill applies, explicitly use lower-tier subagents for suitable independent work. The lead agent owns the final result and continues useful work alongside them. Handle small or tightly coupled changes locally when delegation would add more coordination than value.

## Choose a model

Use only model IDs supported by the current `spawn_agent` tool. These are routing preferences, not claims about current prices:

| Work | Preferred model | Reasoning effort |
| --- | --- | --- |
| Focused searches, simple edits, straightforward tests, small isolated fixes | `gpt-5.6-luna` | `medium` |
| Bounded implementation involving several functions or files | `gpt-5.6-terra` | `medium` |
| Broader debugging or implementation that needs more reasoning | `gpt-5.6-sol` | `high` |

Start with the least demanding option that fits the task. Keep architecture decisions, ambiguous requirements, sensitive changes, and final integration with the lead agent. If a model is unavailable, use an available suitable lower-tier model; if none is suitable, work locally. Respect explicit user model choices and higher-priority restrictions.

For model overrides, set `fork_turns: "none"` and provide a self-contained brief. A full-history fork inherits the parent model and cannot be used to select a cheaper worker. Use a limited numeric fork only when inherited context is necessary and compatible with the tool's override rules.

## Divide and dispatch

1. Identify a concrete subtask that can run independently while the lead makes useful progress, such as implementing an isolated adapter, adding behavior tests against an agreed interface, or investigating an unrelated failure.
2. Give each writing agent ownership of specific files or a directory. Avoid concurrent edits to the same files. Keep shared interfaces, dependency manifests, and lockfiles under one owner.
3. Include the objective, relevant paths, agreed interfaces, constraints, acceptance criteria, and exact checks to run when known. Identify where repository instructions live; include user-provided instructions the worker cannot read from disk.
4. Specify whether the assignment is read-only or permits edits. Explain that agents share the workspace, must preserve existing changes, and should report unexpected overlaps before editing.
5. Ask for a concise handoff: files changed, behavior implemented, checks and results, and unresolved issues. Require the worker to stop and report missing prerequisites or unclear ownership rather than invent requirements.

Use `collaboration.spawn_agent` directly. For example, adapt this argument object to the actual task and available tools:

```json
{
  "task_name": "implement_adapter",
  "model": "gpt-5.6-luna",
  "reasoning_effort": "medium",
  "fork_turns": "none",
  "message": "Implement the agreed HTTP adapter in /absolute/project/mcp/remote.mjs only. Interface: export pressButton(button), accepting only Up, Down, Left, Right, Select, Back; POST once to /keypress/<button> at http://127.0.0.1:8060; reject failed HTTP responses and never retry. Add a 3-second request timeout. Do not modify other files. Other agents share this workspace: preserve their changes. Follow repository AGENTS.md instructions and prefix shell commands with rtk, except lavish-axi. Do not commit, deploy, or spawn further agents. Report changed files, checks run, and unresolved issues."
}
```

Do not send credentials, irrelevant conversation history, or entire repositories in task briefs. Delegation preserves the original task's permissions and deployment restrictions. Default to no nested delegation; the lead manages the available slots.

## Coordinate and finish

- While workers run, handle integration design, another independent change, or relevant verification. Do not duplicate the assigned work.
- Use `send_message` for clarifications and coordination. Use `followup_task` to reuse an idle agent for a bounded revision. Respect the session's concurrency limit.
- Review the actual diff and reported checks before accepting a handoff. Run the checks needed to verify the combined result; a worker's success message alone is not verification.
- If a worker is blocked, first narrow the brief or supply missing context. If it still cannot complete the task, reassign the remaining work to a more capable available model or finish locally. Stop the original writer before transferring file ownership; avoid repeated identical attempts.
- Summarize the completed changes and verification to the user, including material limitations. Do not claim deployment, testing, or model cost savings that were not established.
