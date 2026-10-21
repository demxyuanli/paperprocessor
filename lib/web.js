import path from "node:path";

import { exportPaper, normalizeFormats } from "./export/index.js";
import { nowIso } from "./util.js";

const MAX_BODY_BYTES = 1024 * 1024;
const ROUTE_PREFIX = "/paper";

function serviceOf(ctx, name) {
  try {
    return ctx.get(name);
  } catch {
    return undefined;
  }
}

function cwdFrom(value) {
  if (value === undefined || value === null) return undefined;
  const agent = value.agent;
  const session = value.session;
  const header = value.header;
  const sessionHeader = session !== undefined && session !== null ? session.header : undefined;
  const agentSession = agent !== undefined && agent !== null ? agent.session : undefined;
  const agentSessionHeader = agentSession !== undefined && agentSession !== null ? agentSession.header : undefined;
  const candidates = [
    sessionHeader !== undefined && sessionHeader !== null ? sessionHeader.cwd : undefined,
    agentSessionHeader !== undefined && agentSessionHeader !== null ? agentSessionHeader.cwd : undefined,
    agentSession !== undefined && agentSession !== null ? agentSession.cwd : undefined,
    header !== undefined && header !== null ? header.cwd : undefined,
    value.cwd,
  ];
  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate !== "") return candidate;
  }
  return undefined;
}

function sessionById(ctx, sessionId) {
  if (typeof sessionId !== "string" || sessionId === "") return undefined;
  for (const name of ["sessions", "sessionManager", "agents", "sessionController"]) {
    const service = serviceOf(ctx, name);
    if (service === undefined || service === null) continue;
    for (const method of ["get", "find", "resolve", "resolveAgent", "byId"]) {
      if (typeof service[method] !== "function") continue;
      try {
        const value = service[method](sessionId);
        if (value !== undefined && value !== null && cwdFrom(value) !== undefined) return value;
      } catch {
        // not this accessor
      }
    }
  }
  return undefined;
}

/**
 * Resolve the workspace for one request. A write must be pinned to a root
 * somebody actually knows (config or a Session); the sandbox policy root and
 * process.cwd() are read-only fallbacks because in the Desktop app they point at
 * application data rather than the user's project.
 */
function resolveRoot(ctx, state, sessionId, options = {}) {
  if (state.config.workspaceRoot) return { root: path.resolve(state.config.workspaceRoot), source: "config" };
  const session = sessionById(ctx, sessionId);
  const cwd = cwdFrom(session);
  if (typeof cwd === "string" && cwd !== "") return { root: path.resolve(cwd), source: "session" };
  let directPolicy;
  try { directPolicy = ctx !== null && ctx !== undefined ? ctx.sandboxPolicy : undefined; } catch { directPolicy = undefined; }
  const policy = serviceOf(ctx, "sandboxPolicy") ?? directPolicy;
  if (policy !== undefined && policy !== null && typeof policy.workspaceRoot === "string" && policy.workspaceRoot !== "") {
    if (options.write === true) {
      return { error: "cannot resolve the workspace for this write: the Session has no cwd and only the sandbox policy root is available" };
    }
    return { root: path.resolve(policy.workspaceRoot), source: "policy" };
  }
  if (options.write === true) return { error: "cannot resolve the workspace for this write: no Session and no configured workspaceRoot" };
  return { root: process.cwd(), source: "cwd" };
}

function underRoot(root, filePath) {
  const rel = path.relative(root, filePath);
  return rel !== "" && !rel.startsWith("..") && !path.isAbsolute(rel);
}

