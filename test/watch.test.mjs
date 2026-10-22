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
  const watch = await manager.start({ store, docId: "watched", filePath: file, baseVersion: 1, syncMode: "immediate" });
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
  const watch = await manager.start({ store, docId: "watched", filePath: file, baseVersion: 1, syncMode: "immediate" });
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

test("frequent saves stay pending and coalesce into one manual checkpoint", async (t) => {
  const { root, store } = await workspace();
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  await store.create({ docId: "watched", title: "Watched Paper", content: BODY, message: "init" });
  const file = path.join(root, "watched-v000001.docx");
  await makeDocx(file, "Save one.");
  const manager = new DocxWatchManager({ logger: null, intervalMs: 60000, stableMs: 0 });
  const watch = await manager.start({ store, docId: "watched", filePath: file, baseVersion: 1, syncMode: "manual" });
  t.after(() => manager.stopAll());

  await makeDocx(file, "Save two.");
  const first = await manager.pollOnce(watch.id);
  assert.equal(first.status, "pending");
  assert.equal(first.pending, true);
  assert.equal((await store.read({ docId: "watched" })).version, 1);

  await makeDocx(file, "Save three.");
  const second = await manager.pollOnce(watch.id);
  assert.equal(second.status, "pending");
  assert.equal((await store.read({ docId: "watched" })).version, 1);

  const synced = await manager.sync(watch.id, { message: "Checkpoint after editing" });
  assert.equal(synced.pending, false);
  assert.equal(synced.lastVersion, 2);
  const after = await store.read({ docId: "watched" });
  assert.equal(after.version, 2);
  assert.match(after.body, /Save three\./);
  assert.doesNotMatch(after.body, /Save two\./);
});

test("manual sync reads a save that polling has not seen yet", async (t) => {
  const { root, store } = await workspace();
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  await store.create({ docId: "watched", title: "Watched Paper", content: BODY, message: "init" });
  const file = path.join(root, "watched-v000001.docx");
  await makeDocx(file, "Initial save.");
  const manager = new DocxWatchManager({ logger: null, intervalMs: 60000, stableMs: 0 });
  const watch = await manager.start({ store, docId: "watched", filePath: file, baseVersion: 1, syncMode: "manual" });
  t.after(() => manager.stopAll());

  await makeDocx(file, "Immediate sync save.");
  const synced = await manager.sync(watch.id);
  assert.equal(synced.pending, false);
  assert.equal(synced.lastVersion, 2);
  const after = await store.read({ docId: "watched" });
  assert.equal(after.version, 2);
  assert.match(after.body, /Immediate sync save\./);
});

test("starting a watch refuses to discard pending Word edits", async (t) => {
  const { root, store } = await workspace();
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  await store.create({ docId: "watched", title: "Watched Paper", content: BODY, message: "init" });
  const file = path.join(root, "watched-v000001.docx");
  await makeDocx(file, "Initial save.");
  const manager = new DocxWatchManager({ logger: null, intervalMs: 60000, stableMs: 0 });
  const watch = await manager.start({ store, docId: "watched", filePath: file, baseVersion: 1, syncMode: "manual" });
  t.after(() => manager.stopAll());
  await makeDocx(file, "Pending save.");
  await manager.pollOnce(watch.id);
  await assert.rejects(
    manager.start({ store, docId: "watched", filePath: file, baseVersion: 1, syncMode: "manual" }),
    /pending/i
  );
});

test("a Word save that lands during import stays pending", async (t) => {
  const { root, store } = await workspace();
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  await store.create({ docId: "watched", title: "Watched Paper", content: BODY, message: "init" });
  const file = path.join(root, "watched-v000001.docx");
  await makeDocx(file, "Save during import A.");
  const manager = new DocxWatchManager({ logger: null, intervalMs: 60000, stableMs: 0 });
  const watch = await manager.start({ store, docId: "watched", filePath: file, baseVersion: 1, syncMode: "manual" });
  t.after(() => manager.stopAll());

  await makeDocx(file, "Save before import.");
  const pending = await manager.pollOnce(watch.id);
  assert.equal(pending.status, "pending");

  const original = store.importDocx.bind(store);
  store.importDocx = async (args) => {
    const result = await original(args);
    await makeDocx(file, "Save during import B.");
    return result;
  };
  const first = await manager.sync(watch.id);
  assert.equal(first.lastVersion, 2);
  assert.equal(first.pending, false);

  const second = await manager.pollOnce(watch.id);
  assert.equal(second.status, "pending");
  assert.equal((await store.read({ docId: "watched" })).version, 2);

  const third = await manager.sync(watch.id);
  assert.equal(third.lastVersion, 3);
  assert.match((await store.read({ docId: "watched" })).body, /Save during import B\./);
});
