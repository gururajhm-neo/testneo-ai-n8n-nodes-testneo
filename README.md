# n8n-nodes-testneo 

Official **TestNeo** community node for n8n. Same REST contracts as the HTTP templates in [`examples/n8n/`](../../examples/n8n/) — agent-run ingest, semantic assert, golden test execute/poll, release outcomes, and a one-shot **Post-Agent Verification** gate (PASS/BLOCK).

| Claim | Reality |
|-------|---------|
| Community / Marketplace node | **This package** (`n8n-nodes-testneo`) |
| Importable HTTP workflows | Still available as fallback in `examples/n8n/templates/` |

## Install (self-hosted n8n)

```bash
# Community nodes UI, or:
cd ~/.n8n
npm install n8n-nodes-testneo
# restart n8n
```

Cloud n8n: install via **Settings → Community nodes** once the package is published to npm and listed in the Creator Portal.

## Credentials

| Field | Example |
|-------|---------|
| API Key | `tn_…` (Settings → API Keys) |
| Base URL | `https://app.testneo.ai` |
| Web App URL | `https://app.testneo.ai` (dashboard links) |

Credential test hits `GET /api/web/v1/projects`.

## Operations (map 1:1 to templates)

| Operation | Template | Route |
|-----------|----------|-------|
| **Post-Agent Verification** | 01 | ingest → semantic → execute → poll → `verdict` |
| Ingest Agent Run | 02 | `POST …/ingest/agent-run` |
| Semantic Assert | 01 | `POST /semantic-assert` |
| Execute Test Case | 01 | `POST …/test-cases/{id}/execute` |
| Get / Poll Execution | 01 | `GET …/analytics/execution/{id}/summary` |
| Mark Deployed | 03 | `POST /release-readiness/outcome` |
| List Outcomes | 03 | `GET /release-readiness/outcomes` |
| Record Outcome | 03 | `PATCH /release-readiness/outcome/{id}` |

Contracts: [`examples/n8n/CONTRACTS.md`](../../examples/n8n/CONTRACTS.md).

### Post-Agent Verification output

```json
{
  "verdict": "PASS",
  "contract_version": "n8n_post_agent_verification.v1",
  "ingest": { "…": "…" },
  "semantic": { "passed": true },
  "execute": { "execution_id": "…" },
  "poll": { "status": "passed", "passed": true },
  "dashboard_url": "https://app.testneo.ai/test-runner/execution/…"
}
```

- **Fail Workflow on BLOCK** (default `true`) throws so IF/Error branches can stop the pipeline.
- **Skip Execution** = contract-only mode (ingest + semantic), same idea as `smoke_http.py --mode contract`.
- **Use Local Agent** = `use_agent: true` only when the TestNeo local agent is connected.

## Develop

```bash
cd packages/n8n-nodes-testneo
npm install
npm test
npm run build
```

Link into a local n8n for UI testing:

```bash
npm link
# in your n8n custom nodes folder or via N8N_CUSTOM_EXTENSIONS
```

## Publish (npm provenance — required after May 1 2026)

1. Bump version in `package.json`.
2. Tag from this package path (or monorepo release process), e.g. `n8n-nodes-testneo@0.1.0`.
3. GitHub Actions [`.github/workflows/publish-n8n-nodes-testneo.yml`](../../.github/workflows/publish-n8n-nodes-testneo.yml) builds with `--provenance`.

Configure npm Trusted Publishing (OIDC) or set `NPM_TOKEN`.

## License

MIT
