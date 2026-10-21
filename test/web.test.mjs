import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";

import { createPaperWebHandler } from "../lib/web.js";
import { PaperStore } from "../lib/store.js";
import { resolveConfig } from "../lib/config.js";

const BODY = "# Web Paper\n\n## Abstract\n\nAbstract.\n\n## 1 Introduction\n\nIntro.\n";

async function startServer() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "dsh-paper-web-"));
  const config = resolveConfig({});
  const prompts = [];
  const ctx = {
    get(name) {
      if (name === "sessions") {
        return {
          get(sessionId) {
            return sessionId === "session-1" ? { agent: { session: { header: { cwd: root } } } } : undefined;
          },
        };
      }
      if (name === "sessionController") {
        return { async prompt(request) { prompts.push(request); } };
      }
      return undefined;
    },
    sandboxPolicy: { workspaceRoot: root },
  };
  const state = {
    config,
    stores: new Map(),
    startTurnCooldown: new Map(),
    createStore(workspace) { return new PaperStore({ root: workspace, config }); },
  };
  const server = http.createServer(createPaperWebHandler(ctx, state));
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = server.address().port;
  return { root, config, state, prompts, server, base: "http://127.0.0.1:" + port };
}

async function json(base, pathname, options) {
  const response = await fetch(base + pathname, options);
  const body = await response.json();
  return { response, body };
}

