# Claude Connectors Directory & Remote Variant

This connector ships in two distribution forms today:

| Form | Status | Install |
|---|---|---|
| **npm package** | Published | [`npx @akeyless-community/claude-connector`](https://www.npmjs.com/package/@akeyless-community/claude-connector) |
| **Claude plugin + marketplace** | Ready | `plugins/akeyless-ara` · add marketplace `akeyless-community/claude-akeyless-connector` |
| **Anthropic directory (plugin)** | Submit via Enterprise portal | [docs/SUBMISSION.md](SUBMISSION.md) · [claude.ai/directory/manage](https://claude.ai/directory/manage) |
| **Desktop extension (MCPB)** | Manual install only | [GitHub Releases](https://github.com/akeyless-community/claude-akeyless-connector/releases) — **not** accepted as a standalone directory listing anymore |
| **Remote MCP connector** | Not built yet | see below |

## Directory path (plugin bundle)

Anthropic deprecated standalone MCPB listings. Local ARA is distributed as a **plugin** that launches the published npm MCP server via `npx`.

Docs: [Submit your plugin](https://claude.com/docs/plugins/submit) · [Submit a connector](https://claude.com/docs/connectors/building/submission)

### Already in place

- [x] `plugins/akeyless-ara/.claude-plugin/plugin.json`
- [x] `plugins/akeyless-ara/.mcp.json` (stdio → `@akeyless-community/claude-connector`)
- [x] Skill + plugin README + MIT LICENSE
- [x] Repo marketplace catalog (`.claude-plugin/marketplace.json`)
- [x] Root README privacy policy + npm package with tool annotations
- [x] Public GitHub repo

### Still needed before portal publish

1. **Enterprise Owner** (or Directory role) opens [claude.ai/directory/manage](https://claude.ai/directory/manage)
2. Connect GitHub → submit plugin path `plugins/akeyless-ara`
3. **Reviewer demo tenant** (Gateway URL, Access ID/Key, ARA secrets) — fill [SUBMISSION.md](SUBMISSION.md)
4. Validate + submit + Publish when checks pass

### Submission checklist

- [ ] Reviewer test account + populated ARA secrets
- [ ] Plugin installed via marketplace and tools exercised
- [ ] Portal Validate passes
- [ ] Submit for review / Publish
- [ ] Email `directory@anthropic.com` if a legacy MCPB form submission is still open

---

## Remote MCP connector variant

The current connector is a **local stdio MCP server** that talks directly to **each user's Akeyless Gateway**. That is the right model for gateways behind corporate firewalls.

A **remote MCP connector** is different:

| | Local MCPB (current) | Remote MCP (future) |
|---|---|---|
| Runs on | User's machine | Your HTTPS server |
| Claude connects from | Local stdio | Anthropic cloud → your URL |
| Gateway access | User's network | Must be reachable from your server |
| Auth model | User config / env vars | OAuth 2.0 (directory requirement) |
| Works with private GW | Yes | Only with custom-connection pattern |

Docs: [Remote MCP custom connectors](https://support.claude.com/en/articles/11175166-get-started-with-custom-connectors-using-remote-mcp)

### Why remote is non-trivial for Akeyless ARA

1. **Per-tenant gateways** — Each customer has their own Gateway URL, often on a private network.
2. **Anthropic connects from the cloud** — Remote MCP traffic originates from [Anthropic IP ranges](https://platform.claude.com/docs/en/api/ip-addresses), not the user's laptop.
3. **No single shared API** — Unlike SaaS products with one OAuth endpoint, ARA execution targets the customer's Gateway config port.

### Viable remote architectures

**Option A — Custom connection (directory-friendly for multi-tenant SaaS)**

- Host a public HTTPS MCP server (Streamable HTTP transport).
- In the submission portal, choose **custom connection**: each user supplies their Gateway URL and credentials at connect time.
- Your server proxies auth + ARA calls to the user-provided Gateway.
- Users must expose Gateway to your server's egress IPs (or use a SaaS Gateway).

**Option B — Akeyless-hosted remote broker**

- Akeyless runs a multi-tenant remote MCP endpoint (e.g. `mcp.akeyless.io`).
- OAuth 2.0 with Akeyless as IdP; session bound to tenant + role.
- Gateway calls originate from Akeyless infrastructure (same trust zone as today’s Console/API).
- Requires product/backend work beyond this npm package.

**Option C — Keep local-only (recommended for enterprise)**

- Anthropic explicitly recommends MCPB for resources behind the firewall.
- Directory listing as **desktop extension** covers discoverability without building remote infra.

### Remote directory submission (when built)

Uses the **Claude.ai admin submission portal** (Team / Enterprise org required):

1. Public HTTPS MCP URL (`https://…`)
2. Streamable HTTP transport (SSE deprecated)
3. OAuth 2.0 with `https://claude.ai/api/mcp/auth_callback` registered
4. Tool annotations on every tool
5. Privacy policy, documentation, support contact
6. Test account with end-to-end reviewer instructions
7. Allowlist Anthropic IPs if a firewall sits in front of your server

### Recommended path

1. **Now:** Publish npm package + submit **MCPB** to the Connectors Directory.
2. **Later:** If you need claude.ai / mobile / Cowork without local install, design **Option A or B** as a separate service — not a packaging change to this repo.
