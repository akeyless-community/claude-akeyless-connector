# Connectors Directory — Submission Pack

Use this document when completing Anthropic's **desktop extension interest form**:

https://docs.google.com/forms/d/14_Dmcig4z8NeRMB_e7TOyrKzuZ88-BLYdLvS6LPhiZU/viewform

Escalations: `mcp-review@anthropic.com`

---

## Listing copy (pre-filled)

| Field | Value |
|---|---|
| **Name** | Akeyless Agentic Runtime Authority |
| **Tagline** (≤55 chars) | Secure database & cloud access without exposing secrets |
| **npm package** | `@akeyless-community/claude-connector` |
| **GitHub** | https://github.com/akeyless-community/claude-akeyless-connector |
| **Documentation** | https://github.com/akeyless-community/claude-akeyless-connector#readme |
| **Privacy policy** | https://www.akeyless.io/privacy-policy/ |
| **Support** | https://github.com/akeyless-community/claude-akeyless-connector/issues |
| **Company** | Akeyless |
| **Website** | https://www.akeyless.io |

### Description (for form)

Connect Claude Desktop to [Akeyless Agentic Runtime Authority (ARA)](https://docs.akeyless.io/docs/agentic-runtime-authority) using the official Akeyless Node.js SDK — no CLI required.

**Tools:** `list-secrets` · `query-db` · `service-execute`

Credentials stay in the Akeyless Gateway. Claude only sees query/action results, never long-lived secrets.

**Install options:**
- One-click `.mcpb` desktop extension
- `npx @akeyless-community/claude-connector` for manual Claude Desktop config

### Categories (suggested)

- Security
- Developer Tools
- Data & Analytics

### Use cases

- List ARA-enabled dynamic/rotated secrets the user's role can access
- Run read-only or approved SQL against databases via dynamic secrets
- Execute AWS, GCP, Azure, Kubernetes, or GitHub actions without exposing cloud credentials to the model

**Reads data:** yes (`list-secrets`, SELECT queries)  
**Writes data:** yes (`query-db` DML, `service-execute` cloud/K8s actions — user approval required in Claude)

### Authentication

Users configure their own Akeyless auth in the extension settings UI:
- Access Key (default)
- SAML / OIDC (browser login on first use)
- Universal Identity, JWT, AWS IAM, Azure AD, GCP

No OAuth to Akeyless SaaS — credentials are stored in the OS keychain by Claude Desktop.

### Tools & annotations

| Tool | Title | Annotation |
|---|---|---|
| `list-secrets` | List ARA Secrets | `readOnlyHint: true` |
| `query-db` | Query Database | `destructiveHint: true` |
| `service-execute` | Execute Service Action | `destructiveHint: true` |

---

## Reviewer test guide

> **Fill in the bracketed placeholders before submitting.**

### Prerequisites

1. Claude Desktop ≥ 1.0.0 (macOS or Windows)
2. Install the attached `.mcpb` from GitHub Release **v0.2.5**, or:
   ```bash
   npx -y @akeyless-community/claude-connector
   ```

### Configuration

| Setting | Value |
|---|---|
| Gateway URL | `[GATEWAY_URL e.g. https://gw.example.com:8000/api/v2]` |
| Authentication Method | `access_key` |
| Access ID | `[ACCESS_ID]` |
| Access Key | `[ACCESS_KEY]` |
| Agent ID | `claude-reviewer` |

### Test steps

1. **Enable extension** — Settings → Extensions → enable **Akeyless Agentic Runtime Authority**
2. **list-secrets** — New chat → ask: *"Use list-secrets to show my ARA secrets"*
   - Expected: JSON list with secret paths and target types (no credentials)
3. **query-db** — Ask: *"Run `SELECT 1` against `[SECRET_PATH]` using query-db"*
   - Expected: query result JSON; note says credentials were not exposed
4. **service-execute** — Ask: *"Use service-execute on `[SERVICE_SECRET_PATH]` with payload `[SAFE_READ_ONLY_ACTION]`"*
   - Expected: action result JSON

### Sample ARA secrets on test tenant

| Secret path | Type | Suggested test |
|---|---|---|
| `[DB_SECRET_PATH]` | postgres/mysql | `SELECT 1` |
| `[AWS_SECRET_PATH]` | aws | `list S3 buckets` (read-only) |

---

## Attachments checklist

- [ ] `claude-akeyless-connector.mcpb` from [GitHub Release v0.2.5](https://github.com/akeyless-community/claude-akeyless-connector/releases/tag/v0.2.5)
- [ ] `icon.png` (512×512 — included in repo root)
- [ ] Completed reviewer credentials (section above)

## Allowed link URIs (if asked)

Only needed for SAML/OIDC browser login during auth:

- `https://[your-gateway-host]` (Gateway config port origin)

---

## What you need to provide

Before submitting, replace every `[PLACEHOLDER]` in the reviewer guide with a **dedicated demo tenant**:

1. Gateway URL reachable from reviewer machines (public SaaS GW or VPN instructions)
2. Access ID + Access Key for a least-privilege ARA reviewer role
3. At least one DB dynamic secret and one service secret with ARA enabled + `ara_allow_access`
4. Confirm macOS test passed on your side (Windows if available)
