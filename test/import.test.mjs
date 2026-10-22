import test from "node:test";
import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";

import { Document, HeadingLevel, Packer, Paragraph } from "docx";

import { PaperStore } from "../lib/store.js";
import { exportPaper } from "../lib/export/index.js";
import { resolveConfig } from "../lib/config.js";

const BODY = `# Word Roundtrip

## Abstract

Original abstract.

## 1 Introduction

Original introduction.
`;

async function workspace() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "dsh-paper-import-"));
  const store = new PaperStore({ root, config: resolveConfig({}) });
  return { root, store };
}

async function makeDocx(filePath, bodyText) {
  const document = new Document({
    sections: [{
      children: [
        new Paragraph({ text: "Word Roundtrip", heading: HeadingLevel.HEADING_1 }),
        new Paragraph({ text: "## Abstract", heading: HeadingLevel.HEADING_2 }),
        new Paragraph({ text: "Edited in Word." }),
        new Paragraph({ text: "## 1 Introduction", heading: HeadingLevel.HEADING_2 }),
        new Paragraph({ text: bodyText }),
      ],
    }],
  });
  await fs.writeFile(filePath, await Packer.toBuffer(document));
}

test("preview then confirm imports Word edits as a new docx_import version", async (t) => {
  const { root, store } = await workspace();
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  await store.create({ docId: "paper", title: "Word Roundtrip", content: BODY, message: "init" });
  const file = path.join(root, "paper-v000001.docx");
  await makeDocx(file, "Revised in Word.");

  const preview = await store.importDocx({ docId: "paper", filePath: file, confirm: false });
  assert.equal(preview.preview, true);
  assert.equal(preview.changed, true);
  assert.equal(preview.baseVersion, 1);
  assert.equal(preview.currentVersion, 1);
  assert.equal(preview.conflict, false);
  assert.equal(preview.version, null);
  assert.match(preview.patch, /\+Edited in Word\./);
  assert.ok(preview.warnings.some((warning) => warning.includes("批注")));
  const before = await store.read({ docId: "paper" });
  assert.equal(before.version, 1);
  await assert.rejects(fs.access(path.join(root, "papers", "paper", "assets")), /ENOENT/);

  const confirmed = await store.importDocx({
    docId: "paper",
    filePath: file,
    confirm: true,
    message: "Import Word edits",
  });
  assert.equal(confirmed.preview, false);
  assert.equal(confirmed.version, 2);
  assert.equal(confirmed.versionId, "v000002");
  const after = await store.read({ docId: "paper" });
  assert.equal(after.version, 2);
  assert.match(after.body, /Revised in Word\./);
  const history = await store.history({ docId: "paper", limit: 5 });
  assert.equal(history.versions[0].source, "docx_import");
});

test("exports a body marker so title page and TOC do not pollute the import", async (t) => {
  const { root, store } = await workspace();
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  await store.create({ docId: "paper", title: "Word Roundtrip", content: BODY, message: "init" });
  const snapshot = await store.readVersionForExport("paper");
  const exported = await exportPaper({
    root,
    docId: "paper",
    paperDir: path.dirname(store.docPath("paper")),
    config: resolveConfig({}),
    meta: snapshot.meta,
    content: snapshot.content,
    formats: ["docx"],
  });
  const docx = exported.files.find((file) => file.format === "docx");
  assert.ok(docx && docx.ok);
  const preview = await store.importDocx({ docId: "paper", filePath: docx.path, confirm: false });
  assert.ok(!preview.patch.includes("Contents / 目录"));
  assert.ok(!preview.patch.includes("DSH-PAPER-BODY-START"));
  assert.ok(preview.patch.includes("Original abstract."));
});

test("confirm refuses a Word file based on an older version unless forced", async (t) => {
  const { root, store } = await workspace();
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  await store.create({ docId: "paper", title: "Word Roundtrip", content: BODY, message: "init" });
  await store.write({ docId: "paper", content: "# Word Roundtrip\n\n## Abstract\n\nNewer source.\n", message: "advance source" });
  const file = path.join(root, "paper-v000001.docx");
  await makeDocx(file, "Stale Word edit.");

  const preview = await store.importDocx({ docId: "paper", filePath: file, confirm: false });
  assert.equal(preview.conflict, true);
  assert.equal(preview.currentVersion, 2);
  await assert.rejects(
    store.importDocx({ docId: "paper", filePath: file, confirm: true }),
    /advanced|based on/
  );
  const forced = await store.importDocx({ docId: "paper", filePath: file, confirm: true, force: true, message: "Force import" });
  assert.equal(forced.version, 3);
});

test("rejects a DOCX larger than maxDocxBytes", async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "dsh-paper-import-limit-"));
  const store = new PaperStore({ root, config: resolveConfig({ maxDocxBytes: 10 }) });
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  await store.create({ docId: "paper", title: "Word Roundtrip", content: BODY, message: "init" });
  const file = path.join(root, "paper-v000001.docx");
  await makeDocx(file, "Too large.");
  await assert.rejects(
    store.importDocx({ docId: "paper", filePath: file, confirm: false }),
    /maxDocxBytes/
  );
});

test("an unversioned Word filename requires force before overwriting", async (t) => {
  const { root, store } = await workspace();
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  await store.create({ docId: "paper", title: "Word Roundtrip", content: BODY, message: "init" });
  const file = path.join(root, "edited.docx");
  await makeDocx(file, "Renamed Word edit.");

  const preview = await store.importDocx({ docId: "paper", filePath: file, confirm: false });
  assert.equal(preview.baseVersion, null);
  assert.equal(preview.conflict, true);
  await assert.rejects(
    store.importDocx({ docId: "paper", filePath: file, confirm: true }),
    /cannot infer|force/i
  );
  const forced = await store.importDocx({ docId: "paper", filePath: file, confirm: true, force: true, message: "Force renamed import" });
  assert.equal(forced.version, 2);
});
