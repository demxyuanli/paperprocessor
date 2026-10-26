import test from "node:test";
import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";

import { Document, HeadingLevel, Packer, Paragraph } from "docx";

import { apply } from "../index.js";

const BODY = `# Integration Paper

## Abstract

Abstract.

## 1 Introduction

Intro.

## 2 Methods

### 2.1 Setup

Setup.

## 3 Results

Results.
`;

function fakeContext() {
  const tools = new Map();
  const guards = [];
  const commands = [];
  const skills = [];
  const sections = [];
  const services = { tools: true, commands: true, skills: true, systemPrompt: true };
  const ctx = {
    logger: { warn() {}, info() {}, debug() {} },
    tools: {
      register(definition) {
        if (tools.has(definition.name)) throw new Error("duplicate tool " + definition.name);
        tools.set(definition.name, definition);
      },
      guard(fn) {
        guards.push(fn);
        return () => {};
      },
    },
    commands: { register(definition) { commands.push(definition); } },
    skills: { register(definition) { skills.push(definition); } },
    systemPrompt: { section(definition) { sections.push(definition); } },
    inject(names, fn) {
      for (const name of names) {
        if (services[name]) fn(ctx);
      }
    },
    effect() {},
    on() {},
  };
  return { ctx, tools, guards, commands, skills, sections };
}

function validate(schema, value, at = "value") {
  if (schema === undefined || schema === null) return;
  if (value === undefined) return;
  const type = schema.type;
  if (type === "object") {
    assert.ok(value !== null && typeof value === "object" && !Array.isArray(value), at + " must be an object");
    for (const key of schema.required ?? []) {
      assert.ok(Object.prototype.hasOwnProperty.call(value, key), at + " is missing required property " + key);
    }
    if (schema.additionalProperties === false) {
      for (const key of Object.keys(value)) {
        if (value[key] === undefined) continue;
        assert.ok(schema.properties && Object.prototype.hasOwnProperty.call(schema.properties, key), at + " has undeclared property " + key);
      }
    }
    for (const [key, child] of Object.entries(schema.properties ?? {})) {
      if (value[key] !== undefined) validate(child, value[key], at + "." + key);
    }
    return;
  }
  if (type === "array") {
    assert.ok(Array.isArray(value), at + " must be an array");
    for (let i = 0; i < value.length; i += 1) validate(schema.items, value[i], at + "[" + i + "]");
    return;
  }
  if (type === "string") {
    assert.equal(typeof value, "string", at + " must be a string");
    return;
  }
  if (type === "integer") {
    assert.ok(Number.isInteger(value), at + " must be an integer");
    return;
  }
  if (type === "number") {
    assert.equal(typeof value, "number", at + " must be a number");
    return;
  }
  if (type === "boolean") {
    assert.equal(typeof value, "boolean", at + " must be a boolean");
  }
}

async function call(tool, args, exec) {
  const value = await tool.execute(args, exec);
  validate(tool.output.schema, value, tool.name);
  return value;
}

