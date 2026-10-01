# Claude directory — Plugin submission pack

> **Update (2026):** Anthropic deprecated standalone **MCPB / desktop-extension** listings in the Connectors Directory. The supported path for **directory listing** is a **plugin bundle**. The `.mcpb` remains the best path for a **Desktop settings UI** — see [DISTRIBUTION.md](DISTRIBUTION.md) (two modes).

**Portal:** https://claude.ai/directory/manage  
**Escalations:** `directory@anthropic.com` (portal) · `mcp-review@anthropic.com` (legacy form)

---

## Two modes (read this first)

| Mode | Package | Directory? | Config UI |
|---|---|---|---|
| **1 — Desktop extension** | `.mcpb` from [Releases](https://github.com/akeyless-community/claude-akeyless-connector/releases) | No (deprecated as a listing type) | **Yes** — Gateway / Access ID / Key form |
| **2 — Claude plugin** | `plugins/akeyless-ara` (this submission) | **Yes** — this pack | Env vars (`AKEYLESS_*`), not the MCPB form |

Submit **Mode 2** to the portal. Keep publishing **Mode 1** `.mcpb` assets on GitHub for users who need the configuration screen. Details: [DISTRIBUTION.md](DISTRIBUTION.md).

---

## What to submit

| Field | Value |
|---|---|
| **Submission type** | Plugin bundle |
| **GitHub repository** | `akeyless-community/claude-akeyless-connector` |
| **Plugin path** | `plugins/akeyless-ara` |
| **Branch / tag** | `main` (or a release tag such as `v0.3.1`) |
| **Marketplace (self-host)** | Repo root `.claude-plugin/marketplace.json` |

---

## Listing copy

| Field | Value |
|---|---|
| **Name** | Akeyless Agentic Runtime Authority |
| **Tagline** | Secure database & cloud access without exposing secrets |
| **npm package** (runtime) | `@akeyless-community/claude-connector` |
| **Documentation** | https://github.com/akeyless-community/claude-akeyless-connector#readme |
| **Privacy policy** | https://www.akeyless.io/privacy-policy/ |
| **Support** | https://github.com/akeyless-community/claude-akeyless-connector/issues |
| **Company** | Akeyless |
| **Website** | https://www.akeyless.io |

### Description

Connect Claude to [Akeyless Agentic Runtime Authority (ARA)](https://docs.akeyless.io/docs/agentic-runtime-authority) using the official Akeyless Node.js SDK — no CLI required.

**Tools:** `list-secrets` · `query-db` · `service-execute` · `list-sub-tools`

Credentials stay in the Akeyless Gateway. Claude only sees query/action results, never long-lived secrets.

**Install note for reviewers:** This directory listing is the **plugin** (env-based config). For the Claude Desktop settings form, reviewers may also use the `.mcpb` from GitHub Releases — see DISTRIBUTION.md.

### Categories (suggested)

- Security
- Developer Tools
- Data & Analytics

---

## Portal steps (Enterprise Owner / Directory role)

1. Open https://claude.ai/directory/manage → **Submit new** → **Plugin bundle**
2. Connect your GitHub account for this Claude organization
3. Repository: `akeyless-community/claude-akeyless-connector`
4. Plugin path: `plugins/akeyless-ara`
5. Run **Validate**, fix any findings, then complete Data handling + Compliance
6. **Submit for review** → when checks pass, **Publish**
7. Optional: **Settings → Updates → Set up** GitHub push webhook so `main` pushes are scanned within minutes

### Parallel: org / customer installs without waiting

Users can add the marketplace today:

```text
Add marketplace from GitHub: akeyless-community/claude-akeyless-connector
Install: akeyless-ara
```

Requires Node.js 18+ and `AKEYLESS_*` env vars (see plugin README). For a config form, give them the `.mcpb` instead.

---

## Reviewer test guide

> Fill in the bracketed placeholders before submitting.

### Prerequisites

1. Claude Desktop or Cowork with plugins enabled
2. Node.js ≥ 18
3. Install plugin `akeyless-ara` from this repo (marketplace or directory listing)
4. Set env:

| Setting | Value |
|---|---|
| `AKEYLESS_GATEWAY_URL` | `[GATEWAY_URL e.g. https://gw.example.com:8000/api/v2]` |
| `AKEYLESS_ACCESS_TYPE` | `access_key` |
| `AKEYLESS_ACCESS_ID` | `[ACCESS_ID]` |
| `AKEYLESS_ACCESS_KEY` | `[ACCESS_KEY]` |
| `AKEYLESS_AGENT_ID` | `claude-reviewer` |

### Test steps

1. Enable the plugin → start a **new** chat
2. **list-secrets** — *"Use list-secrets to show my ARA secrets"*
3. **query-db** — *"Run `SELECT 1` against `[DB_SECRET_PATH]` using query-db"*
4. **service-execute** — *"Use service-execute on `[SERVICE_SECRET_PATH]` with payload `[SAFE_READ_ONLY_ACTION]`"*
5. Optional — **list-sub-tools** on the service secret

### Sample ARA secrets on test tenant

| Secret path | Type | Suggested test |
|---|---|---|
| `[DB_SECRET_PATH]` | postgres/mysql/snowflake | `SELECT 1` |
| `[AWS_SECRET_PATH]` | aws | `list S3 buckets` (read-only) |

---

## Attachments checklist

- [ ] Plugin path `plugins/akeyless-ara` on public `main`
- [ ] `LICENSE` (MIT) inside the plugin folder
- [ ] Plugin README + root Privacy Policy section
- [ ] Reviewer credentials filled in above
- [ ] `claude plugin validate ./plugins/akeyless-ara` (if Claude Code CLI available)

## Legacy MCPB form

The Google Form used for desktop extensions is obsolete for directory listing. If you previously submitted that form with no reply, email `mcp-review@anthropic.com` / `directory@anthropic.com` noting you are migrating to a **plugin bundle** via the Enterprise portal.

The `.mcpb` release assets remain useful for **manual** Claude Desktop install with a settings UI (Mode 1), but they are no longer the directory submission vehicle.
