# Publishing to npm

Publish `@akeyless-community/claude-connector` for `npx` installs and manual Claude Desktop configuration.

## Prerequisites

- Maintainer access to the `@akeyless-community` npm organization
- npm automation token with publish access to `@akeyless-community/*`

## One-time setup

### 1. npm organization access

```bash
npm whoami
npm org ls akeyless-community
```

Your npm user must be able to publish scoped packages under `@akeyless-community`.

### 2. GitHub secret

In [github.com/akeyless-community/claude-akeyless-connector/settings/secrets/actions](https://github.com/akeyless-community/claude-akeyless-connector/settings/secrets/actions), add:

| Secret | Value |
|---|---|
| `NPM_TOKEN` | npm granular access token with publish access to `@akeyless-community/*` |

Create the token at [npmjs.com/settings/~/tokens](https://www.npmjs.com/settings/~/tokens).

If this secret is missing, the **Publish to npm** workflow fails with `ENEEDAUTH`.

## Release workflow

Publishing is triggered by a **GitHub Release** (see `.github/workflows/publish.yml`).

```bash
npm version patch   # or minor / major
npm run build && npm test
git add package.json package-lock.json
git commit -m "chore: release v0.2.5"
git push origin main

gh release create v0.2.5 \
  --repo akeyless-community/claude-akeyless-connector \
  --title "v0.2.5" \
  --notes "Release notes here."
```

You can also trigger publish manually from **Actions → Publish to npm → Run workflow**.

## Verify publish

```bash
npm view @akeyless-community/claude-connector version
npx -y @akeyless-community/claude-connector --help 2>&1 | head
```

## Manual publish (local)

```bash
npm login
npm run build && npm test
npm publish --access public
```

## Install after publish

Claude Desktop manual config:

```json
{
  "mcpServers": {
    "akeyless": {
      "command": "npx",
      "args": ["-y", "@akeyless-community/claude-connector"],
      "env": {
        "AKEYLESS_GATEWAY_URL": "https://your-gateway.example.com:8000/api/v2",
        "AKEYLESS_ACCESS_ID": "p-xxxxx",
        "AKEYLESS_ACCESS_KEY": "your-access-key",
        "AKEYLESS_AGENT_ID": "claude-desktop"
      }
    }
  }
}
```

Global install:

```bash
npm install -g @akeyless-community/claude-connector
akeyless-claude-mcp
```
