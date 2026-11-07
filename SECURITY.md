# Security Policy

## Supported versions

Only the latest release receives security fixes.

## Reporting a vulnerability

Please **do not** open a public issue. Use GitHub's
[private vulnerability reporting](https://github.com/tuananhhust05/voicebar/security/advisories/new)
or email **tuananhhust05@gmail.com**. Include steps to reproduce and the affected
version. You can expect an acknowledgement within 3 days.

## Threat model

Voicebar starts the user's local Claude Code CLI. The main things it protects are:

| Asset              | Protection                                                                                                                                                                                      |
| ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| The user's machine | The CLI is always started with `--tools ""`, `--strict-mcp-config` and `--setting-sources project`, so Claude cannot run commands, read files or load MCP servers through Voicebar.             |
| Process arguments  | User text reaches the CLI only via stdin. Model names and session IDs are checked against strict patterns before they are used as arguments.                                                    |
| Renderer           | `contextIsolation`, `sandbox`, no Node integration, strict Content-Security-Policy, no remote content. Only a typed preload API is exposed. Every IPC payload is validated in the main process. |
| Downloads          | The Whisper binary and model are fetched over HTTPS and checked against pinned SHA-256 hashes before use.                                                                                       |
| Local data         | Settings and history live in the OS user-data folder with user-only permissions.                                                                                                                |

Out of scope: the security of the Claude Code CLI itself, Anthropic's service, and
the operating system's speech services.
