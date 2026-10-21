import test from "node:test";
import assert from "node:assert/strict";

let loadedDefinition = null;

async function getLoaded() {
  if (loadedDefinition !== null) return loadedDefinition;
  globalThis.window = {
    __ModuleLoader__: {
      load(definition) { loadedDefinition = definition; },
    },
  };
  await import("../lib/client.js");
  delete globalThis.window;
  return loadedDefinition;
}

function fakeReact(seed) {
  let hookIndex = 0;
  return {
    createElement(type, props) {
      const next = Object.assign({}, props);
      const children = Array.prototype.slice.call(arguments, 2);
      if (children.length === 1) next.children = children[0];
      else if (children.length > 1) next.children = children;
      if (typeof type === "function") return type(next);
      return { type: type, props: next };
    },
    useState(initial) {
      const value = seed !== undefined && hookIndex < seed.length
        ? seed[hookIndex]
        : (typeof initial === "function" ? initial() : initial);
      hookIndex += 1;
      return [value, function () {}];
    },
    useEffect() {},
    useCallback(fn) { return fn; },
    useMemo(fn) { return fn(); },
  };
}

function findByClass(node, className) {
  if (node === null || node === undefined || typeof node !== "object") return null;
  if (Array.isArray(node)) {
    for (const child of node) {
      const found = findByClass(child, className);
      if (found !== null) return found;
    }
    return null;
  }
  const props = node.props || {};
  if (typeof props.className === "string" && props.className.split(/\s+/).indexOf(className) >= 0) return node;
  const children = props.children;
  const list = Array.isArray(children) ? children : [children];
  for (const child of list) {
    const found = findByClass(child, className);
    if (found !== null) return found;
  }
  return null;
}