function storeFor(state, root) {
  let store = state.stores.get(root);
  if (!store) {
    store = state.createStore(root);
    state.stores.set(root, store);
  }
  return store;
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        reject(new Error("request body is larger than " + MAX_BODY_BYTES + " bytes"));
        try { req.destroy(); } catch { /* already gone */ }
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

function sendJson(res, status, value) {
  const body = JSON.stringify(value);
  res.statusCode = status;
  res.setHeader("content-type", "application/json; charset=utf-8");
  res.setHeader("cache-control", "no-store");
  res.setHeader("x-content-type-options", "nosniff");
  res.end(body);
}

function requestSessionId(url, body) {
  if (body !== null && body !== undefined && typeof body.sessionId === "string" && body.sessionId !== "") return body.sessionId;
  const fromQuery = url.searchParams.get("session");
  return typeof fromQuery === "string" && fromQuery !== "" ? fromQuery : undefined;
}

function requireJsonPost(req) {
  const type = String(req.headers["content-type"] ?? "").toLowerCase();
  return type.startsWith("application/json");
}

function sameOrigin(req) {
  const origin = req.headers.origin;
  const host = req.headers.host;
  if (typeof origin !== "string" || origin === "" || typeof host !== "string" || host === "") return true;
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

async function handleList(ctx, state, url) {
  const sessionId = requestSessionId(url, null);
  const resolved = resolveRoot(ctx, state, sessionId, { write: false });
  if (resolved.error) return { ok: false, code: "unsupported", message: resolved.error };
  const store = storeFor(state, resolved.root);
  const value = await store.list();
  return {
    ok: true,
    root: resolved.root,
    rootSource: resolved.source,
    papersRoot: value.papersRoot,
    exportsRoot: value.exportsRoot,
    generatedAt: nowIso(),
    papers: value.papers,
  };
}

async function handleHistory(ctx, state, url) {
  const sessionId = requestSessionId(url, null);
  const docId = url.searchParams.get("doc") ?? "";
  if (docId === "") return { ok: false, code: "invalid", message: "doc is required" };
  const limit = Number(url.searchParams.get("limit") ?? 50);
  const resolved = resolveRoot(ctx, state, sessionId, { write: false });
  if (resolved.error) return { ok: false, code: "unsupported", message: resolved.error };
  const store = storeFor(state, resolved.root);
  const value = await store.history({ docId, limit: Number.isInteger(limit) && limit > 0 ? limit : 50 });
  return { ok: true, root: resolved.root, ...value };
}

async function handleDiff(ctx, state, url) {
  const sessionId = requestSessionId(url, null);
  const docId = url.searchParams.get("doc") ?? "";
  if (docId === "") return { ok: false, code: "invalid", message: "doc is required" };
  const resolved = resolveRoot(ctx, state, sessionId, { write: false });
  if (resolved.error) return { ok: false, code: "unsupported", message: resolved.error };
  const store = storeFor(state, resolved.root);
  const value = await store.diff({
    docId,
    fromVersion: url.searchParams.get("from") ?? undefined,
    toVersion: url.searchParams.get("to") ?? undefined,
    includeFrontMatter: url.searchParams.get("frontMatter") === "1",
  });
  return { ok: true, root: resolved.root, ...value };
}

async function handleWatches(ctx, state, url) {
  const sessionId = requestSessionId(url, null);
  const resolved = resolveRoot(ctx, state, sessionId, { write: false });
  if (resolved.error) return { ok: false, code: "unsupported", message: resolved.error };
  const watches = (state.watchers ? state.watchers.list() : []).filter((watch) => underRoot(resolved.root, watch.filePath));
  return { ok: true, root: resolved.root, generatedAt: nowIso(), watches };
}

async function handleCheck(ctx, state, url) {
  const sessionId = requestSessionId(url, null);
  const docId = url.searchParams.get("doc") ?? "";
  if (docId === "") return { ok: false, code: "invalid", message: "doc is required" };
  const resolved = resolveRoot(ctx, state, sessionId, { write: false });
  if (resolved.error) return { ok: false, code: "unsupported", message: resolved.error };
  const store = storeFor(state, resolved.root);
  const value = await store.check({ docId });
  return { ok: true, root: resolved.root, ...value };
}

async function handleInsights(ctx, state, url) {
  const sessionId = requestSessionId(url, null);
  const resolved = resolveRoot(ctx, state, sessionId, { write: false });
  if (resolved.error) return { ok: false, code: "unsupported", message: resolved.error };
  const store = storeFor(state, resolved.root);
  const days = Number(url.searchParams.get("days") ?? 14);
  const value = await store.insights({ days: Number.isInteger(days) && days > 0 ? days : 14 });
  return { ok: true, root: resolved.root, ...value };
}

async function handleGraph(ctx, state, url) {
  const sessionId = requestSessionId(url, null);
  const docId = url.searchParams.get("doc") ?? "";
  if (docId === "") return { ok: false, code: "invalid", message: "doc is required" };
  const resolved = resolveRoot(ctx, state, sessionId, { write: false });
  if (resolved.error) return { ok: false, code: "unsupported", message: resolved.error };
  const store = storeFor(state, resolved.root);
  const value = await store.graph({ docId });
  return { ok: true, root: resolved.root, ...value };
}

async function handleCompare(ctx, state, url) {
  const sessionId = requestSessionId(url, null);
  const fromDoc = url.searchParams.get("fromDoc") ?? "";
  const toDoc = url.searchParams.get("toDoc") ?? "";
  if (fromDoc === "" || toDoc === "") return { ok: false, code: "invalid", message: "fromDoc and toDoc are required" };
  const resolved = resolveRoot(ctx, state, sessionId, { write: false });
  if (resolved.error) return { ok: false, code: "unsupported", message: resolved.error };
  const store = storeFor(state, resolved.root);
  const value = await store.compare({
    fromDoc,
    toDoc,
    fromVersion: url.searchParams.get("fromVersion") ?? undefined,
    toVersion: url.searchParams.get("toVersion") ?? undefined,
    includeFrontMatter: url.searchParams.get("frontMatter") === "1",
  });
  return { ok: true, root: resolved.root, ...value };
}

async function handleRead(ctx, state, url) {
  const sessionId = requestSessionId(url, null);
  const docId = url.searchParams.get("doc") ?? "";
  if (docId === "") return { ok: false, code: "invalid", message: "doc is required" };
  const resolved = resolveRoot(ctx, state, sessionId, { write: false });
  if (resolved.error) return { ok: false, code: "unsupported", message: resolved.error };
  const store = storeFor(state, resolved.root);
  const value = await store.read({
    docId,
    version: url.searchParams.get("version") ?? undefined,
    brief: url.searchParams.get("brief") === "1",
    section: url.searchParams.get("section") ?? undefined,
  });
  return { ok: true, root: resolved.root, ...value };
}

async function handleAction(ctx, state, body) {
  if (body === null || typeof body !== "object" || Array.isArray(body)) {
    return { ok: false, code: "invalid", message: "JSON body must be an object" };
  }
  const action = body.action;
  if (action === null || typeof action !== "object" || Array.isArray(action)) {
    return { ok: false, code: "invalid", message: "action is required" };
  }
  const sessionId = requestSessionId(new URL("http://localhost/"), body);
  const type = String(action.type ?? "");

  if (type === "startTurn") {
    return startTurn(ctx, state, body, action);
  }

  const resolved = resolveRoot(ctx, state, sessionId, { write: true });
  if (resolved.error) return { ok: false, code: "unsupported", message: resolved.error };
  const store = storeFor(state, resolved.root);

  if (type === "syncDocx") {
    const watchId = String(action.watchId ?? "");
    const docId = String(action.docId ?? "");
    if (!state.watchers) return { ok: false, code: "unsupported", message: "Word watchers are not available" };
    const watch = watchId !== "" ? state.watchers.get(watchId) : (docId !== "" ? state.watchers.findForDoc(docId) : null);
    if (!watch) return { ok: false, code: "not-found", message: "no Word watcher found" };
    if (!underRoot(resolved.root, watch.filePath)) return { ok: false, code: "forbidden", message: "watch belongs to another workspace" };
    const result = await state.watchers.sync(watch.id, { message: action.message });
    if (result.status === "conflict" || result.status === "error") {
      return { ok: false, code: result.status, message: result.lastError || "Word sync failed" };
    }
    return { ok: true, watch: result };
  }

  if (type === "export") {
    const docId = String(action.docId ?? "");
    if (docId === "") return { ok: false, code: "invalid", message: "docId is required" };
    const formats = normalizeFormats(action.formats);
    const watchRequested = action.watch === true;
    if (watchRequested && !formats.includes("docx")) {
      return { ok: false, code: "invalid", message: "watch requires the docx format" };
    }
    if (watchRequested && !state.watchers) {
      return { ok: false, code: "unsupported", message: "Word watchers are not available" };
    }
    const snapshot = await store.readVersionForExport(docId, action.version);
    if (watchRequested) {
      const current = await store.read({ docId });
      if (current.version !== snapshot.meta.version) {
        return { ok: false, code: "invalid", message: "watch only supports the current version" };
      }
    }
    const result = await exportPaper({
      root: resolved.root,
      docId,
      paperDir: path.dirname(store.docPath(docId)),
      config: state.config,
      meta: snapshot.meta,
      content: snapshot.content,
      formats,
    });
    await store.recordExport(docId, {
      version: snapshot.meta.version,
      id: snapshot.meta.id,
      dir: path.relative(resolved.root, result.dir).replace(/\\/g, "/"),
      formats: result.files.filter((file) => file.ok).map((file) => file.format),
      createdAt: nowIso(),
    });
    let watch = null;
    if (watchRequested) {
      const docxFile = result.files.find((file) => file.format === "docx" && file.ok);
      if (!docxFile) return { ok: false, code: "failed", message: "DOCX export failed; cannot start watching" };
      watch = await state.watchers.start({
        store,
        docId,
        filePath: docxFile.path,
        baseVersion: snapshot.meta.version,
        syncMode: typeof action.watchSync === "string" ? action.watchSync : "idle",
        idleMs: Number.isInteger(action.watchIdleSeconds) ? action.watchIdleSeconds * 1000 : 300000,
      });
    }
    return {
      ok: true,
      docId,
      dir: result.dir,
      version: snapshot.meta.version,
      versionId: snapshot.meta.id,
      sha256: snapshot.meta.sha256,
      files: result.files,
      warnings: result.warnings,
      watch,
    };
  }

  if (type === "setStage") {
    const docId = String(action.docId ?? "");
    const stage = String(action.stage ?? "");
    if (docId === "" || stage === "") return { ok: false, code: "invalid", message: "docId and stage are required" };
    const result = await store.setStage({ docId, stage, nextAction: action.nextAction, message: action.message });
    return {
      ok: true,
      docId,
      changed: result.changed,
      stage: result.stage,
      version: result.version.version,
      versionId: result.version.id,
      sha256: result.version.sha256,
    };
  }

  if (type === "setBrief") {
    const docId = String(action.docId ?? "");
    if (docId === "") return { ok: false, code: "invalid", message: "docId is required" };
    const result = await store.setBrief({
      docId,
      message: action.message,
      stage: action.stage,
      question: action.question,
      audience: action.audience,
      contribution: action.contribution,
      targetWords: action.targetWords,
      nextAction: action.nextAction,
      deadline: action.deadline,
    });
    return {
      ok: true,
      docId,
      changed: result.changed,
      stage: result.record.stage,
      targetWords: result.record.targetWords ?? 0,
      nextAction: result.record.nextAction ?? "",
      deadline: result.record.deadline ?? "",
      version: result.version.version,
      versionId: result.version.id,
      sha256: result.version.sha256,
    };
  }

  if (type === "setStatus") {
    const docId = String(action.docId ?? "");
    const status = String(action.status ?? "");
    if (docId === "" || status === "") return { ok: false, code: "invalid", message: "docId and status are required" };
    const result = await store.setStatus({ docId, status, message: action.message });
    return {
      ok: true,
      docId,
      changed: result.changed,
      status,
      version: result.version.version,
      versionId: result.version.id,
      sha256: result.version.sha256,
    };
  }

  if (type === "restore") {
    const docId = String(action.docId ?? "");
    const version = String(action.version ?? "");
    if (docId === "" || version === "") return { ok: false, code: "invalid", message: "docId and version are required" };
    const result = await store.restore({ docId, version, message: action.message });
    return {
      ok: true,
      docId,
      restoredFrom: { version: result.restoredFrom.version, id: result.restoredFrom.id, message: result.restoredFrom.message },
      changed: result.changed,
      version: result.version.version,
      versionId: result.version.id,
      sha256: result.version.sha256,
    };
  }

  if (type === "branch") {
    const from = String(action.from ?? "");
    if (from === "" || !Array.isArray(action.branches) || action.branches.length === 0) {
      return { ok: false, code: "invalid", message: "from and a non-empty branches array are required" };
    }
    const result = await store.branch({
      from,
      fromVersion: action.fromVersion,
      mode: action.mode,
      message: action.message,
      branches: action.branches,
    });
    return {
      ok: true,
      from: result.from,
      fromVersion: result.fromVersion,
      created: result.created.map((item) => ({
        docId: item.docId,
        title: item.title,
        version: item.version.version,
        versionId: item.version.id,
        mode: item.mode,
        sections: item.sections,
      })),
    };
  }

  return { ok: false, code: "unsupported", message: "unknown action type \"" + type + "\"" };
}

async function startTurn(ctx, state, body, action) {
  const prompt = String(action.prompt ?? "").trim();
  if (prompt === "") return { ok: false, code: "invalid", message: "prompt is required" };
  const sessionId = requestSessionId(new URL("http://localhost/"), body);
  if (sessionId === undefined) return { ok: false, code: "invalid", message: "sessionId is required" };
  const controller = serviceOf(ctx, "sessionController");
  if (controller === undefined || controller === null || typeof controller.prompt !== "function") {
    return { ok: false, code: "unsupported", message: "sessionController.prompt is not available in this composition" };
  }
  const key = sessionId + "|" + prompt;
  const now = Date.now();
  const cooldown = state.startTurnCooldown ?? (state.startTurnCooldown = new Map());
  const last = cooldown.get(key);
  if (last !== undefined && now - last < state.config.startTurnCooldownMs) {
    return { ok: false, code: "denied", message: "the same request was just sent; wait a moment" };
  }
  cooldown.set(key, now);
  const requestId = "paper-" + now.toString(36) + "-" + Math.random().toString(36).slice(2, 8);
  try {
    await controller.prompt({
      requestId,
      sessionId,
      mode: "queue",
      content: [{ type: "text", text: prompt }],
    }, new AbortController().signal);
    return { ok: true, detail: "queued" };
  } catch (error) {
    cooldown.delete(key);
    return { ok: false, code: "failed", message: String(error && error.message ? error.message : error) };
  }
}

/** Create the Node-style HTTP handler mounted at /paper. */
export function createPaperWebHandler(ctx, state) {
  return async function paperHandler(req, res) {
    try {
      const url = new URL(req.url ?? "/paper", "http://localhost");
      const pathname = url.pathname.replace(/\/+$/, "");
      if (req.method === "GET" && (pathname === ROUTE_PREFIX || pathname === ROUTE_PREFIX + "/api")) {
        return sendJson(res, 200, {
          ok: true,
          version: 1,
          capabilities: ["list", "insights", "check", "read", "history", "diff", "graph", "compare", "export", "restore", "branch", "setStage", "setBrief", "setStatus", "startTurn", "watches", "syncDocx"],
        });
      }
      if (req.method === "GET" && pathname === ROUTE_PREFIX + "/list") {
        return sendJson(res, 200, await handleList(ctx, state, url));
      }
      if (req.method === "GET" && pathname === ROUTE_PREFIX + "/insights") {
        return sendJson(res, 200, await handleInsights(ctx, state, url));
      }
      if (req.method === "GET" && pathname === ROUTE_PREFIX + "/watches") {
        return sendJson(res, 200, await handleWatches(ctx, state, url));
      }
      if (req.method === "GET" && pathname === ROUTE_PREFIX + "/check") {
        return sendJson(res, 200, await handleCheck(ctx, state, url));
      }
      if (req.method === "GET" && pathname === ROUTE_PREFIX + "/read") {
        return sendJson(res, 200, await handleRead(ctx, state, url));
      }
      if (req.method === "GET" && pathname === ROUTE_PREFIX + "/history") {
        return sendJson(res, 200, await handleHistory(ctx, state, url));
      }
      if (req.method === "GET" && pathname === ROUTE_PREFIX + "/diff") {
        return sendJson(res, 200, await handleDiff(ctx, state, url));
      }
      if (req.method === "GET" && pathname === ROUTE_PREFIX + "/graph") {
        return sendJson(res, 200, await handleGraph(ctx, state, url));
      }
      if (req.method === "GET" && pathname === ROUTE_PREFIX + "/compare") {
        return sendJson(res, 200, await handleCompare(ctx, state, url));
      }
      if (req.method === "POST" && pathname === ROUTE_PREFIX + "/action") {
        if (!sameOrigin(req)) return sendJson(res, 403, { ok: false, code: "forbidden", message: "cross-origin request rejected" });
        if (!requireJsonPost(req)) return sendJson(res, 403, { ok: false, code: "unsupported", message: "POST requires content-type: application/json" });
        const text = await readBody(req);
        let body;
        try {
          body = text === "" ? {} : JSON.parse(text);
        } catch (error) {
          return sendJson(res, 400, { ok: false, code: "invalid", message: "invalid JSON: " + error.message });
        }
        return sendJson(res, 200, await handleAction(ctx, state, body));
      }
      return sendJson(res, 404, { ok: false, code: "not-found", message: "unknown paper endpoint: " + pathname });
    } catch (error) {
      return sendJson(res, 500, {
        ok: false,
        code: "failed",
        message: String(error && error.message ? error.message : error),
      });
    }
  };
}