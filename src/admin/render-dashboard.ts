function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\"", "&quot;")
    .replaceAll("'", "&#39;");
}

function renderStatusBanner(notice?: string, error?: string): string {
  if (notice) {
    return `<div class="banner banner-success">${escapeHtml(notice)}</div>`;
  }

  if (error) {
    return `<div class="banner banner-error">${escapeHtml(error)}</div>`;
  }

  return "";
}

export type DashboardSelection = {
  body: string;
  contentType?: string;
  editable: boolean;
  jsonError?: string;
};

export type DashboardPageInput = {
  prefix: string;
  keys: string[];
  selectedKey?: string;
  selectedObject?: DashboardSelection;
  notice?: string;
  error?: string;
};

export function renderDashboardPage(input: DashboardPageInput): string {
  const keyList = input.keys
    .map((key) => {
      const isSelected = key === input.selectedKey;
      const href = `/?prefix=${encodeURIComponent(input.prefix)}&key=${encodeURIComponent(key)}`;
      return `
        <li class="file-item">
          <a class="file-link" href="${href}"${isSelected ? " aria-current=\"page\"" : ""}>${escapeHtml(key)}</a>
        </li>
      `;
    })
    .join("");

  const deleteForm = input.selectedKey
    ? `
      <form class="inline-form" method="post" action="/delete">
        <input type="hidden" name="prefix" value="${escapeHtml(input.prefix)}" />
        <input type="hidden" name="key" value="${escapeHtml(input.selectedKey)}" />
        <button class="button button-danger" type="submit">Delete</button>
      </form>
    `
    : "";

  const replaceForm = input.selectedKey
    ? `
      <form class="replace-form" method="post" action="/replace" enctype="multipart/form-data">
        <input type="hidden" name="prefix" value="${escapeHtml(input.prefix)}" />
        <input type="hidden" name="key" value="${escapeHtml(input.selectedKey)}" />
        <label class="upload-field">
          <span>Replace file</span>
          <input type="file" name="file" required />
        </label>
        <button class="button button-secondary" type="submit">Upload</button>
      </form>
    `
    : "";

  const details = input.selectedKey && input.selectedObject
    ? input.selectedObject.editable
      ? `
        <div class="editor-header">
          <div>
            <p class="eyebrow">Editing</p>
            <h2>${escapeHtml(input.selectedKey)}</h2>
          </div>
          <dl class="meta-grid">
            <div>
              <dt>Content type</dt>
              <dd>${escapeHtml(input.selectedObject.contentType ?? "text/plain")}</dd>
            </div>
            <div>
              <dt>Mode</dt>
              <dd>${input.selectedKey.toLowerCase().endsWith(".json") ? "JSON editor" : "Text editor"}</dd>
            </div>
          </dl>
        </div>
        <div class="editor-toolbar">
          <button class="button button-primary" type="submit" form="editor-form">${input.selectedKey.toLowerCase().endsWith(".json") ? "Validate and save" : "Save changes"}</button>
          ${input.selectedKey.toLowerCase().endsWith(".json") ? `
            <button class="button button-secondary" type="submit" form="editor-form" formaction="/format-json" formmethod="post">Format JSON</button>
          ` : ""}
          ${input.selectedKey === "workouts/manifest.json" ? `
            <form class="inline-form" method="post" action="/clear-stale">
              <input type="hidden" name="prefix" value="${escapeHtml(input.prefix)}" />
              <input type="hidden" name="key" value="${escapeHtml(input.selectedKey)}" />
              <button class="button button-secondary" type="submit">Clear stale files</button>
            </form>
          ` : ""}
          ${deleteForm}
          <span class="toolbar-note">Writes directly back to R2.</span>
        </div>
        ${renderStatusBanner(input.notice, input.error)}
        ${input.selectedObject.jsonError ? `
          <div class="json-error">
            <strong>Invalid JSON</strong>
            <p>${escapeHtml(input.selectedObject.jsonError)}</p>
          </div>
        ` : ""}
        <form class="editor-form" id="editor-form" method="post" action="/save" data-editor-form>
          <input type="hidden" name="prefix" value="${escapeHtml(input.prefix)}" />
          <input type="hidden" name="key" value="${escapeHtml(input.selectedKey)}" />
          <div class="editor-workbench">
            <div class="editor-pane">
              <div class="editor-pane-label">Editor</div>
              <div class="code-frame">
                <pre class="line-numbers" aria-hidden="true" data-line-numbers>1</pre>
                <textarea class="editor-textarea" name="body" spellcheck="false" wrap="off" rows="28" data-editor-textarea>${escapeHtml(input.selectedObject.body)}</textarea>
              </div>
            </div>
          </div>
        </form>
        <p class="shortcut-hint">Cmd/Ctrl+S to save. Tab indents. Shift+Tab outdents. You will be warned before leaving with unsaved changes.</p>
        <div class="utility-panel">
        </div>
      `
      : `
        <div class="editor-header">
          <div>
            <p class="eyebrow">Selected file</p>
            <h2>${escapeHtml(input.selectedKey)}</h2>
          </div>
          <dl class="meta-grid">
            <div>
              <dt>Content type</dt>
              <dd>${escapeHtml(input.selectedObject.contentType ?? "unknown")}</dd>
            </div>
            <div>
              <dt>Mode</dt>
              <dd>Binary file</dd>
            </div>
          </dl>
        </div>
        ${renderStatusBanner(input.notice, input.error)}
        <div class="binary-state">
          <p class="binary-title">Binary file</p>
          <p>Binary file. Replace it with an upload.</p>
        </div>
        ${deleteForm}
      `
    : `
      <div class="empty-state">
        <p class="eyebrow">Editor</p>
        <h2>Select a file</h2>
        <p>Choose a key from the left panel to edit its contents or replace it.</p>
      </div>
    `;

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>R2 Dashboard</title>
    <style>
      :root {
        color-scheme: light;
        --bg: #f4efe6;
        --panel: rgba(255, 251, 245, 0.94);
        --panel-strong: #fffdf9;
        --line: #d9cdbd;
        --text: #1f1913;
        --muted: #6f6255;
        --accent: #b45309;
        --accent-soft: #f3dfcb;
        --danger: #a61b1b;
        --danger-soft: #f8d6d1;
        --success: #215732;
        --success-soft: #dcedde;
        --shadow: 0 24px 60px rgba(73, 47, 17, 0.12);
      }

      * { box-sizing: border-box; }

      body {
        margin: 0;
        min-height: 100vh;
        background:
          radial-gradient(circle at top left, rgba(235, 202, 159, 0.55), transparent 32%),
          linear-gradient(180deg, #f9f3ea 0%, var(--bg) 100%);
        color: var(--text);
        font-family: Georgia, "Times New Roman", serif;
      }

      .page {
        width: min(1400px, calc(100vw - 32px));
        margin: 24px auto;
      }

      .topbar {
        display: flex;
        justify-content: space-between;
        gap: 20px;
        align-items: end;
        margin-bottom: 18px;
      }

      .title {
        margin: 0;
        font-size: clamp(2rem, 4vw, 3.3rem);
        line-height: 0.95;
      }

      .subtitle,
      .panel-copy,
      .toolbar-note,
      dt,
      .prefix-hint,
      .shortcut-hint {
        color: var(--muted);
      }

      .shell {
        display: grid;
        grid-template-columns: 340px minmax(0, 1fr);
        gap: 18px;
        align-items: start;
      }

      .sidebar,
      .editor {
        background: var(--panel);
        border: 1px solid var(--line);
        border-radius: 22px;
        box-shadow: var(--shadow);
        backdrop-filter: blur(10px);
      }

      .sidebar {
        padding: 18px;
        position: sticky;
        top: 18px;
        max-height: calc(100vh - 36px);
        overflow: auto;
      }

      .editor {
        padding: 22px;
      }

      .eyebrow {
        margin: 0 0 8px;
        text-transform: uppercase;
        letter-spacing: 0.12em;
        font-size: 0.75rem;
        color: var(--muted);
      }

      .panel-heading,
      .editor-header h2,
      .empty-state h2 {
        margin: 0;
      }

      .prefix-form {
        display: grid;
        gap: 10px;
        margin: 16px 0 20px;
      }

      .prefix-form input,
      .filter-form input,
      .editor-textarea,
      input[type="file"] {
        width: 100%;
        border: 1px solid var(--line);
        border-radius: 14px;
        background: var(--panel-strong);
        color: var(--text);
      }

      .prefix-form input,
      .filter-form input {
        padding: 12px 14px;
        font-size: 0.98rem;
      }

      .filter-form {
        display: grid;
        gap: 6px;
        margin: 0 0 12px;
      }

      .file-list {
        list-style: none;
        padding: 0;
        margin: 14px 0 0;
        display: grid;
        gap: 8px;
        font-family: "SFMono-Regular", Menlo, Monaco, Consolas, monospace;
        font-size: 0.88rem;
      }

      .file-link {
        display: block;
        padding: 11px 12px;
        border-radius: 14px;
        text-decoration: none;
        color: var(--text);
        background: rgba(255,255,255,0.45);
        border: 1px solid transparent;
        word-break: break-word;
      }

      .file-link[aria-current="page"] {
        background: var(--accent-soft);
        border-color: rgba(180, 83, 9, 0.3);
      }

      .editor-header {
        display: flex;
        justify-content: space-between;
        gap: 18px;
        align-items: start;
        margin-bottom: 18px;
      }

      .meta-grid {
        display: grid;
        grid-template-columns: repeat(2, minmax(120px, 1fr));
        gap: 14px;
        margin: 0;
      }

      .meta-grid div {
        padding: 12px 14px;
        border-radius: 16px;
        background: rgba(255,255,255,0.55);
        border: 1px solid var(--line);
      }

      .meta-grid dt {
        font-size: 0.8rem;
        margin-bottom: 4px;
      }

      .meta-grid dd {
        margin: 0;
        font-family: "SFMono-Regular", Menlo, Monaco, Consolas, monospace;
        font-size: 0.85rem;
      }

      .banner {
        margin-bottom: 16px;
        padding: 12px 14px;
        border-radius: 14px;
        border: 1px solid transparent;
      }

      .banner-success {
        background: var(--success-soft);
        border-color: rgba(33, 87, 50, 0.18);
        color: var(--success);
      }

      .banner-error {
        background: var(--danger-soft);
        border-color: rgba(166, 27, 27, 0.18);
        color: var(--danger);
      }

      .json-error {
        margin-bottom: 16px;
        padding: 14px 16px;
        border-radius: 14px;
        background: #fff1ef;
        border: 1px solid rgba(166, 27, 27, 0.18);
        color: var(--danger);
      }

      .json-error p {
        margin: 8px 0 0;
      }

      .editor-form {
        display: grid;
        gap: 14px;
      }

      .editor-workbench {
        min-width: 0;
      }

      .editor-pane-label {
        margin-bottom: 8px;
        font-size: 0.85rem;
        letter-spacing: 0.08em;
        text-transform: uppercase;
        color: var(--muted);
      }

      .code-frame {
        display: grid;
        grid-template-columns: 56px minmax(0, 1fr);
        border: 1px solid var(--line);
        border-radius: 16px;
        overflow: hidden;
        background: var(--panel-strong);
      }

      .line-numbers,
      .editor-textarea {
        margin: 0;
        font: 14px/1.6 "SFMono-Regular", Menlo, Monaco, Consolas, monospace;
      }

      .line-numbers {
        padding: 18px 10px 18px 0;
        text-align: right;
        color: #8e7d6d;
        background: #f0e6d9;
        border-right: 1px solid var(--line);
        overflow: hidden;
        user-select: none;
      }

      .editor-textarea {
        min-height: 65vh;
        resize: none;
        padding: 18px;
        border: 0;
        border-radius: 0;
        overflow: auto;
        white-space: pre;
        overflow-wrap: normal;
        word-break: normal;
      }

      .editor-toolbar,
      .utility-panel,
      .replace-form {
        display: flex;
        gap: 12px;
        align-items: center;
        flex-wrap: wrap;
      }

      .editor-toolbar {
        padding: 0;
      }

      .editor-toolbar {
        margin: 0 0 16px;
      }

      .shortcut-hint {
        margin: 12px 0 0;
        font-size: 0.92rem;
      }

      .utility-panel {
        margin-top: 16px;
        padding-top: 16px;
        border-top: 1px solid var(--line);
      }

      .upload-field {
        display: grid;
        gap: 6px;
        min-width: min(100%, 360px);
      }

      .sidebar-actions {
        margin: 0 0 16px;
        padding: 14px;
        border: 1px solid var(--line);
        border-radius: 16px;
        background: rgba(255,255,255,0.45);
      }

      .sidebar-actions .replace-form {
        align-items: stretch;
      }

      .button {
        appearance: none;
        border: 0;
        border-radius: 999px;
        padding: 11px 16px;
        font: inherit;
        cursor: pointer;
      }

      .button-primary {
        background: var(--accent);
        color: white;
      }

      .button-secondary {
        background: #2b2118;
        color: white;
      }

      .button-danger {
        background: var(--danger-soft);
        color: var(--danger);
      }

      .binary-state,
      .empty-state {
        padding: 28px;
        border: 1px dashed var(--line);
        border-radius: 18px;
        background: rgba(255,255,255,0.45);
        margin-bottom: 18px;
      }

      .binary-title {
        margin: 0 0 8px;
        font-weight: 700;
      }

      @media (max-width: 980px) {
        .shell {
          grid-template-columns: 1fr;
        }

        .sidebar {
          position: static;
          max-height: none;
        }

        .editor-header,
        .topbar {
          grid-template-columns: 1fr;
          display: grid;
        }

        .meta-grid {
          grid-template-columns: 1fr;
        }

        .editor-textarea {
          min-height: 50vh;
        }
      }
    </style>
    <script>
      (() => {
        const form = document.querySelector("[data-editor-form]");
        const textarea = document.querySelector("[data-editor-textarea]");
        const lineNumbers = document.querySelector("[data-line-numbers]");

        if (!(form instanceof HTMLFormElement) || !(textarea instanceof HTMLTextAreaElement)) {
          return;
        }

        let isDirty = false;
        const initialValue = textarea.value;

        const syncDecorations = () => {
          if (lineNumbers instanceof HTMLElement) {
            const lineCount = Math.max(1, textarea.value.split("\\n").length);
            lineNumbers.textContent = Array.from({ length: lineCount }, (_, index) => String(index + 1)).join("\\n");
            lineNumbers.scrollTop = textarea.scrollTop;
          }
        };

        const updateDirtyState = () => {
          isDirty = textarea.value !== initialValue;
          syncDecorations();
        };

        const indentSelection = (direction) => {
          const value = textarea.value;
          const start = textarea.selectionStart;
          const end = textarea.selectionEnd;
          const lineStart = value.lastIndexOf("\\n", Math.max(0, start - 1)) + 1;
          const lineEndIndex = value.indexOf("\\n", end);
          const lineEnd = lineEndIndex === -1 ? value.length : lineEndIndex;
          const block = value.slice(lineStart, lineEnd);
          const lines = block.split("\\n");

          if (direction > 0) {
            const updated = lines.map((line) => "  " + line).join("\\n");
            textarea.value = value.slice(0, lineStart) + updated + value.slice(lineEnd);
            textarea.selectionStart = start + 2;
            textarea.selectionEnd = end + (2 * lines.length);
          } else {
            let removedBeforeStart = 0;
            let removedTotal = 0;
            const updated = lines.map((line, index) => {
              if (line.startsWith("  ")) {
                removedTotal += 2;
                if (index === 0) {
                  removedBeforeStart = 2;
                }
                return line.slice(2);
              }

              if (line.startsWith("\\t")) {
                removedTotal += 1;
                if (index === 0) {
                  removedBeforeStart = 1;
                }
                return line.slice(1);
              }

              return line;
            }).join("\\n");

            textarea.value = value.slice(0, lineStart) + updated + value.slice(lineEnd);
            textarea.selectionStart = Math.max(lineStart, start - removedBeforeStart);
            textarea.selectionEnd = Math.max(textarea.selectionStart, end - removedTotal);
          }

          updateDirtyState();
        };

        textarea.addEventListener("input", updateDirtyState);
        textarea.addEventListener("scroll", syncDecorations);

        textarea.addEventListener("keydown", (event) => {
          if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "s") {
            event.preventDefault();
            form.requestSubmit();
            return;
          }

          if (event.key !== "Tab") {
            return;
          }

          event.preventDefault();

          if (textarea.selectionStart === textarea.selectionEnd && !event.shiftKey) {
            const start = textarea.selectionStart;
            const end = textarea.selectionEnd;
            textarea.setRangeText("  ", start, end, "end");
            updateDirtyState();
            return;
          }

          indentSelection(event.shiftKey ? -1 : 1);
        });

        form.addEventListener("submit", () => {
          isDirty = false;
        });

        syncDecorations();

        window.addEventListener("beforeunload", (event) => {
          if (!isDirty) {
            return;
          }

          event.preventDefault();
          event.returnValue = "";
        });

        document.addEventListener("click", (event) => {
          if (!isDirty) {
            return;
          }

          const target = event.target;
          if (!(target instanceof Element)) {
            return;
          }

          const link = target.closest("a[href]");
          if (!link || link.getAttribute("target") === "_blank") {
            return;
          }

          if (!window.confirm("You have unsaved changes. Leave this page?")) {
            event.preventDefault();
          }
        });
      })();
    </script>
  </head>
  <body>
    <div class="page">
      <header class="topbar">
        <div>
          <p class="eyebrow">Local admin</p>
          <h1 class="title">R2 Dashboard</h1>
          <p class="subtitle">Edit JSON comfortably, replace binary objects, and keep changes scoped to an existing prefix.</p>
        </div>
      </header>
      <main class="shell">
        <aside class="sidebar">
          <p class="eyebrow">Bucket view</p>
          <h2 class="panel-heading">Files</h2>
          <p class="panel-copy">Browse the current prefix, then open a key to edit or replace it.</p>
          <form class="prefix-form" method="get" action="/">
            <label>
              <div>Prefix</div>
              <input type="text" name="prefix" value="${escapeHtml(input.prefix)}" />
            </label>
            <button class="button button-primary" type="submit">Browse</button>
            <div class="prefix-hint">${input.keys.length} file${input.keys.length === 1 ? "" : "s"} found</div>
          </form>
          ${input.selectedKey ? `
            <div class="sidebar-actions">
              <p class="eyebrow">Replace selected</p>
              ${replaceForm}
            </div>
          ` : ""}
          <label class="filter-form">
            <div>Filter files</div>
            <input type="text" placeholder="manifest, detail, 2026..." data-file-filter />
          </label>
          <ul class="file-list">${keyList}</ul>
        </aside>
        <section class="editor">${details}</section>
      </main>
    </div>
  </body>
</html>`;
}
