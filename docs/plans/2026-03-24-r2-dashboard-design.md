# R2 Dashboard Design

## Goal

Add a local-only dashboard that runs in Docker and lets the user manage existing files in Cloudflare R2 through a browser.

## Scope

The dashboard will:

- connect directly to an existing R2 bucket with credentials from environment variables
- list existing object keys in a folder-like tree
- open an object and show its contents
- allow inline editing for text and JSON files
- allow binary replacement through a file upload control
- delete existing objects
- write updates directly back to R2 when the user saves

The dashboard will not:

- create new files from scratch
- deploy to Cloudflare
- replace the existing workout publishing pipeline

## Recommended Approach

Build a small Node server with server-rendered HTML and minimal client-side JavaScript.

This keeps the implementation simple, avoids introducing a frontend build pipeline, and fits the repo's current TypeScript tooling. The server will expose a few admin routes for listing, reading, updating, replacing, and deleting objects. The browser UI will be plain HTML forms with a little JavaScript for navigation and editor behavior.

## Architecture

### Server

Create a new local admin server entrypoint that:

- serves the dashboard page
- uses a small R2 client abstraction backed by the AWS S3-compatible API
- returns object listings for a prefix
- returns object bodies and metadata for a selected key
- accepts text updates for editable files
- accepts multipart uploads to replace binary or text files
- deletes keys

### UI

The dashboard page will:

- show a prefix input to narrow the file tree
- render folder-style navigation based on object keys
- show a file detail panel when a key is selected
- render a textarea for text-like files
- render a download/replacement form for binary files
- provide save and delete actions

### Docker

Add a simple Docker image that:

- installs dependencies
- builds or runs the admin server
- exposes one local port
- reads R2 credentials and bucket configuration from environment variables

## Data Flow

1. Browser loads `/`.
2. Server requests object listings from R2 and renders the tree.
3. User selects a file.
4. Server fetches object contents and returns metadata plus body.
5. User edits text or chooses a replacement file.
6. Server writes the updated object back to R2.
7. UI reloads the selected key and refreshed listing.

## Error Handling

- Missing configuration returns a clear startup error.
- Missing keys return a 404 in the UI.
- Non-text files are not opened in the inline editor.
- Failed R2 writes surface an inline error message and keep the current file selection.

## Testing

Add focused tests for:

- listing and folder-tree shaping
- text/binary file classification
- HTML rendering for dashboard states
- update/delete route behavior against a mocked R2 client

## Files Expected

- new admin server files under `src/admin/`
- tests for the admin server under `src/__tests__/`
- a `Dockerfile`
- README updates documenting local usage
