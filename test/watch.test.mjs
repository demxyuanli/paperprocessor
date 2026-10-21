import test from "node:test";
import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";

import { Document, HeadingLevel, Packer, Paragraph } from "docx";

import { PaperStore } from "../lib/store.js";
import { resolveConfig } from "../lib/config.js";
import { DocxWatchManager } from "../lib/watch.js";

const BODY = `# Watched Paper

## Abstract

Original.

## 1 Introduction

Intro.
`;

async function workspace() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "dsh-paper-watch-"));
  const store = new PaperStore({ root, config: resolveConfig({}) });
  return { root, store };
}

async function makeDocx(filePath, text) {
  const document = new Document({
    sections: [{
      children: [
        new Paragraph({ text: "Watched Paper", heading: HeadingLevel.HEADING_1 }),
        new Paragraph({ text: "## Abstract", heading: HeadingLevel.HEADING_2 }),
        new Paragraph({ text }),
      ],
    }],
  });
  await fs.writeFile(filePath, await Packer.toBuffer(document));
}

test("watch imports a saved DOCX without an export/import loop", async (t) => {
  const { root, store } = await workspace();
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  await store.create({ docId: "watched", title: "Watched Paper", content: BODY, message: "init" });
  const file = path.join(root, "watched-v000001.docx");
  await makeDocx(file, "First Word save.");
  const manager = new DocxWatchManager({ logger: null, intervalMs: 60000, stableMs: 0 });
  const watch = await manager.start({ store, docId: "watched", filePath: file, baseVersion: 1 });
  t.after(() => manager.stopAll());

  assert.equal(watch.status, "watching");
  assert.equal(watch.baseVersion, 1);

  await makeDocx(file, "Second Word save.");
  const first = await manager.pollOnce(watch.id);
  assert.equal(first.status, "watching");
  assert.equal(first.lastVersion, 2);
  assert.equal(first.baseVersion, 2);
  const afterFirst = await store.read({ docId: "watched" });
  assert.equal(afterFirst.version, 2);
  assert.match(afterFirst.body, /Second Word save\./);

  await makeDocx(file, "Third Word save.");
  const second = await manager.pollOnce(watch.id);
  assert.equal(second.lastVersion, 3);
  assert.equal((await store.read({ docId: "watched" })).version, 3);
});

test("watch records a conflict instead of overwriting a newer source", async (t) => {
  const { root, store } = await workspace();
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  await store.create({ docId: "watched", title: "Watched Paper", content: BODY, message: "init" });
  const file = path.join(root, "watched-v000001.docx");
  await makeDocx(file, "Stale Word save.");
  const manager = new DocxWatchManager({ logger: null, intervalMs: 60000, stableMs: 0 });
  const watch = await manager.start({ store, docId: "watched", filePath: file, baseVersion: 1 });
  t.after(() => manager.stopAll());

  await store.write({ docId: "watched", content: BODY + "\n## 2 New\n\nNewer source.\n", message: "advance source" });
  await makeDocx(file, "Conflicting Word save.");
  const result = await manager.pollOnce(watch.id);
  assert.equal(result.status, "conflict");
  assert.match(result.lastError, /based on|advanced/);
  const current = await store.read({ docId: "watched" });
  assert.equal(current.version, 2);
  assert.match(current.body, /Newer source\./);
  assert.doesNotMatch(current.body, /Conflicting Word save\./);
});
