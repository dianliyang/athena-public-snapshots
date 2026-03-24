# R2 Dashboard Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a local Docker-run dashboard for browsing and managing existing R2 objects with inline text editing, binary replacement, and delete actions.

**Architecture:** Add a small Node HTTP admin server under `src/admin/` that talks to Cloudflare R2 via its S3-compatible API, renders a server-side HTML dashboard, and exposes simple update/delete endpoints. Keep the UI dependency-light so it fits the existing TypeScript setup and is easy to run inside one Docker container.

**Tech Stack:** TypeScript, Node HTTP server, AWS SDK S3 client, Vitest, Docker

---

### Task 1: Add the first failing tests for dashboard rendering and file classification

**Files:**
- Create: `src/__tests__/admin-dashboard.test.ts`
- Create: `src/admin/render-dashboard.ts`
- Create: `src/admin/file-kinds.ts`

**Step 1: Write the failing test**

Write tests that assert:

- the dashboard HTML includes the provided object keys and selected key
- JSON keys are treated as editable text
- image or binary-like keys are treated as non-editable

**Step 2: Run test to verify it fails**

Run: `npm test -- src/__tests__/admin-dashboard.test.ts`
Expected: FAIL because the new modules do not exist yet

**Step 3: Write minimal implementation**

Implement:

- `isTextEditableKey(key: string): boolean`
- `renderDashboardPage(input): string`

Keep the first HTML minimal and only satisfy the tested behaviors.

**Step 4: Run test to verify it passes**

Run: `npm test -- src/__tests__/admin-dashboard.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/__tests__/admin-dashboard.test.ts src/admin/render-dashboard.ts src/admin/file-kinds.ts
git commit -m "test: add dashboard rendering coverage"
```

### Task 2: Add the first failing tests for the admin server routes

**Files:**
- Create: `src/__tests__/admin-server.test.ts`
- Create: `src/admin/create-admin-server.ts`
- Create: `src/admin/r2-admin-client.ts`

**Step 1: Write the failing test**

Write route tests around a fake R2 client for:

- `GET /` returns rendered HTML with listed keys
- `GET /?key=...` includes selected object contents
- `POST /save` updates a text object
- `POST /delete` deletes the selected key

**Step 2: Run test to verify it fails**

Run: `npm test -- src/__tests__/admin-server.test.ts`
Expected: FAIL because the server module does not exist yet

**Step 3: Write minimal implementation**

Implement a small HTTP handler factory that accepts an injected admin client with:

- `list(prefix)`
- `get(key)`
- `putText(key, body, contentType?)`
- `delete(key)`

Use URL-encoded form parsing first. Keep multipart support for the next task.

**Step 4: Run test to verify it passes**

Run: `npm test -- src/__tests__/admin-server.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/__tests__/admin-server.test.ts src/admin/create-admin-server.ts src/admin/r2-admin-client.ts
git commit -m "feat: add admin server routes"
```

### Task 3: Add failing tests for binary replacement and implement upload support

**Files:**
- Modify: `src/__tests__/admin-server.test.ts`
- Modify: `src/admin/create-admin-server.ts`

**Step 1: Write the failing test**

Add a test that posts multipart form data with a replacement file and verifies the selected key is overwritten with the uploaded bytes.

**Step 2: Run test to verify it fails**

Run: `npm test -- src/__tests__/admin-server.test.ts`
Expected: FAIL because multipart replacement is not implemented

**Step 3: Write minimal implementation**

Add multipart parsing using the Web `Request` API or a small Node-native parsing path, then wire replacement uploads through the admin client.

**Step 4: Run test to verify it passes**

Run: `npm test -- src/__tests__/admin-server.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/__tests__/admin-server.test.ts src/admin/create-admin-server.ts
git commit -m "feat: support admin file replacement uploads"
```

### Task 4: Add the concrete R2 client and local entrypoint

**Files:**
- Modify: `src/admin/r2-admin-client.ts`
- Create: `src/run-admin-dashboard.ts`
- Modify: `package.json`

**Step 1: Write the failing test**

Add tests for configuration loading and client method mapping if needed, or a narrow integration-style unit test that verifies env parsing for bucket, endpoint, and credentials.

**Step 2: Run test to verify it fails**

Run: `npm test -- src/__tests__/admin-server.test.ts`
Expected: FAIL because live client creation/env loading is incomplete

**Step 3: Write minimal implementation**

Use the AWS SDK S3 client configured for Cloudflare R2 and add:

- env-based config loader
- local startup script
- `npm` script for the dashboard

**Step 4: Run test to verify it passes**

Run: `npm test -- src/__tests__/admin-server.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/admin/r2-admin-client.ts src/run-admin-dashboard.ts package.json package-lock.json
git commit -m "feat: wire dashboard to R2"
```

### Task 5: Add Docker support and usage docs

**Files:**
- Create: `Dockerfile`
- Create: `.dockerignore`
- Modify: `README.md`

**Step 1: Write the failing test**

No automated test required for Dockerfile creation. Instead, define the exact manual verification command before editing.

**Step 2: Run verification to confirm the gap**

Run after file creation later:
`docker build -t athena-r2-dashboard .`
Expected before implementation: command cannot succeed because Docker files do not exist yet

**Step 3: Write minimal implementation**

Add a simple Docker image that runs the dashboard on port `3000` and document all required environment variables.

**Step 4: Run verification to verify it passes**

Run:
- `docker build -t athena-r2-dashboard .`
- `docker run --rm -p 3000:3000 --env ... athena-r2-dashboard`

Expected: image builds and the server starts

**Step 5: Commit**

```bash
git add Dockerfile .dockerignore README.md
git commit -m "docs: add local docker dashboard"
```

### Task 6: Run the full test suite and finish

**Files:**
- Modify: any touched files as needed

**Step 1: Run focused tests**

Run:
- `npm test -- src/__tests__/admin-dashboard.test.ts`
- `npm test -- src/__tests__/admin-server.test.ts`

Expected: PASS

**Step 2: Run the full test suite**

Run: `npm test`
Expected: PASS

**Step 3: Fix any failures minimally**

Keep changes scoped to the dashboard feature or compatibility adjustments.

**Step 4: Re-run the full suite**

Run: `npm test`
Expected: PASS

**Step 5: Commit**

```bash
git add <relevant files>
git commit -m "feat: add local R2 dashboard"
```
