import test from "node:test";
import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";

import { PaperStore } from "../lib/store.js";
import { resolveConfig } from "../lib/config.js";
import { exportPaper } from "../lib/export/index.js";
import { findBrowser } from "../lib/export/pdf.js";

const BODY = `# Export Paper

## Abstract

An abstract with **bold** text.

## 1 Introduction

Intro with \`code\`.

| Method | Score |
|---|---:|
| A | 0.9 |

![Architecture](figures/arch.png)

## 2 Results

Results.
`;

async function fixture() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "dsh-paper-export-"));
  const config = resolveConfig({});
  const store = new PaperStore({ root, config });
  await store.create({ docId: "export-paper", title: "Export Paper", content: BODY, message: "init" });
  await fs.mkdir(path.join(root, "papers", "export-paper", "figures"), { recursive: true });
  const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=", "base64");
  await fs.writeFile(path.join(root, "papers", "export-paper", "figures", "arch.png"), png);
  return { root, config, store };
}

test("exports the requested publication formats from one immutable version", async (t) => {
  const { root, config, store } = await fixture();
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const browser = await findBrowser(null);
  const formats = browser ? ["html", "docx", "pdf"] : ["html", "docx"];
  const snapshot = await store.readVersionForExport("export-paper");
  const result = await exportPaper({
    root,
    docId: "export-paper",
    paperDir: path.dirname(store.docPath("export-paper")),
    config,
    meta: snapshot.meta,
    content: snapshot.content,
    formats,
  });
  assert.equal(result.files.length, formats.length);
  for (const file of result.files) {
    assert.equal(file.ok, true, file.error ?? "");
    assert.ok(file.bytes > 1000, file.format + " is too small");
  }
  const html = await fs.readFile(path.join(result.dir, "export-paper-" + snapshot.meta.id + ".html"), "utf8");
  assert.match(html, /<h1>Export Paper<\/h1>/);
  assert.match(html, /Contents \/ 目录/);
  assert.match(html, /data:image\/png;base64,/);
  assert.match(html, /<table>/);
  const docx = await fs.readFile(path.join(result.dir, "export-paper-" + snapshot.meta.id + ".docx"));
  assert.equal(docx.subarray(0, 2).toString("ascii"), "PK");
  if (browser) {
    const pdf = await fs.readFile(path.join(result.dir, "export-paper-" + snapshot.meta.id + ".pdf"));
    assert.equal(pdf.subarray(0, 5).toString("ascii"), "%PDF-");
  }
  const manifest = JSON.parse(await fs.readFile(path.join(result.dir, "manifest.json"), "utf8"));
  assert.equal(manifest.versionId, snapshot.meta.id);
  assert.equal(manifest.sha256, snapshot.meta.sha256);
  assert.deepEqual(manifest.files.map((f) => f.format).sort(), formats.slice().sort());
});

test("exports a branch paper through the same version pipeline", async (t) => {
  const { root, config, store } = await fixture();
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const branched = await store.branch({
    from: "export-paper",
    branches: [{ title: "Methods Branch", slug: "methods-branch", sections: ["1 Introduction", "2 Results"] }],
  });
  assert.equal(branched.created.length, 1);
  const snapshot = await store.readVersionForExport("methods-branch");
  assert.equal(snapshot.meta.derivedFrom.docId, "export-paper");
  const htmlOnly = await exportPaper({
    root,
    docId: "methods-branch",
    paperDir: path.dirname(store.docPath("methods-branch")),
    config,
    meta: snapshot.meta,
    content: snapshot.content,
    formats: ["html", "docx"],
  });
  for (const file of htmlOnly.files) assert.equal(file.ok, true, file.error ?? "");
  const html = await fs.readFile(path.join(htmlOnly.dir, "methods-branch-" + snapshot.meta.id + ".html"), "utf8");
  assert.match(html, /Methods Branch/);
  assert.match(html, /Results/);
  assert.match(html, /data:image\/png;base64,/);
  const docx = await fs.readFile(path.join(htmlOnly.dir, "methods-branch-" + snapshot.meta.id + ".docx"));
  assert.equal(docx.subarray(0, 2).toString("ascii"), "PK");
});

test("exports only the requested formats", async (t) => {
  const { root, config, store } = await fixture();
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const snapshot = await store.readVersionForExport("export-paper");
  const result = await exportPaper({
    root,
    docId: "export-paper",
    paperDir: path.dirname(store.docPath("export-paper")),
    config,
    meta: snapshot.meta,
    content: snapshot.content,
    formats: ["html"],
  });
  assert.deepEqual(result.files.map((f) => f.format), ["html"]);
  await assert.rejects(fs.access(path.join(result.dir, "export-paper-" + snapshot.meta.id + ".docx")), /ENOENT/);
});

test("exports a historical version without changing the source", async (t) => {
  const { root, config, store } = await fixture();
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const v1 = await store.readVersionForExport("export-paper", "1");
  await store.write({
    docId: "export-paper",
    content: BODY.replace("Results.", "Results after revision."),
    message: "revise results",
  });
  const result = await exportPaper({
    root,
    docId: "export-paper",
    paperDir: path.dirname(store.docPath("export-paper")),
    config,
    meta: v1.meta,
    content: v1.content,
    formats: ["html"],
  });
  const html = await fs.readFile(path.join(result.dir, "export-paper-" + v1.meta.id + ".html"), "utf8");
  assert.doesNotMatch(html, /Results after revision/);
  assert.match(html, /Results\./);
  const current = await store.read({ docId: "export-paper" });
  assert.match(current.body, /Results after revision/);
});