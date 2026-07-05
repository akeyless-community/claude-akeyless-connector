# Claude Connectors Directory & Remote Variant

This connector ships in two distribution forms today:

| Form | Status | Install |
|---|---|---|
| **npm package** | Published | [`npx @akeyless-community/claude-connector`](https://www.npmjs.com/package/@akeyless-community/claude-connector) |
| **Desktop extension (MCPB)** | Ready — submit to directory | [GitHub Releases](https://github.com/akeyless-community/claude-akeyless-connector/releases) |
| **Connectors Directory (MCPB listing)** | Awaiting submission | [docs/SUBMISSION.md](SUBMISSION.md) |
| **Remote MCP connector** | Not built yet | [docs/DIRECTORY_AND_REMOTE.md](DIRECTORY_AND_REMOTE.md) |

## Connectors Directory (desktop extension / MCPB)

Local MCPB connectors use the **desktop extension submission form**, not the remote MCP portal.

Docs: [Submitting to the Connectors Directory](https://claude.com/docs/connectors/building/submission)

### Already in place

- [x] `manifest.json` with `privacy_policies`
- [x] `icon.png` (512×512)
- [x] Tool `title` + `readOnlyHint` / `destructiveHint` annotations
- [x] README with setup instructions
- [x] Support URL (GitHub Issues)
- [x] Documentation URL

### Still needed before submission

1. **Test credentials for reviewers**
   - Akeyless Gateway URL reachable from reviewer machines (or provide a shared demo tenant)
   - Access ID + Access Key (or SAML/OIDC test account)
   - At least one ARA-enabled dynamic secret with `ara_allow_access` on the role
   - Step-by-step reviewer guide in the submission form

2. **Cross-platform smoke test**
   - macOS and Windows Claude Desktop
   - All three tools exercised: `list-secrets`, `query-db`, `service-execute`

3. **Privacy policy section in README**
   - Required for local connectors (see README Privacy Policy section)

4. **Build and attach the `.mcpb`**
   ```bash
   npm run pack:mcpb
   ```
   Submit `claude-akeyless-connector.mcpb` via the [desktop extension submission form](https://claude.com/docs/connectors/building/submission).

5. **Optional: allowed link URIs**
   - If SAML/OIDC browser login opens IdP URLs, declare owned origins in the submission (e.g. your Gateway host).

6. **Public GitHub repo**
   - Directory listing expects public documentation; make the repo public when ready.

### Submission checklist

- [ ] Reviewer test account + populated ARA secrets
- [ ] macOS + Windows tested
- [ ] Every tool run successfully in Claude Desktop
- [ ] `.mcpb` built from tagged release
- [ ] Desktop extension submission form completed
- [ ] Respond to review feedback at `mcp-review@anthropic.com` if needed

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
