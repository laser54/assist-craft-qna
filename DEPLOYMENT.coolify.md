# Q&A deployment on Coolify

This is a direct migration of the existing production service, not a new DEV environment.

- Source: this repository, branch `main`, `docker-compose.coolify.yml`.
- Control plane: Coolify GitHub App and API only. GitHub Actions validates Compose; it does not publish images or use SSH.
- Two native builds use the existing Dockerfiles. No published host ports, fixed container names or old VPS network.
- HTTPS routing: `qa.larin.work`; `/api` and `/healthz` route to the backend, other paths to the frontend. HTTP redirects to HTTPS.
- Canonical data: resource-scoped `assist-craft-data` volume, `/data/app.db` and SQLite WAL. Pinecone index `ssprag`, namespace `qa` remains external and unchanged.

## Secrets

Store in Bitwarden Secrets Manager, project `hermes_16g`, and configure **runtime only**, never Docker build arguments:

| BWS source | Coolify variable |
|---|---|
| `QNA_PROD_PINECONE_API_KEY` | `PINECONE_API_KEY` |
| `QNA_PROD_PORTAL_PASSWORD` | `PORTAL_PASSWORD` |
| `QNA_PROD_SESSION_SECRET` | `SESSION_SECRET` |

Copy the existing non-secret cookie, session TTL, Pinecone model/index/host/namespace, locale and batch-size settings. In raw Compose mode Coolify does not automatically inject `env_file`; this Compose explicitly loads its generated `.env` for the backend only. `required: false` permits secret-free CI configuration validation, while backend startup still validates required secrets. The frontend also overrides the three secret variables to empty defensively. Do not add `.env` or credentials to image build contexts.

## Migration and rollback

1. Keep the old service running and DNS unchanged during preparation. Leave auto-deploy disabled until authorized and verified.
2. Take a SQLite online backup via the backup API, not a raw `app.db` copy while WAL is active. Run `integrity_check`, record row counts and snapshot hash, and retain restricted backups on both hosts.
3. Deploy the new resource once. Stop it through Coolify before restoring the backup into its generated volume. Preserve its initial empty database separately; do not overwrite a running SQLite database.
4. Restart via Coolify. Verify both containers' health, backend `/healthz`, login/auth boundary, 495 initial Q&A rows, canonical row fingerprints, external Pinecone access and a read-only search. Do not reindex or mutate the shared Pinecone namespace as a test.
5. Before cutover, compare the old database again. If content changed since backup, take a fresh consistent snapshot under an agreed write-freeze and repeat restore. Avoid two writable production copies during DNS propagation.
6. Obtain a separate DNS cutover authorization. Read exact A/AAAA/CNAME and TTL before changing only `qa.larin.work`. Verify provider readback, authoritative DNS, HTTPS with a trusted certificate (no `-k`) and consumer integration.
7. Preserve the old server and data for rollback. Revert only the scoped DNS record when rolling back before new writes. After new writes, reconcile canonical data before rollback; a DNS-only rollback would lose those writes.

TLS issuance uses the existing Coolify proxy and HTTP challenge. Before DNS points to the new host, its certificate may not yet be issued: an insecure direct-IP HTTPS probe can test routing, **not** certificate acceptance. Final TLS verification is mandatory after authorized cutover.

Any native auto-deploy claim requires a real Git push, matching webhook-triggered deployment and running revision; an enabled flag is insufficient.
