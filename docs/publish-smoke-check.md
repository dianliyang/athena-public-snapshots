# Snapshot Publish Smoke Check

## Verification Steps
1. Run the snapshot builder/publisher: `npm start` (or equivalent trigger).
2. Verify objects in R2 bucket `athena-public-catalogs`:
   - `courses/manifest.json` exists and has current timestamp.
   - `workouts/manifest.json` exists and has current timestamp.
   - `courses/browse/<version>.json` and `courses/detail/<version>.json` exist.
3. Check manifest content:
   ```json
   {
     "version": "...",
     "itemCount": > 0
   }
   ```
