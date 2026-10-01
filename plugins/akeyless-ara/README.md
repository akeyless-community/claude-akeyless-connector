# Akeyless ARA plugin for Claude

This is **Mode 2** of the Akeyless Claude integration: a **Claude plugin** for marketplace / directory install.

For the **Desktop extension with a settings form** (Mode 1 — `.mcpb`), use the [GitHub Release `.mcpb`](https://github.com/akeyless-community/claude-akeyless-connector/releases) instead. Full comparison: [docs/DISTRIBUTION.md](../../docs/DISTRIBUTION.md).

Claude orchestrates. Akeyless holds the credentials. **Secret values never enter the model context.**

## Tools

| Tool | Purpose |
|---|---|
| `list-secrets` | List ARA-enabled dynamic, rotated, and custom-MCP secrets |
| `query-db` | Run database queries via the Gateway |
| `service-execute` | Run AWS / GCP / Azure / K8s / GitHub / custom-MCP actions |
| `list-sub-tools` | Optional discovery helper for service secrets |

## Prerequisites

- Node.js **18+** on `PATH` (the plugin launches the connector via `npx`)
- An Akeyless Gateway with ARA enabled
- A role with `ara_allow_access` on the secret paths you will use

## Configure credentials

**This plugin does not show the MCPB configuration screen** (Gateway URL / Access Key fields under Extensions). Set environment variables before using the tools:

```bash
export AKEYLESS_GATEWAY_URL="https://your-gateway.example.com:8000/api/v2"
export AKEYLESS_ACCESS_TYPE="access_key"
export AKEYLESS_ACCESS_ID="p-xxxxx"
export AKEYLESS_ACCESS_KEY="your-access-key"
export AKEYLESS_AGENT_ID="claude-desktop"
```

Fully quit and reopen Claude so the MCP process inherits the env. On macOS, apps started from Finder may not see shell exports — launch Claude from Terminal or use org-managed environment injection if needed.

Other auth methods (`saml`, `oidc`, `jwt`, `universal_identity`, cloud IAM) are documented in the [connector README](../../README.md).

If you need the install-time settings form, switch to **Mode 1** (`.mcpb`) — see [DISTRIBUTION.md](../../docs/DISTRIBUTION.md).

## Install

### From this marketplace (team / self-hosted)

In Claude Desktop (Cowork → Customize → Browse plugins) or Claude Code:

```text
Add marketplace: akeyless-community/claude-akeyless-connector
Install plugin: akeyless-ara
```

### From Anthropic's directory (after listing)

Browse plugins → search **Akeyless** → Install.

### Local development

```bash
claude --plugin-dir ./plugins/akeyless-ara
```

## Privacy

This plugin runs a **local** MCP server on your machine. It talks only to your configured Akeyless Gateway. See the root [Privacy Policy](../../README.md#privacy-policy) and [https://www.akeyless.io/privacy-policy/](https://www.akeyless.io/privacy-policy/).

## License

MIT — see [LICENSE](LICENSE).