test("plugin registers tools, guard, command, skill and prompt section", async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "dsh-paper-int-"));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const { ctx, tools, guards, commands, skills, sections } = fakeContext();
  apply(ctx, { papersDir: "papers", exportsDir: "exports" });
  assert.deepEqual([...tools.keys()].sort(), [
    "paper_adopt_external",
    "paper_branch",
    "paper_brief",
    "paper_check",
    "paper_diff",
    "paper_edit",
    "paper_export",
    "paper_history",
    "paper_import_docx",
    "paper_list",
    "paper_new",
    "paper_read",
    "paper_restore",
    "paper_status",
    "paper_sync_docx",
    "paper_unwatch_docx",
    "paper_write",
  ]);
  assert.equal(guards.length, 1);
  assert.equal(commands.length, 1);
  assert.equal(commands[0].name, "paper");
  assert.equal(skills.length, 1);
  assert.equal(skills[0].name, "paper-writing");
  assert.match(skills[0].content, /paper_write/);
  assert.equal(sections.length, 1);
  assert.equal(sections[0].name, "paper:policy");
  assert.match(sections[0].text, /paper_write/);
  const exec = { agent: { session: { header: { cwd: root } } } };

  // guard
  assert.match(guards[0]({ name: "write", arguments: { file_path: path.join(root, "papers", "p", "p.md") }, agent: { session: { header: { cwd: root } } } }), /blocked/i);
  assert.match(guards[0]({ name: "edit", arguments: { file_path: path.join(root, "papers", "p", "p.md") }, agent: { session: { header: { cwd: root } } } }), /blocked/i);
  assert.match(guards[0]({ name: "write", arguments: { file_path: path.join(root, "papers", "p", "paper.md") }, agent: { session: { header: { cwd: root } } } }), /blocked/i);
  assert.equal(guards[0]({ name: "write", arguments: { file_path: path.join(root, "notes.md") }, agent: { session: { header: { cwd: root } } } }), undefined);
  assert.equal(guards[0]({ name: "paper_write", arguments: { docId: "p" }, agent: { session: { header: { cwd: root } } } }), undefined);

  // tools
  const created = await call(tools.get("paper_new"), { docId: "p", title: "Integration Paper", content: BODY, message: "init" }, exec);
  assert.equal(created.versionId, "v000001");

  const list = await call(tools.get("paper_list"), {}, exec);
  assert.equal(list.count, 1);
  assert.equal(list.papers[0].lineage.children.length, 0);

  const brief = await call(tools.get("paper_read"), { docId: "p", brief: true }, exec);
  assert.equal(brief.version, 1);
  assert.equal(brief.body, "");

  const noop = await call(tools.get("paper_write"), { docId: "p", content: BODY, message: "same" }, exec);
  assert.equal(noop.changed, false);
  assert.equal(noop.version, 1);

  const edited = await call(tools.get("paper_edit"), {
    docId: "p",
    replacements: [{ oldText: "Intro.", newText: "Revised intro." }],
    message: "revise",
  }, exec);
  assert.equal(edited.version, 2);

  const history = await call(tools.get("paper_history"), { docId: "p" }, exec);
  assert.equal(history.versions.length, 2);
  assert.equal(history.adopted, false);

  const diff = await call(tools.get("paper_diff"), { docId: "p" }, exec);
  assert.match(diff.patch, /Revised intro/);

  const branch = await call(tools.get("paper_branch"), {
    from: "p",
    branches: [{ title: "Methods Branch", slug: "methods-branch", sections: ["2 Methods"] }],
  }, exec);
  assert.equal(branch.created.length, 1);
  assert.equal(branch.created[0].mode, "excerpt");
  const child = await call(tools.get("paper_read"), { docId: "methods-branch" }, exec);
  assert.match(child.body, /## Abstract/);
  assert.match(child.body, /## 2 Methods/);
  const list2 = await call(tools.get("paper_list"), {}, exec);
  assert.equal(list2.papers.find((p) => p.docId === "p").lineage.children.length, 1);

  const restored = await call(tools.get("paper_restore"), { docId: "p", version: "1", message: "restore" }, exec);
  assert.equal(restored.version, 3);

  const exported = await call(tools.get("paper_export"), { docId: "p", formats: ["html"] }, exec);
  assert.equal(exported.files.length, 1);
  assert.equal(exported.files[0].ok, true);
  assert.ok((await fs.stat(exported.files[0].path)).size > 1000);

  // command
  const listCommand = await commands[0].handler({ rawInput: "list", agent: { session: { header: { cwd: root } } } });
  assert.equal(listCommand.kind, "success");
  assert.match(listCommand.text, /Integration Paper/);
  const historyCommand = await commands[0].handler({ rawInput: "history p", agent: { session: { header: { cwd: root } } } });
  assert.equal(historyCommand.kind, "success");
  assert.match(historyCommand.text, /v000003/);

  // title may be inferred from the first H1 when content is supplied
  const inferred = await call(tools.get("paper_new"), { content: "# Inferred Title\n\n## A\n\nBody.\n", message: "infer title" }, exec);
  assert.equal(inferred.title, "Inferred Title");
  assert.equal(inferred.docId, "inferred-title");

  // drafting workflow: brief, stage and readiness checklist
  await call(tools.get("paper_new"), {
    docId: "draft-work",
    title: "Draft Work",
    content: BODY,
    message: "start draft",
    stage: "outline",
    targetWords: 100,
    question: "What is the claim?",
  }, exec);
  const briefing = await call(tools.get("paper_brief"), {
    docId: "draft-work",
    stage: "drafting",
    targetWords: 10,
    nextAction: "write results",
    deadline: "2026-12-31",
    message: "move to drafting",
  }, exec);
  assert.equal(briefing.stage, "drafting");
  assert.equal(briefing.targetWords, 10);
  const readiness = await call(tools.get("paper_check"), { docId: "draft-work" }, exec);
  assert.equal(readiness.stage, "drafting");
  assert.ok(readiness.checks.length >= 6);
  assert.ok(readiness.score > 0);
  const draftList = await call(tools.get("paper_list"), {}, exec);
  const draftRow = draftList.papers.find((paper) => paper.docId === "draft-work");
  assert.equal(draftRow.stage, "drafting");
  assert.equal(draftRow.nextAction, "write results");

  const published = await call(tools.get("paper_status"), {
    docId: "draft-work",
    status: "published",
    message: "mark published",
  }, exec);
  assert.equal(published.status, "published");
  assert.equal(published.changed, true);

  const draftCheck = await commands[0].handler({ rawInput: "check draft-work", agent: { session: { header: { cwd: root } } } });
  assert.equal(draftCheck.kind, "success");
  assert.match(draftCheck.text, /初稿/);
  assert.match(draftCheck.text, /写作清单|一句话问题/);
});

test("paper_import_docx previews and commits Word edits", async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "dsh-paper-int-docx-"));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const { ctx, tools } = fakeContext();
  apply(ctx, { papersDir: "papers", exportsDir: "exports" });
  const exec = { agent: { session: { header: { cwd: root } } } };
  await call(tools.get("paper_new"), { docId: "word-paper", title: "Word Paper", content: BODY, message: "init" }, exec);
  await assert.rejects(
    call(tools.get("paper_export"), { docId: "word-paper", formats: ["html"], watch: true }, exec),
    /docx/
  );
  await assert.rejects(fs.access(path.join(root, "exports", "word-paper")), /ENOENT/);

  const document = new Document({
    sections: [{
      children: [
        new Paragraph({ text: "Word Paper", heading: HeadingLevel.HEADING_1 }),
        new Paragraph({ text: "## Abstract", heading: HeadingLevel.HEADING_2 }),
        new Paragraph({ text: "Word edit." }),
      ],
    }],
  });
  const file = path.join(root, "word-paper-v000001.docx");
  await fs.writeFile(file, await Packer.toBuffer(document));

  const preview = await call(tools.get("paper_import_docx"), { docId: "word-paper", path: file, confirm: false }, exec);
  assert.equal(preview.preview, true);
  assert.equal(preview.baseVersion, 1);
  assert.equal(preview.version, 0);
  assert.match(preview.patch, /\+Word edit\./);

  const confirmed = await call(tools.get("paper_import_docx"), {
    docId: "word-paper",
    path: file,
    confirm: true,
    message: "Import Word edits",
  }, exec);
  assert.equal(confirmed.preview, false);
  assert.equal(confirmed.version, 2);
  assert.equal(confirmed.versionId, "v000002");
});