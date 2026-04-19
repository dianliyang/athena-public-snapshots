# athena-public-snapshots

Builds and publishes public workout detail JSON snapshots and locale artifacts to Cloudflare R2.

## Local R2 Dashboard

This repo also includes a local-only dashboard for managing existing files in R2.

Set these environment variables:

```bash
R2_ACCOUNT_ID=...
R2_ACCESS_KEY_ID=...
R2_SECRET_ACCESS_KEY=...
R2_BUCKET_NAME=athena-public-catalogs
```

Optional:

```bash
DASHBOARD_PORT=3000
DASHBOARD_PREFIX=workouts/
R2_REGION=auto
R2_ENDPOINT=https://<account-id>.r2.cloudflarestorage.com
```

Run locally:

```bash
npm run dashboard
```

Run with Docker:

```bash
docker build -t athena-r2-dashboard .
docker run --rm -p 3000:3000 \
  -e R2_ACCOUNT_ID \
  -e R2_ACCESS_KEY_ID \
  -e R2_SECRET_ACCESS_KEY \
  -e R2_BUCKET_NAME \
  -e DASHBOARD_PREFIX=workouts/ \
  athena-r2-dashboard
```

The dashboard lets you:

- browse existing keys by prefix
- open text and JSON files in a browser editor
- replace any existing object with an uploaded file
- delete existing objects

## Architecture

This repo uses two user-facing publish modes:

- `refresh`: scrape workout sources, build fresh workout detail data, then append missing locale data from the latest published version.
- `legacy`: reuse the latest published workout detail data, append missing locale data, stamp a new version, and republish.
- The Cloudflare Worker reads published data from R2 and serves the public files.

## Cloudflare Scheduled Publish

The scheduled Worker publishes workout detail snapshot artifacts from data already stored in R2.

- Worker entrypoint: [`src/worker.ts`](src/worker.ts)
- R2 binding: `SNAPSHOTS_BUCKET`
- Target bucket: `athena-public-catalogs`
- Required worker secret: `GOOGLE_TRANSLATE_API_KEY`
- Default cron: every day at 22:00 UTC via [`wrangler.jsonc`](wrangler.jsonc)
The scheduled Worker does not scrape source websites.

## Local Pipeline

Run the local bash script:

```bash
./scripts/scrape-workouts-and-publish.sh
./scripts/scrape-workouts-and-publish.sh legacy
./scripts/scrape-workouts-and-publish.sh refresh
./scripts/scrape-workouts-and-publish.sh --bucket=athena-public-catalogs
```

The script:

- defaults to `legacy` mode and pulls the latest published workout detail snapshot from R2
- runs `npm run publish-workouts -- --mode=refresh` in `refresh` mode
- runs `npm run publish-workouts -- --mode=legacy` in `legacy` mode
- refreshes locale artifacts during both modes
- publishes `workouts/detail/...`, `workouts/manifest.json`, and workout locale files to R2

Use `refresh` when you want to scrape new source data before publishing. Scraper arguments are passed through only in `refresh` mode, and `--target=...` can limit which scraper source runs:

```bash
./scripts/scrape-workouts-and-publish.sh refresh --target=ricks-club
./scripts/scrape-workouts-and-publish.sh refresh --semester=su26
./scripts/scrape-workouts-and-publish.sh refresh --bucket=athena-public-catalogs --target=cau-sport
```

By default the target bucket is `athena-public-catalogs`. You can override it either with `--bucket=...` or `R2_BUCKET_NAME`:

```bash
./scripts/scrape-workouts-and-publish.sh --bucket=my-bucket
R2_BUCKET_NAME=my-bucket ./scripts/scrape-workouts-and-publish.sh
```
