# Akeyless ARA plugin for Claude

Claude plugin that packages the [Akeyless Agentic Runtime Authority](https://docs.akeyless.io/docs/agentic-runtime-authority) MCP connector (`@akeyless-community/claude-connector`).

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

Set these environment variables before enabling the plugin (shell profile, Claude Desktop env, or org-managed settings):

```bash
export AKEYLESS_GATEWAY_URL="https://your-gateway.example.com:8000/api/v2"
export AKEYLESS_ACCESS_TYPE="access_key"
export AKEYLESS_ACCESS_ID="p-xxxxx"
export AKEYLESS_ACCESS_KEY="your-access-key"
export AKEYLESS_AGENT_ID="claude-desktop"
```

Other auth methods (`saml`, `oidc`, `jwt`, `universal_identity`, cloud IAM) are documented in the [connector README](../../README.md).

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
