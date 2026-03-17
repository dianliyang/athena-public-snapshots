# athena-public-snapshots

Builds and publishes public browse/detail JSON snapshots for Athena catalogs to Cloudflare R2.

## Cloudflare Scheduled Publish

This repo can run as a scheduled Cloudflare Worker and publish the JSON snapshots directly to R2.

- Worker entrypoint: [`src/worker.ts`](/Users/wagagaha/vibe/athena-public-snapshots/src/worker.ts)
- R2 binding: `SNAPSHOTS_BUCKET`
- Default cron: every 6 hours via [`wrangler.jsonc`](/Users/wagagaha/vibe/athena-public-snapshots/wrangler.jsonc)

The scheduled Worker publishes only the JSON snapshot artifacts. It does not update Vectorize indexes.