test("web audit API lists, reads, diffs and exports", async (t) => {
  const fixture = await startServer();
  t.after(async () => {
    await new Promise((resolve) => fixture.server.close(resolve));
    await fs.rm(fixture.root, { recursive: true, force: true });
  });
  const store = new PaperStore({ root: fixture.root, config: fixture.config });
  await store.create({ docId: "web-paper", title: "Web Paper", content: BODY, message: "init" });

  const api = await json(fixture.base, "/paper/api");
  assert.equal(api.body.ok, true);
  assert.ok(api.body.capabilities.includes("export"));
  assert.ok(api.body.capabilities.includes("syncDocx"));

  const watches = await json(fixture.base, "/paper/watches?session=session-1");
  assert.equal(watches.body.ok, true);
  assert.ok(Array.isArray(watches.body.watches));

  const list = await json(fixture.base, "/paper/list?session=session-1");
  assert.equal(list.body.ok, true);
  assert.equal(list.body.papers.length, 1);
  assert.equal(list.body.papers[0].docId, "web-paper");

  const history = await json(fixture.base, "/paper/history?session=session-1&doc=web-paper");
  assert.equal(history.body.ok, true);
  assert.equal(history.body.versions.length, 1);

  const read = await json(fixture.base, "/paper/read?session=session-1&doc=web-paper&brief=1");
  assert.equal(read.body.ok, true);
  assert.equal(read.body.body, "");

  const diff = await json(fixture.base, "/paper/diff?session=session-1&doc=web-paper");
  assert.equal(diff.body.ok, true);
  assert.equal(diff.body.from.version, 1);

  const exported = await json(fixture.base, "/paper/action", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ sessionId: "session-1", action: { type: "export", docId: "web-paper", formats: ["html"] } }),
  });
  assert.equal(exported.body.ok, true);
  assert.equal(exported.body.files.length, 1);
  assert.equal(exported.body.files[0].ok, true);
  assert.ok((await fs.stat(exported.body.files[0].path)).size > 1000);

  const restored = await json(fixture.base, "/paper/action", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ sessionId: "session-1", action: { type: "restore", docId: "web-paper", version: "1", message: "restore" } }),
  });
  assert.equal(restored.body.ok, true);
  assert.equal(restored.body.changed, false);

  const branched = await json(fixture.base, "/paper/action", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      sessionId: "session-1",
      action: { type: "branch", from: "web-paper", branches: [{ title: "Web Branch", slug: "web-branch", sections: ["1 Introduction"] }] },
    }),
  });
  assert.equal(branched.body.ok, true);
  assert.equal(branched.body.created.length, 1);
  assert.equal(branched.body.created[0].docId, "web-branch");

  const afterBranch = await json(fixture.base, "/paper/list?session=session-1");
  assert.equal(afterBranch.body.papers.length, 2);
  const branchPaper = afterBranch.body.papers.find((paper) => paper.docId === "web-branch");
  const parentPaper = afterBranch.body.papers.find((paper) => paper.docId === "web-paper");
  assert.equal(branchPaper.lineage.parents[0].docId, "web-paper");
  assert.equal(branchPaper.lineage.parents[0].relation, "branch");
  assert.equal(parentPaper.lineage.children[0].docId, "web-branch");

  const graph = await json(fixture.base, "/paper/graph?session=session-1&doc=web-branch");
  assert.equal(graph.body.ok, true);
  assert.equal(graph.body.rootId, "web-paper");
  assert.equal(graph.body.nodes.length, 2);
  assert.ok(graph.body.edges.some((edge) => edge.kind === "branch" && edge.to === "web-branch@v000001"));

  const compared = await json(fixture.base, "/paper/compare?session=session-1&fromDoc=web-paper&fromVersion=1&toDoc=web-branch&toVersion=1");
  assert.equal(compared.body.ok, true);
  assert.equal(compared.body.from.docId, "web-paper");
  assert.equal(compared.body.to.docId, "web-branch");
  assert.match(compared.body.patch, /web-branch@v000001/);

  const insights = await json(fixture.base, "/paper/insights?session=session-1&days=14");
  assert.equal(insights.body.ok, true);
  assert.equal(insights.body.totals.papers, 2);
  assert.equal(insights.body.totals.branches, 1);
  assert.equal(insights.body.activity.length, 14);
  assert.ok(insights.body.recent.length >= 2);

  const staged = await json(fixture.base, "/paper/action", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ sessionId: "session-1", action: { type: "setStage", docId: "web-paper", stage: "drafting", message: "start drafting" } }),
  });
  assert.equal(staged.body.ok, true);
  assert.equal(staged.body.stage, "drafting");

  const briefed = await json(fixture.base, "/paper/action", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ sessionId: "session-1", action: { type: "setBrief", docId: "web-paper", targetWords: 50, nextAction: "write methods", deadline: "2026-12-31", message: "set brief" } }),
  });
  assert.equal(briefed.body.ok, true);
  assert.equal(briefed.body.targetWords, 50);
  assert.equal(briefed.body.nextAction, "write methods");

  const checked = await json(fixture.base, "/paper/check?session=session-1&doc=web-paper");
  assert.equal(checked.body.ok, true);
  assert.equal(checked.body.stage, "drafting");
  assert.equal(checked.body.nextAction, "write methods");
  assert.ok(checked.body.checks.length >= 6);
  assert.ok(checked.body.score > 0);

  const statusResult = await json(fixture.base, "/paper/action", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ sessionId: "session-1", action: { type: "setStatus", docId: "web-paper", status: "review", message: "send to review" } }),
  });
  assert.equal(statusResult.body.ok, true);
  assert.equal(statusResult.body.status, "review");
  assert.equal(statusResult.body.changed, true);
  const afterStatus = await json(fixture.base, "/paper/list?session=session-1");
  assert.equal(afterStatus.body.papers.find((paper) => paper.docId === "web-paper").status, "review");

  const turn = await json(fixture.base, "/paper/action", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ sessionId: "session-1", action: { type: "startTurn", prompt: "please review" } }),
  });
  assert.equal(turn.body.ok, true);
  assert.equal(fixture.prompts.length, 1);
  assert.equal(fixture.prompts[0].sessionId, "session-1");
  assert.equal(fixture.prompts[0].mode, "queue");

  const unknown = await json(fixture.base, "/paper/nope");
  assert.equal(unknown.response.status, 404);
  assert.equal(unknown.body.ok, false);

  const wrongType = await fetch(fixture.base + "/paper/action", { method: "POST", headers: { "content-type": "text/plain" }, body: "{}" });
  assert.equal(wrongType.status, 403);

  const crossOrigin = await fetch(fixture.base + "/paper/action", {
    method: "POST",
    headers: { "content-type": "application/json", origin: "http://evil.example" },
    body: JSON.stringify({ sessionId: "session-1", action: { type: "startTurn", prompt: "nope" } }),
  });
  assert.equal(crossOrigin.status, 403);
});

test("write actions refuse a root that is only the sandbox policy root", async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "dsh-paper-web-"));
  const config = resolveConfig({});
  const ctx = {
    get() { return undefined; },
    sandboxPolicy: { workspaceRoot: root },
  };
  const state = {
    config,
    stores: new Map(),
    startTurnCooldown: new Map(),
    createStore(workspace) { return new PaperStore({ root: workspace, config }); },
  };
  const server = http.createServer(createPaperWebHandler(ctx, state));
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(async () => {
    await new Promise((resolve) => server.close(resolve));
    await fs.rm(root, { recursive: true, force: true });
  });
  const base = "http://127.0.0.1:" + server.address().port;
  const result = await json(base, "/paper/action", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ action: { type: "restore", docId: "x", version: "1" } }),
  });
  assert.equal(result.body.ok, false);
  assert.match(result.body.message, /only the sandbox policy root/);
});