test("client registers the right-sidebar audit page", async () => {
  const loaded = await getLoaded();
  assert.ok(loaded !== null);
  assert.equal(loaded.id, "@local/dsh-paper");
  const plugin = loaded.factory((name) => {
    assert.equal(name, "react");
    return fakeReact();
  });
  assert.equal(plugin.name, "@local/dsh-paper");
  assert.deepEqual(plugin.inject, ["slots", "sidebarRightTabs", "sidebarRight"]);

  const tabTypes = [];
  const slotRegistrations = [];
  const effects = [];
  const ctx = {
    sidebarRightTabs: {
      register(definition) {
        tabTypes.push(definition);
        return function () {};
      },
    },
    slots: {
      register(definition, component) {
        slotRegistrations.push({ definition: definition, component: component });
        return function () {};
      },
    },
    sidebarRight: {
      openResource() {},
    },
    effect(fn) {
      effects.push(fn);
      return function () {};
    },
  };
  plugin.apply(ctx);
  assert.equal(effects.length, 2);
  for (const effect of effects) effect();
  assert.equal(tabTypes.length, 1);
  assert.equal(tabTypes[0].kind, "paper-audit");
  assert.equal(tabTypes[0].keepMounted, true);
  assert.equal(typeof tabTypes[0].title, "function");
  assert.equal(tabTypes[0].title(), "论文审计");
  assert.equal(tabTypes[0].guide[0].title(), "论文审计");
  assert.equal(slotRegistrations.length, 1);
  assert.equal(slotRegistrations[0].definition.name, "sidebar.right.pane.tab");
  assert.equal(slotRegistrations[0].definition.key, tabTypes[0].id);
  assert.equal(typeof slotRegistrations[0].component, "function");

  // Exercise the initial render without a browser or React DOM: hooks return
  // their initial values, effects never run, and the component tree is built.
  const React = fakeReact();
  const rendered = React.createElement(slotRegistrations[0].component, {
    sessionId: "session-1",
    useTabInfo() { return { tab: { sessionId: "session-1" } }; },
  });
  assert.equal(rendered.type, "div");
  assert.equal(rendered.props.className, "dsp-root");

  // Branch papers are grouped into their lineage family.
  const root = { docId: "main", title: "Main", updatedAt: "2026-01-03T00:00:00.000Z", lineage: { parents: [], children: [] } };
  const branch = { docId: "branch-a", title: "Branch A", updatedAt: "2026-01-02T00:00:00.000Z", lineage: { parents: [{ docId: "main", version: 2, relation: "branch" }], children: [] } };
  const sub = { docId: "branch-a1", title: "Branch A1", updatedAt: "2026-01-01T00:00:00.000Z", lineage: { parents: [{ docId: "branch-a", version: 1, relation: "branch" }], children: [] } };
  const orphan = { docId: "orphan", title: "Orphan", updatedAt: "2025-12-31T00:00:00.000Z", lineage: { parents: [{ docId: "missing", version: 1, relation: "branch" }], children: [] } };
  const families = plugin.__test.groupFamilies([sub, orphan, branch, root]);
  assert.equal(families.length, 2);
  const mainFamily = families.find((family) => family.rootId === "main");
  assert.deepEqual(mainFamily.members.map((member) => member.paper.docId), ["main", "branch-a", "branch-a1"]);
  assert.equal(plugin.__test.isBranchPaper(root), false);
  assert.equal(plugin.__test.isBranchPaper(branch), true);
  assert.equal(plugin.__test.parentIdOf(branch), "main");
  const forest = plugin.__test.buildLineageForest([sub, orphan, branch, root]);
  assert.equal(forest.length, 2);
  const mainTree = forest.find((family) => family.rootId === "main");
  assert.equal(mainTree.root.paper.docId, "main");
  assert.equal(mainTree.branchCount, 2);
  assert.equal(mainTree.depth, 2);
  assert.equal(mainTree.root.children[0].paper.docId, "branch-a");
  assert.equal(mainTree.root.children[0].children[0].paper.docId, "branch-a1");
  assert.equal(mainTree.root.children[0].parentVersion, 2);
  assert.equal(mainTree.root.children[0].children[0].parentVersion, 1);
});
test("client renders the version graph for a paper family", async () => {
  const loaded = await getLoaded();
  const rootPaper = {
    docId: "main", title: "Main", path: "papers/main/main.md", registered: true, missing: false,
    status: "draft", currentVersion: 2, versionCount: 2, drift: false, latestMessage: "revise",
    latestCreatedAt: "2026-01-02T00:00:00.000Z", updatedAt: "2026-01-02T00:00:00.000Z",
    bytes: 100, words: 10, exports: 0,
    lineage: { parents: [], children: [{ docId: "branch", version: 1, relation: "branch", at: "2026-01-03T00:00:00.000Z" }] },
  };
  const branchPaper = {
    docId: "branch", title: "Branch", path: "papers/branch/branch.md", registered: true, missing: false,
    status: "draft", currentVersion: 1, versionCount: 1, drift: false, latestMessage: "branch",
    latestCreatedAt: "2026-01-03T00:00:00.000Z", updatedAt: "2026-01-03T00:00:00.000Z",
    bytes: 50, words: 5, exports: 0,
    lineage: { parents: [{ docId: "main", version: 2, relation: "branch", at: "2026-01-03T00:00:00.000Z" }], children: [] },
  };
  const listData = { ok: true, root: "/workspace", generatedAt: "2026-01-04T00:00:00.000Z", papers: [rootPaper, branchPaper] };
  const node = (id, docId, version, message, createdAt, previous, derivedFrom, lane) => ({
    id, docId, docTitle: docId === "main" ? "Main" : "Branch", version, versionId: "v" + String(version).padStart(6, "0"),
    title: message, message, source: version === 1 ? "paper_new" : "paper_edit", createdAt,
    sha256: "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
    shortSha: "0123456789ab", bytes: 10, previous, derivedFrom, lane,
  });
  const graphData = {
    rootId: "main", rootTitle: "Main",
    docs: [{ docId: "main", title: "Main", lane: 0 }, { docId: "branch", title: "Branch", lane: 1 }],
    nodes: [
      node("main@v000001", "main", 1, "init", "2026-01-01T00:00:00.000Z", 0, null, 0),
      node("main@v000002", "main", 2, "revise", "2026-01-02T00:00:00.000Z", 1, null, 0),
      node("branch@v000001", "branch", 1, "branch", "2026-01-03T00:00:00.000Z", 0, { docId: "main", version: 2 }, 1),
    ],
    edges: [
      { from: "main@v000001", to: "main@v000002", kind: "previous" },
      { from: "main@v000002", to: "branch@v000001", kind: "branch" },
    ],
  };
  const seed = [
    listData,
    false,
    null,
    "",
    "all",
    "papers",
    "all",
    { loading: false, data: null, error: null },
    {},
    {},
    {},
    null,
    { main: { loading: false, data: graphData } },
    { main: true },
    { docId: "main", nodes: ["main@v000001", "main@v000002"] },
    null,
    {},
    null,
    null,
  ];
  const seededReact = fakeReact(seed);
  const seededPlugin = loaded.factory((name) => {
    assert.equal(name, "react");
    return seededReact;
  });
  const components = [];
  seededPlugin.apply({
    sidebarRightTabs: { register() { return function () {}; } },
    slots: { register(definition, component) { components.push(component); return function () {}; } },
    sidebarRight: { openResource() {} },
    effect(fn) { fn(); return function () {}; },
  });
  assert.equal(components.length, 1);
  const tree = seededReact.createElement(components[0], {
    sessionId: "session-1",
    useTabInfo() { return { tab: { sessionId: "session-1" } }; },
  });
  assert.ok(findByClass(tree, "dsp-graph-wrap") !== null);
  assert.ok(findByClass(tree, "dsp-graph-row") !== null);
  assert.ok(findByClass(tree, "dsp-graph-canvas") !== null);
  const firstGraphRow = findByClass(tree, "dsp-graph-row");
  const firstGraphDoc = findByClass(firstGraphRow, "dsp-graph-doc");
  assert.equal(firstGraphDoc.props.children, "branch");
});
test("client renders the overview dashboard with charts and pipeline", async () => {
  const loaded = await getLoaded();
  const papers = [
    { docId: "main", title: "Main", path: "papers/main/main.md", status: "draft", stage: "drafting", stageLabel: "初稿", targetWords: 100, nextAction: "write methods", deadline: "2026-12-31", currentVersion: 2, versionCount: 2, drift: false, words: 60, bytes: 100, exports: 1, updatedAt: "2026-01-02T00:00:00.000Z", latestMessage: "revise", draft: { stage: "drafting", stageLabel: "初稿", words: 60, targetWords: 100, progress: 60, score: 70, checks: [{ id: "question", label: "一句话问题", status: "pass", detail: "Q" }], todos: 1, abstractWords: 20, headingCount: 3, nextAction: "write methods", deadline: "2026-12-31", question: "Q" }, lineage: { parents: [], children: [] } },
    { docId: "branch", title: "Branch", path: "papers/branch/branch.md", status: "draft", stage: "outline", stageLabel: "提纲", targetWords: 50, nextAction: "outline intro", deadline: "", currentVersion: 1, versionCount: 1, drift: false, words: 30, bytes: 50, exports: 0, updatedAt: "2026-01-03T00:00:00.000Z", latestMessage: "branch", draft: { stage: "outline", stageLabel: "提纲", words: 30, targetWords: 50, progress: 60, score: 55, checks: [], todos: 0, abstractWords: 10, headingCount: 2, nextAction: "outline intro", deadline: "", question: "" }, lineage: { parents: [{ docId: "main", version: 2, relation: "branch" }], children: [] } },
  ];
  const listData = { ok: true, root: "/workspace", generatedAt: "2026-01-04T00:00:00.000Z", papers: papers };
  const activity = [];
  for (let index = 0; index < 14; index += 1) {
    activity.push({ date: "2026-01-" + String(index + 1).padStart(2, "0"), count: index % 3 === 0 ? 1 : 0 });
  }
  const insightsData = {
    ok: true,
    days: 14,
    totals: { papers: 2, versions: 3, branches: 1, drift: 0, exports: 1, words: 90, targetWords: 150, active: 2, done: 0 },
    statusCounts: { draft: 2, review: 0, published: 0, archived: 0, other: 0 },
    stageCounts: { idea: 0, outline: 1, drafting: 1, revising: 0, done: 0, other: 0 },
    activity: activity,
    recent: [{ docId: "branch", title: "Branch", version: 1, versionId: "v000001", message: "branch", source: "paper_branch", createdAt: "2026-01-03T00:00:00.000Z", shortSha: "0123456789ab" }],
    topPapers: [{ docId: "main", title: "Main", status: "draft", versionCount: 2, words: 60, drift: false, updatedAt: "2026-01-02T00:00:00.000Z" }],
    drafting: [
      { docId: "main", title: "Main", stage: "drafting", stageLabel: "初稿", words: 60, targetWords: 100, progress: 60, score: 70, nextAction: "write methods", deadline: "2026-12-31", updatedAt: "2026-01-02T00:00:00.000Z" },
      { docId: "branch", title: "Branch", stage: "outline", stageLabel: "提纲", words: 30, targetWords: 50, progress: 60, score: 55, nextAction: "outline intro", deadline: "", updatedAt: "2026-01-03T00:00:00.000Z" },
    ],
  };
  const seed = [
    listData,
    false,
    null,
    "",
    "all",
    "overview",
    "all",
    { loading: false, data: insightsData, error: null },
    {},
    {},
    {},
    null,
    {},
    {},
    { docId: null, nodes: [] },
    null,
    {},
    null,
    null,
  ];
  const seededReact = fakeReact(seed);
  const seededPlugin = loaded.factory((name) => {
    assert.equal(name, "react");
    return seededReact;
  });
  const components = [];
  seededPlugin.apply({
    sidebarRightTabs: { register() { return function () {}; } },
    slots: { register(definition, component) { components.push(component); return function () {}; } },
    sidebarRight: { openResource() {} },
    effect(fn) { fn(); return function () {}; },
  });
  const tree = seededReact.createElement(components[0], {
    sessionId: "session-1",
    useTabInfo() { return { tab: { sessionId: "session-1" } }; },
  });
  assert.ok(findByClass(tree, "dsp-chart-grid") !== null);
  assert.ok(findByClass(tree, "dsp-pipeline") !== null);
  assert.ok(findByClass(tree, "dsp-donut") !== null);
  assert.ok(findByClass(tree, "dsp-activity-row") !== null);
  assert.ok(findByClass(tree, "dsp-view-switch") !== null);
});
test("client renders the paper-level lineage tree", async () => {
  const loaded = await getLoaded();
  const main = {
    docId: "main", title: "Main", path: "papers/main/main.md", status: "draft", stage: "drafting",
    currentVersion: 3, versionCount: 3, drift: false, words: 1200, bytes: 2400, exports: 0,
    updatedAt: "2026-01-04T00:00:00.000Z",
    lineage: { parents: [], children: [{ docId: "branch", version: 2, relation: "branch", at: "2026-01-03T00:00:00.000Z" }] },
  };
  const branch = {
    docId: "branch", title: "Branch", path: "papers/branch/branch.md", status: "draft", stage: "revising",
    currentVersion: 2, versionCount: 2, drift: false, words: 600, bytes: 1200, exports: 0,
    updatedAt: "2026-01-03T00:00:00.000Z",
    lineage: { parents: [{ docId: "main", version: 2, relation: "branch", at: "2026-01-03T00:00:00.000Z" }], children: [{ docId: "sub", version: 1, relation: "branch", at: "2026-01-04T00:00:00.000Z" }] },
  };
  const sub = {
    docId: "sub", title: "Sub Branch", path: "papers/sub/sub.md", status: "draft", stage: "outline",
    currentVersion: 1, versionCount: 1, drift: false, words: 200, bytes: 400, exports: 0,
    updatedAt: "2026-01-04T00:00:00.000Z",
    lineage: { parents: [{ docId: "branch", version: 1, relation: "branch", at: "2026-01-04T00:00:00.000Z" }], children: [] },
  };
  const listData = { ok: true, root: "/workspace", generatedAt: "2026-01-05T00:00:00.000Z", papers: [main, branch, sub] };
  const seed = [
    listData,
    false,
    null,
    "",
    "all",
    "lineage",
    "all",
    { loading: false, data: null, error: null },
    {},
    {},
    {},
    null,
    {},
    {},
    { docId: null, nodes: [] },
    null,
    {},
    null,
    null,
  ];
  const seededReact = fakeReact(seed);
  const seededPlugin = loaded.factory((name) => {
    assert.equal(name, "react");
    return seededReact;
  });
  const components = [];
  seededPlugin.apply({
    sidebarRightTabs: { register() { return function () {}; } },
    slots: { register(definition, component) { components.push(component); return function () {}; } },
    sidebarRight: { openResource() {} },
    effect(fn) { fn(); return function () {}; },
  });
  const tree = seededReact.createElement(components[0], {
    sessionId: "session-1",
    useTabInfo() { return { tab: { sessionId: "session-1" } }; },
  });
  assert.ok(findByClass(tree, "dsp-tree") !== null);
  assert.ok(findByClass(tree, "dsp-tree-main") !== null);
  assert.ok(findByClass(tree, "dsp-tree-children") !== null);
  assert.ok(findByClass(tree, "dsp-view-switch") !== null);
});
test("client renders an inline diff under the selected version", async () => {
  const loaded = await getLoaded();
  const paper = {
    docId: "main", title: "Main", path: "papers/main/main.md", status: "draft", stage: "drafting",
    currentVersion: 2, versionCount: 2, drift: false, words: 100, bytes: 200, exports: 0,
    updatedAt: "2026-01-02T00:00:00.000Z", latestMessage: "revise",
    lineage: { parents: [], children: [] },
  };
  const listData = { ok: true, root: "/workspace", generatedAt: "2026-01-03T00:00:00.000Z", papers: [paper] };
  const versions = [
    { version: 2, id: "v000002", createdAt: "2026-01-02T00:00:00.000Z", message: "revise", source: "paper_edit", sha256: "2222222222222222222222222222222222222222222222222222222222222222", shortSha: "222222222222", bytes: 100, title: "Main", previous: 1 },
    { version: 1, id: "v000001", createdAt: "2026-01-01T00:00:00.000Z", message: "init", source: "paper_new", sha256: "1111111111111111111111111111111111111111111111111111111111111111", shortSha: "111111111111", bytes: 90, title: "Main", previous: 0 },
  ];
  const seed = [
    listData,
    false,
    null,
    "",
    "all",
    "papers",
    "all",
    { loading: false, data: null, error: null },
    { main: true },
    { main: { docId: "main", title: "Main", currentVersion: 2, adopted: false, versions: versions } },
    {},
    {
      docId: "main", fromVersion: 1, toVersion: 2, loading: false,
      from: { version: 1, id: "v000001", message: "init" },
      to: { version: 2, id: "v000002", message: "revise" },
      patch: "@@ -1 +1 @@\n-old text\n+new text", truncated: false, added: 1, removed: 1, unchanged: 0,
    },
    {},
    {},
    { docId: null, nodes: [] },
    null,
    {},
    null,
    null,
  ];
  const seededReact = fakeReact(seed);
  const seededPlugin = loaded.factory((name) => {
    assert.equal(name, "react");
    return seededReact;
  });
  const components = [];
  seededPlugin.apply({
    sidebarRightTabs: { register() { return function () {}; } },
    slots: { register(definition, component) { components.push(component); return function () {}; } },
    sidebarRight: { openResource() {} },
    effect(fn) { fn(); return function () {}; },
  });
  const tree = seededReact.createElement(components[0], {
    sessionId: "session-1",
    useTabInfo() { return { tab: { sessionId: "session-1" } }; },
  });
  assert.ok(findByClass(tree, "dsp-diff") !== null);
  assert.ok(findByClass(tree, "dsp-diff-row") !== null);
  assert.ok(findByClass(tree, "dsp-diff-add") !== null);
  assert.ok(findByClass(tree, "dsp-version-active") !== null);
});
