# Two install modes: Desktop extension vs Claude plugin

This project ships **one MCP server** (`@akeyless-community/claude-connector`) in **two packaging modes**. They are not interchangeable in the Claude UI.

| | **Mode 1 — Desktop extension (`.mcpb`)** | **Mode 2 — Claude plugin** |
|---|---|---|
| **Best for** | End users on Claude Desktop who need a settings form | Directory / marketplace discoverability (Enterprise portal, Cowork plugins, Claude Code) |
| **How users find it** | GitHub Releases, your website, org pre-install | Browse plugins / Anthropic directory / add marketplace from GitHub |
| **Install** | Double-click `.mcpb`, or Settings → Extensions → Install Extension… | Install **akeyless-ara** from the marketplace / directory |
| **Configuration UI** | **Yes** — Gateway URL, Access ID, Access Key, etc. from `manifest.json` `user_config` (values in OS keychain) | **No MCPB-style form** — credentials via `AKEYLESS_*` environment variables (and optional plugin `userConfig` where the client supports it) |
| **Runtime** | Claude’s built-in Node + bundled extension | `npx` → published npm package (needs Node.js 18+ on `PATH`) |
| **In Anthropic’s public directory?** | **No** — standalone MCPB listings are deprecated | **Yes** — submit plugin path `plugins/akeyless-ara` via [claude.ai/directory/manage](https://claude.ai/directory/manage) |

Anthropic does **not** currently offer “list in the marketplace and install exactly like an `.mcpb` with the same settings screen.” Use both modes and point users at the right one.

```text
                    ┌─────────────────────────────┐
                    │  Same MCP tools (ARA)       │
                    │  list-secrets / query-db /  │
                    │  service-execute / …        │
                    └─────────────┬───────────────┘
                                  │
              ┌───────────────────┴───────────────────┐
              ▼                                       ▼
   Mode 1: .mcpb extension                 Mode 2: Claude plugin
   Settings → Extensions                   Browse plugins / directory
   + config form (user_config)             + env vars (no Desktop form)
```

---

## Mode 1 — Desktop extension (`.mcpb`)

Use this when you want the experience you already know: install → fill Gateway / auth fields → enable → chat.

### Install

1. Download `claude-akeyless-connector.mcpb` from [GitHub Releases](https://github.com/akeyless-community/claude-akeyless-connector/releases) (or build with `npm run pack:mcpb`).
2. Double-click the file (or drag into Claude Desktop / Install Extension…).
3. Complete the **configuration** screen (Gateway URL, Authentication Method, Access ID / Access Key, Agent ID, …).
4. Enable the extension and start a **new** chat.

Sensitive fields are stored in the OS keychain by Claude Desktop.

### When to recommend this mode

- Demos and customer pilots on Claude Desktop  
- Users who should not edit shell env or JSON config  
- Org deployments that distribute a known `.mcpb` (Team/Enterprise can manage local extensions)

### Limits

- Not listed as a standalone item in Anthropic’s Connectors Directory anymore  
- Updates: users install a newer `.mcpb` (or your org pushes an updated bundle)

Details: root [README](../README.md) · [manifest.json](../manifest.json) `user_config`

---

## Mode 2 — Claude plugin (`akeyless-ara`)

Use this for **discoverability**: marketplace, Enterprise directory submission, Cowork plugins, Claude Code.

### Install

**Self-hosted marketplace (works today):**

1. Claude Desktop: Cowork → Customize → Browse plugins → Personal → **Add marketplace**  
   → `akeyless-community/claude-akeyless-connector`  
2. Install plugin **akeyless-ara**.

**Anthropic directory (after listing):** search **Akeyless** → Install.

**Claude Code:** `/plugin marketplace add akeyless-community/claude-akeyless-connector` then install `akeyless-ara`.

### Configure (required)

The plugin launches:

```text
npx -y @akeyless-community/claude-connector@…
```

with env placeholders from [plugins/akeyless-ara/.mcp.json](../plugins/akeyless-ara/.mcp.json). Set at least:

```bash
export AKEYLESS_GATEWAY_URL="https://your-gateway.example.com:8000/api/v2"
export AKEYLESS_ACCESS_TYPE="access_key"
export AKEYLESS_ACCESS_ID="p-xxxxx"
export AKEYLESS_ACCESS_KEY="your-access-key"
export AKEYLESS_AGENT_ID="claude-desktop"
```

Then **fully quit and reopen** Claude so the MCP process inherits the env (on macOS, apps started from Finder often miss shell profile exports — launch from Terminal or use org-managed env if needed).

You will **not** see the MCPB Gateway / Access Key form under Extensions for this install path.

### When to recommend this mode

- Public / Enterprise **directory** listing  
- Teams that already manage secrets via env / MDM  
- Claude Code / Cowork plugin workflows  

### Limits

- No Desktop settings UI equivalent to `.mcpb` `user_config` today  
- Needs Node.js 18+ for `npx`  
- Plugin `userConfig` (if added later) is mainly reliable in Claude Code CLI installs, not as a full Desktop form replacement  

Details: [plugins/akeyless-ara/README.md](../plugins/akeyless-ara/README.md) · [SUBMISSION.md](SUBMISSION.md)

---

## Which mode should I tell users to use?

| User situation | Recommend |
|---|---|
| “I use Claude Desktop and want a config screen” | **Mode 1 — `.mcpb`** |
| “I found Akeyless in Browse plugins / the directory” | **Mode 2 — plugin** (+ set env vars) |
| “Our Enterprise admin lists us in Anthropic’s directory” | **Mode 2** for listing; still offer **Mode 1** for Desktop UX |
| “I only want JSON / npx” | Manual MCP config in [README](../README.md#manual-mcp-configuration-without-mcpb) |

Same tools and Gateway behavior either way — only packaging and how credentials are entered differ.

---

## Related docs

- [SUBMISSION.md](SUBMISSION.md) — Enterprise portal plugin submission  
- [DIRECTORY_AND_REMOTE.md](DIRECTORY_AND_REMOTE.md) — directory status + future remote MCP  
- [PUBLISHING.md](PUBLISHING.md) — npm / release process  
