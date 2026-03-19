# athena-public-snapshots

Builds and publishes public browse/detail JSON snapshots for Athena catalogs to Cloudflare R2.

## Cloudflare Scheduled Publish

This repo can run as a scheduled Cloudflare Worker and publish the JSON snapshots directly to R2.

- Worker entrypoint: [`src/worker.ts`](src/worker.ts)
- R2 binding: `SNAPSHOTS_BUCKET`
- Target bucket: `athena-public-catalogs`
- Required worker secret: `GOOGLE_TRANSLATE_API_KEY`
- Default cron: every day at 22:00 UTC via [`wrangler.jsonc`](wrangler.jsonc)

The scheduled Worker publishes workout JSON snapshot artifacts only. It does not scrape courses or update Vectorize indexes.
