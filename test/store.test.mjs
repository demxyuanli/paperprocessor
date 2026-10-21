import test from "node:test";
import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";

import { PaperStore } from "../lib/store.js";
import { resolveConfig } from "../lib/config.js";
import { splitFrontMatter } from "../lib/frontmatter.js";

const BODY = `# Paper

## Abstract

Abstract text.

## 1 Introduction

Intro text.

## 2 Methods

### 2.1 Setup

Setup text.

## 3 Results

Results text.
`;

async function workspace() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "dsh-paper-test-"));
  const store = new PaperStore({ root, config: resolveConfig({}) });
  return { root, store };
}

test("create, list and read a paper", async (t) => {
  const { root, store } = await workspace();
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const created = await store.create({ docId: "paper", title: "Paper", content: BODY, message: "init" });
  assert.equal(created.version.version, 1);
  const list = await store.list();
  assert.equal(list.papers.length, 1);
  assert.equal(list.papers[0].docId, "paper");
  assert.equal(list.papers[0].drift, false);
  const read = await store.read({ docId: "paper" });
  assert.equal(read.version, 1);
  assert.match(read.body, /## 2 Methods/);
  assert.equal(read.headings.length, 5);
});


test("migrates a legacy paper.md to the readable entry name", async (t) => {
  const { root, store } = await workspace();
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const dir = path.join(root, "papers", "legacy-paper");
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(dir, "paper.md"), BODY, "utf8");
  const list = await store.list();
  const row = list.papers.find((paper) => paper.docId === "legacy-paper");
  assert.equal(row.path, "papers/legacy-paper/legacy-paper.md");
  await assert.rejects(fs.access(path.join(dir, "paper.md")), /ENOENT/);
  const read = await store.read({ docId: "legacy-paper" });
  assert.match(read.body, /## 2 Methods/);
});

test("identical writes do not create a version", async (t) => {
  const { root, store } = await workspace();
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  await store.create({ docId: "paper", title: "Paper", content: BODY, message: "init" });
  const written = await store.write({ docId: "paper", content: BODY, message: "same content" });
  assert.equal(written.changed, false);
  assert.equal(written.version.version, 1);
  const history = await store.history({ docId: "paper" });
  assert.equal(history.versions.length, 1);
});

test("edit, diff and restore keep history append-only", async (t) => {
  const { root, store } = await workspace();
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  await store.create({ docId: "paper", title: "Paper", content: BODY, message: "init" });
  const edited = await store.edit({
    docId: "paper",
    replacements: [{ oldText: "Intro text.", newText: "Revised intro." }],
    message: "revise intro",
  });
  assert.equal(edited.version.version, 2);
  const diff = await store.diff({ docId: "paper" });
  assert.equal(diff.from.version, 1);
  assert.equal(diff.to.version, 2);
  assert.match(diff.patch, /Revised intro/);
  const restored = await store.restore({ docId: "paper", version: "1", message: "restore" });
  assert.equal(restored.version.version, 3);
  assert.equal(restored.restoredFrom.version, 1);
  const read = await store.read({ docId: "paper" });
  assert.match(read.body, /Intro text\./);
  const history = await store.history({ docId: "paper" });
  assert.deepEqual(history.versions.map((v) => v.version), [3, 2, 1]);
});

test("branch creates standalone papers with lineage", async (t) => {
  const { root, store } = await workspace();
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  await store.create({ docId: "paper", title: "Paper", content: BODY, message: "init" });
  const figures = path.join(root, "papers", "paper", "figures");
  await fs.mkdir(figures, { recursive: true });
  await fs.writeFile(path.join(figures, "arch.png"), "png-bytes", "utf8");
  const result = await store.branch({
    from: "paper",
    branches: [{ title: "Methods Branch", slug: "methods-branch", sections: ["2 Methods"] }],
  });
  assert.equal(result.created.length, 1);
  const child = await store.read({ docId: "methods-branch" });
  assert.match(child.body, /## Abstract/);
  assert.match(child.body, /## 2 Methods/);
  assert.match(child.body, /### 2.1 Setup/);
  assert.doesNotMatch(child.body, /## 1 Introduction/);
  const parent = await store.list();
  const parentRecord = parent.papers.find((p) => p.docId === "paper");
  assert.equal(parentRecord.lineage.children.length, 1);
  assert.equal(parentRecord.lineage.children[0].docId, "methods-branch");
  const copied = await fs.readFile(path.join(root, "papers", "methods-branch", "figures", "arch.png"), "utf8");
  assert.equal(copied, "png-bytes");
  const childSource = await fs.readFile(store.docPath("methods-branch"), "utf8");
  const childSplit = splitFrontMatter(childSource);
  assert.equal(childSplit.data.paper, "methods-branch");
  assert.equal(childSplit.data.branchOf, "paper");
});

test("graph and compare include topic branches", async (t) => {
  const { root, store } = await workspace();
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  await store.create({ docId: "paper", title: "Paper", content: BODY, message: "init" });
  await store.edit({ docId: "paper", replacements: [{ oldText: "Intro text.", newText: "Revised intro." }], message: "revise" });
  await store.branch({ from: "paper", branches: [{ title: "Methods Branch", slug: "methods-branch", sections: ["1 Introduction"] }] });
  const graph = await store.graph({ docId: "methods-branch" });
  assert.equal(graph.rootId, "paper");
  assert.equal(graph.docs.length, 2);
  assert.equal(graph.nodes.length, 3);
  const branchNode = graph.nodes.find((node) => node.docId === "methods-branch");
  assert.equal(branchNode.version, 1);
  const branchEdge = graph.edges.find((edge) => edge.kind === "branch");
  assert.equal(branchEdge.from, "paper@v000002");
  assert.equal(branchEdge.to, "methods-branch@v000001");
  assert.ok(graph.edges.some((edge) => edge.kind === "previous" && edge.from === "paper@v000001" && edge.to === "paper@v000002"));
  const compared = await store.compare({ fromDoc: "paper", fromVersion: "1", toDoc: "methods-branch", toVersion: "1" });
  assert.equal(compared.from.docId, "paper");
  assert.equal(compared.to.docId, "methods-branch");
  assert.match(compared.patch, /methods-branch@v000001/);
});

test("insights and status transitions aggregate the workflow", async (t) => {
  const { root, store } = await workspace();
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  await store.create({ docId: "paper", title: "Paper", content: BODY, message: "init" });
  await store.create({ docId: "second", title: "Second", content: BODY.replace("Paper", "Second"), message: "init" });
  const reviewed = await store.setStatus({ docId: "paper", status: "review", message: "send to review" });
  assert.equal(reviewed.changed, true);
  assert.equal(reviewed.version.version, 2);
  await store.setStatus({ docId: "second", status: "published", message: "publish" });
  const insights = await store.insights({ days: 14, recentLimit: 10 });
  assert.equal(insights.totals.papers, 2);
  assert.equal(insights.totals.versions, 4);
  assert.equal(insights.totals.branches, 0);
  assert.equal(insights.statusCounts.review, 1);
  assert.equal(insights.statusCounts.published, 1);
  assert.equal(insights.stageCounts.idea, 2);
  assert.equal(insights.drafting.length, 2);
  assert.equal(insights.totals.active, 2);
  assert.equal(insights.activity.length, 14);
  assert.equal(insights.activity.reduce((sum, day) => sum + day.count, 0), 4);
  assert.equal(insights.recent.length, 4);
  assert.equal(insights.recent[0].source, "paper_status");
  assert.equal(insights.topPapers[0].versionCount, 2);
  await assert.rejects(() => store.setStatus({ docId: "paper", status: "nonsense" }), /invalid status/);
});


test("draft brief, stage and readiness checklist", async (t) => {
  const { root, store } = await workspace();
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  await store.create({
    docId: "draft",
    title: "Draft",
    content: BODY,
    message: "init",
    stage: "outline",
    targetWords: 100,
    question: "What is the claim?",
    nextAction: "write abstract",
  });
  const initial = await store.check({ docId: "draft" });
  assert.equal(initial.stage, "outline");
  assert.equal(initial.targetWords, 100);
  assert.equal(initial.words > 0, true);
  assert.equal(initial.progress < 100, true);
  assert.equal(initial.checks.find((check) => check.id === "question").status, "pass");
  assert.equal(initial.checks.find((check) => check.id === "abstract").status, "warn");

  const brief = await store.setBrief({
    docId: "draft",
    message: "tighten brief",
    stage: "drafting",
    targetWords: 10,
    nextAction: "write methods",
    deadline: "2026-12-31",
  });
  assert.equal(brief.changed, true);
  assert.equal(brief.record.stage, "drafting");
  const after = await store.check({ docId: "draft" });
  assert.equal(after.stage, "drafting");
  assert.equal(after.progress, 100);
  assert.equal(after.nextAction, "write methods");
  assert.equal(after.deadline, "2026-12-31");

  const staged = await store.setStage({ docId: "draft", stage: "revising", message: "start revision" });
  assert.equal(staged.stage, "revising");
  assert.equal(staged.version.version, 3);
  await assert.rejects(() => store.setStage({ docId: "draft", stage: "nonsense" }), /invalid stage/);
});

test("external changes are adopted as a version", async (t) => {
  const { root, store } = await workspace();
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  await store.create({ docId: "paper", title: "Paper", content: BODY, message: "init" });
  const file = store.docPath("paper");
  await fs.appendFile(file, "\nExternal note.\n", "utf8");
  const before = await store.list();
  assert.equal(before.papers[0].drift, true);
  const read = await store.read({ docId: "paper" });
  assert.equal(read.adopted, true);
  assert.match(read.body, /External note/);
  const history = await store.history({ docId: "paper" });
  assert.equal(history.versions[0].source, "external");
  assert.equal(history.versions.length, 2);
});

test("autoAdoptExternal false refuses writes over external changes", async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "dsh-paper-test-"));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const store = new PaperStore({ root, config: resolveConfig({ autoAdoptExternal: false }) });
  await store.create({ docId: "paper", title: "Paper", content: BODY, message: "init" });
  await fs.appendFile(store.docPath("paper"), "\nExternal note.\n", "utf8");
  await assert.rejects(
    () => store.write({ docId: "paper", content: BODY, message: "overwrite" }),
    /changed outside the paper_\* tools/,
  );
  const history = await store.history({ docId: "paper" });
  assert.equal(history.versions.length, 1);
});