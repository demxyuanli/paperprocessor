import test from "node:test";
import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";

import { readTextIfExists, writeFileAtomic } from "../lib/util.js";

test("writeFileAtomic writes and leaves no backup", async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "dsh-paper-atomic-"));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const file = path.join(root, "paper.md");
  await writeFileAtomic(file, "first");
  await writeFileAtomic(file, "second");
  assert.equal(await fs.readFile(file, "utf8"), "second");
  assert.deepEqual((await fs.readdir(root)).filter((name) => name.includes(".bak-")), []);
});

test("readTextIfExists recovers a backup left by an interrupted rename", async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "dsh-paper-atomic-"));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const file = path.join(root, "paper.md");
  const backup = file + ".bak-test";
  await fs.writeFile(backup, "survived", "utf8");
  assert.equal(await readTextIfExists(file), "survived");
  assert.equal(await fs.readFile(file, "utf8"), "survived");
  await assert.rejects(fs.access(backup), /ENOENT/);
});
