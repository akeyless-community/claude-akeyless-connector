---
name: akeyless-ara
description: Use Akeyless Agentic Runtime Authority (ARA) to list secrets and run database queries, cloud actions, or remote commands on SSH, Windows, and LDAP hosts without exposing credentials. Trigger when the user asks about Akeyless secrets, ARA, query-db, service-execute, list-secrets, or secretless database, cloud, or server access through their Gateway.
version: 0.4.0
---

# Akeyless Agentic Runtime Authority

Use the bundled Akeyless MCP tools. Credentials stay on the user's Akeyless Gateway — never ask the user to paste secret values into chat.

## Required environment (one-time setup)

The MCP server reads these from the user's environment:

| Variable | Required | Notes |
|---|---|---|
| `AKEYLESS_GATEWAY_URL` | Yes | e.g. `https://gw.example.com:8000/api/v2` |
| `AKEYLESS_ACCESS_TYPE` | Yes | Usually `access_key` |
| `AKEYLESS_ACCESS_ID` | Usually | Access ID for the auth method |
| `AKEYLESS_ACCESS_KEY` | For `access_key` | Access Key secret |
| `AKEYLESS_AGENT_ID` | Recommended | Defaults to `claude-desktop` if unset in some clients |

Optional: `AKEYLESS_DEFAULT_SECRET_NAME`, `AKEYLESS_UID_TOKEN_FILE`, `AKEYLESS_JWT`.

If tools fail with a missing Gateway URL / credentials error, tell the user to set these env vars (shell profile, Claude Desktop config, or org settings) and restart Claude.

## Workflow

1. Call **list-secrets** to discover ARA-enabled secrets (dynamic, rotated, custom-MCP, SSH certificate issuers).
2. Database secrets (MySQL, PostgreSQL, Snowflake, etc.) → **query-db** with `secret-name` + `payload`.
3. Service secrets (AWS, GCP, Azure, K8s, GitHub, custom MCP) → **service-execute**.
4. Remote items (`target_type` `ssh`, `windows`, `rdp`, `ldap`, `linked`, or `secret_type` `ssh-cert-issuer`) → **service-execute** with one non-interactive command:
   - Plain command line as the payload, e.g. `uptime` (SSH) or `Get-Service` (WinRM).
   - Sub-tool call to pick the host, directory, or shell, or to move a file: `{"tool":"run","arguments":{"command":"df -h","host":"web1.corp","cwd":"/"}}`. Other sub-tools: `upload` (`remote_path`, base64 `content`) and `download` (`remote_path`).
   - If the error lists several hosts (or users, for an SSH certificate issuer), call again with `host` (or `remote_user`) set to one of them.
   - The result has `stdout`, `stderr`, `exit_code`; pass the returned `cwd` back on the next `run` to stay in the same directory. A non-zero `exit_code` is the command's own failure, not a connector error.
   - No TTY: commands that prompt (e.g. `sudo` asking for a password) fail.
5. Optional: **list-sub-tools** on a service secret or remote item before `service-execute`.

Prefer read-only payloads unless the user clearly asks for a write. Confirm with the user before commands that change a remote host (restarts, deletes, installs, uploads). Always pass `agent-id` when available for auditing.

## Example prompts to fulfill

- "List my Akeyless ARA secrets"
- "Run `SELECT 1` against `/path/to/db-ds`"
- "Use service-execute on `/path/to/aws-ds` to list S3 buckets"
- "Check disk usage on the server behind `/path/to/ssh-rotated`"
- "List stopped services on the Windows host behind `/path/to/windows-rotated`"
