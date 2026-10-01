---
name: akeyless-ara
description: Use Akeyless Agentic Runtime Authority (ARA) to list secrets and run database or cloud actions without exposing credentials. Trigger when the user asks about Akeyless secrets, ARA, query-db, service-execute, list-secrets, or secretless database/cloud access through their Gateway.
version: 0.3.1
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

1. Call **list-secrets** to discover ARA-enabled secrets (dynamic, rotated, custom-MCP).
2. Database secrets (MySQL, PostgreSQL, Snowflake, etc.) → **query-db** with `secret-name` + `payload`.
3. Service secrets (AWS, GCP, Azure, K8s, GitHub, custom MCP) → **service-execute**.
4. Optional: **list-sub-tools** on a service secret before `service-execute`.

Prefer read-only payloads unless the user clearly asks for a write. Always pass `agent-id` when available for auditing.

## Example prompts to fulfill

- "List my Akeyless ARA secrets"
- "Run `SELECT 1` against `/path/to/db-ds`"
- "Use service-execute on `/path/to/aws-ds` to list S3 buckets"
