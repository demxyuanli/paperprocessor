import path from "node:path";

import { isInside, slugifyTitle } from "./util.js";
import { firstHeading, splitFrontMatter } from "./frontmatter.js";
import { exportPaper, normalizeFormats } from "./export/index.js";

const str = { type: "string" };
const bool = { type: "boolean" };
const int = { type: "integer" };
const strArray = { type: "array", items: { type: "string" } };

function object(properties, required = []) {
  return { type: "object", properties, required, additionalProperties: false };
}

function text(value) {
  return [{ type: "text", text: value }];
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

function rootFor(state, exec) {
  const cwd = cwdFrom(exec);
  if (cwd !== undefined) return path.resolve(cwd);
  if (state.config.workspaceRoot) return path.resolve(state.config.workspaceRoot);
  return process.cwd();
}

function storeFor(state, root) {
  let store = state.stores.get(root);
  if (!store) {
    store = state.createStore(root);
    state.stores.set(root, store);
  }
  return store;
}

function requireString(args, key) {
  const value = args[key];
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error("parameter \"" + key + "\" must be a non-empty string");
  }
  return value.trim();
}

function optionalString(args, key) {
  const value = args[key];
  if (value === undefined || value === null || value === "") return undefined;
  if (typeof value !== "string") throw new Error("parameter \"" + key + "\" must be a string");
  return value;
}

function optionalBoolean(args, key) {
  const value = args[key];
  if (value === undefined) return undefined;
  if (typeof value !== "boolean") throw new Error("parameter \"" + key + "\" must be a boolean");
  return value;
}

function optionalVersion(args, key) {
  const value = args[key];
  if (value === undefined || value === null || value === "") return undefined;
  if (typeof value === "number" && Number.isInteger(value) && value > 0) return String(value);
  if (typeof value === "string") return value;
  throw new Error("parameter \"" + key + "\" must be a version string or a positive integer");
}

function optionalInteger(args, key) {
  const value = args[key];
  if (value === undefined) return undefined;
  if (!Number.isInteger(value) || value <= 0) throw new Error("parameter \"" + key + "\" must be a positive integer");
  return value;
}

function watchSchema() {
  return object({
    id: str,
    docId: str,
    filePath: str,
    baseVersion: int,
    syncMode: str,
    idleMs: int,
    pending: bool,
    pendingForMs: int,
    status: str,
    lastVersion: int,
    lastError: str,
    updatedAt: str,
  }, ["id", "docId", "filePath", "baseVersion", "syncMode", "idleMs", "pending", "pendingForMs", "status", "lastVersion", "lastError", "updatedAt"]);
}

function paperSummary(paper) {
  const words = paper.targetWords > 0 ? paper.words + "/" + paper.targetWords + "w" : paper.words + "w";
  return paper.docId + "  v" + paper.currentVersion + "  [" + (paper.stage || "idea") + "/" + paper.status + "]  " + words + "  " + (paper.drift ? "DRIFT" : "clean") + "  " + paper.title;
}

function listRender(value) {
  const lines = value.papers.map((paper) => "- " + paperSummary(paper) + (paper.latestMessage ? "  — " + paper.latestMessage : ""));
  return text(value.count + " paper(s) under " + value.root + (lines.length > 0 ? "\n" + lines.join("\n") : "\n(no papers yet; create one with paper_new)"));
}

function headingLabel(heading) {
  if (!heading.number) return heading.title;
  if (heading.title.startsWith(heading.number)) return heading.title;
  return heading.number + " " + heading.title;
}

function readRender(args, value) {
  const versionLine = value.version > 0 ? "v" + String(value.version).padStart(6, "0") : "unversioned";
  const headingLines = value.headings.map((h) => "  ".repeat(Math.max(0, h.level - 2)) + headingLabel(h));
  if (args.brief === true) {
    return text(value.docId + " · " + value.title + " · " + versionLine + " · " + value.words + " words" + (value.drift ? " · DRIFT" : "") + "\n" + headingLines.join("\n"));
  }
  return text(value.docId + " · " + value.title + " · " + versionLine + " · " + value.words + " words" + (value.drift ? " · DRIFT" : "") + "\n\n" + value.body);
}

/**
 * The paper_* tool definitions. Exported as plain descriptors so the host can
 * register them without importing a schema DSL, and so tests can exercise them
 * without a running DSH host.
 */
export function toolDefinitions(state) {
  return [
    {
      name: "paper_new",
      description: "Create a version-managed Markdown paper under papers/<docId>/<docId>.md. The initial content becomes version 1. Use paper_write/paper_edit for every later change; direct writes to the paper entry file are blocked.",
      parameters: object({
        title: { ...str, description: "Paper title. Required unless content already starts with an H1; when both are present, title wins." },
        docId: { ...str, description: "Optional stable id (letters/digits/_/-). Defaults to a slug of title." },
        content: { ...str, description: "Optional initial Markdown body. If omitted, a minimal Abstract/Introduction skeleton is created." },
        message: { ...str, description: "Why this paper exists. Stored as version 1's message." },
        stage: { ...str, description: "Drafting stage: idea, outline, drafting, revising, done. Defaults to idea." },
        targetWords: { ...int, description: "Optional target word count for the draft." },
        question: { ...str, description: "Optional one-sentence research question." },
        nextAction: { ...str, description: "Optional single next action for the next writing session." },
      }),
      output: {
        schema: object({
          ok: bool,
          docId: str,
          title: str,
          path: str,
          version: int,
          versionId: str,
          message: str,
        }, ["ok", "docId", "title", "path", "version", "versionId", "message"]),
        render: (args, value) => text("created " + value.docId + " at " + value.path + " (" + value.versionId + ")"),
      },
      presentCall: (args) => ({ card: "generic", title: "New paper", kind: "other", rawInput: args.title }),
      async execute(args, exec) {
        const title = optionalString(args, "title");
        const content = optionalString(args, "content");
        if (!title && !content) throw new Error("paper_new needs title, content, or both");
        const parsed = content ? splitFrontMatter(content) : { data: {}, body: "" };
        const derivedTitle = title || parsed.data.title || firstHeading(parsed.body) || "";
        const root = rootFor(state, exec);
        const store = storeFor(state, root);
        const docId = optionalString(args, "docId") || slugifyTitle(derivedTitle);
        const result = await store.create({
          docId,
          title: title || undefined,
          content,
          message: optionalString(args, "message") || "Create paper " + docId,
          stage: optionalString(args, "stage"),
          targetWords: optionalInteger(args, "targetWords"),
          question: optionalString(args, "question"),
          nextAction: optionalString(args, "nextAction"),
        });
        return {
          ok: true,
          docId: result.docId,
          title: result.record.title,
          path: store.docPath(result.docId),
          version: result.version.version,
          versionId: result.version.id,
          message: result.version.message,
        };
      },
    },

    {
      name: "paper_brief",
      description: "Update a paper's lightweight writing brief without rewriting the body: stage, question, audience, contribution, targetWords, nextAction, deadline. Creates one version with source paper_brief.",
      parameters: object({
        docId: { ...str, description: "Paper id." },
        message: { ...str, description: "Optional change message; defaults to \"Update writing brief\"." },
        stage: { ...str, description: "Drafting stage: idea, outline, drafting, revising, done." },
        question: { ...str, description: "One-sentence research question." },
        audience: { ...str, description: "Intended reader or venue." },
        contribution: { ...str, description: "What the paper claims to contribute." },
        targetWords: { ...int, description: "Target word count; 0 clears it." },
        nextAction: { ...str, description: "Single next action for the next writing session." },
        deadline: { ...str, description: "Optional deadline, e.g. 2026-12-31." },
      }, ["docId"]),
      output: {
        schema: object({
          ok: bool,
          docId: str,
          changed: bool,
          version: int,
          versionId: str,
          sha256: str,
          message: str,
          stage: str,
          targetWords: int,
          nextAction: str,
          deadline: str,
        }, ["ok", "docId", "changed", "version", "versionId", "sha256", "message", "stage", "targetWords", "nextAction", "deadline"]),
        render: (args, value) => text((value.changed ? "updated brief for " : "no change; brief for ") + value.docId + " · stage " + value.stage + (value.targetWords > 0 ? " · target " + value.targetWords + " words" : "") + (value.nextAction ? " · next: " + value.nextAction : "")),
      },
      presentCall: (args) => ({ card: "generic", title: "Update writing brief", kind: "edit", rawInput: args.docId }),
      async execute(args, exec) {
        const docId = requireString(args, "docId");
        const root = rootFor(state, exec);
        const store = storeFor(state, root);
        const targetWords = args.targetWords === 0 ? 0 : optionalInteger(args, "targetWords");
        const result = await store.setBrief({
          docId,
          message: optionalString(args, "message"),
          stage: optionalString(args, "stage"),
          question: args.question,
          audience: args.audience,
          contribution: args.contribution,
          targetWords,
          nextAction: args.nextAction,
          deadline: args.deadline,
        });
        return {
          ok: true,
          docId,
          changed: result.changed,
          version: result.version.version,
          versionId: result.version.id,
          sha256: result.version.sha256,
          message: result.version.message,
          stage: result.record.stage,
          targetWords: result.record.targetWords ?? 0,
          nextAction: result.record.nextAction ?? "",
          deadline: result.record.deadline ?? "",
        };
      },
    },

    {
      name: "paper_status",
      description: "Change a paper's publication status (draft, review, published, archived) without rewriting its body. Creates one paper_status version. Use this before exporting when the DOCX title page still says draft.",
      parameters: object({
        docId: { ...str, description: "Paper id." },
        status: { ...str, description: "draft, review, published or archived." },
        message: { ...str, description: "Optional change message; defaults to Set status to <status>." },
      }, ["docId", "status"]),
      output: {
        schema: object({
          ok: bool,
          docId: str,
          changed: bool,
          status: str,
          version: int,
          versionId: str,
          sha256: str,
          message: str,
        }, ["ok", "docId", "changed", "status", "version", "versionId", "sha256", "message"]),
        render: (args, value) => text((value.changed ? "status updated: " : "status unchanged: ") + value.docId + " -> " + value.status + " (" + value.versionId + ")"),
      },
      presentCall: (args) => ({ card: "generic", title: "Set paper status", kind: "edit", rawInput: args.docId }),
      async execute(args, exec) {
        const docId = requireString(args, "docId");
        const status = requireString(args, "status");
        const root = rootFor(state, exec);
        const store = storeFor(state, root);
        const result = await store.setStatus({ docId, status, message: optionalString(args, "message") });
        return {
          ok: true,
          docId,
          changed: result.changed,
          status: result.record.status,
          version: result.version.version,
          versionId: result.version.id,
          sha256: result.version.sha256,
          message: result.version.message,
        };
      },
    },

    {
      name: "paper_adopt_external",
      description: "Explicitly adopt a manual edit to papers/<docId>/<docId>.md as a new external version. Use it after editing the Markdown outside the paper_* tools, especially when autoAdoptExternal is disabled. Preserves the file's front matter; change status separately with paper_status if needed.",
      parameters: object({
        docId: { ...str, description: "Paper id." },
        message: { ...str, description: "Optional change message; defaults to Adopt external Markdown change (manual)." },
      }, ["docId"]),
      output: {
        schema: object({
          ok: bool,
          docId: str,
          changed: bool,
          version: int,
          versionId: str,
          sha256: str,
          message: str,
        }, ["ok", "docId", "changed", "version", "versionId", "sha256", "message"]),
        render: (args, value) => text((value.changed ? "adopted external edit: " : "no external change: ") + value.docId + " (" + value.versionId + ")"),
      },
      presentCall: (args) => ({ card: "generic", title: "Adopt external Markdown", kind: "edit", rawInput: args.docId }),
      async execute(args, exec) {
        const docId = requireString(args, "docId");
        const root = rootFor(state, exec);
        const store = storeFor(state, root);
        const result = await store.adoptExternal({ docId, message: optionalString(args, "message") });
        return {
          ok: true,
          docId,
          changed: result.changed,
          version: result.version.version,
          versionId: result.version.id,
          sha256: result.version.sha256,
          message: result.version.message,
        };
      },
    },

    {
      name: "paper_check",
      description: "Advisory readiness checklist for the \"get it written\" workflow: question, title, abstract, structure, word progress, TODO markers and next action. Not a submission compliance check.",
      parameters: object({
        docId: { ...str, description: "Paper id." },
      }, ["docId"]),
      output: {
        schema: object({
          ok: bool,
          docId: str,
          title: str,
          version: int,
          versionId: { type: "string" },
          stage: str,
          stageLabel: str,
          words: int,
          targetWords: int,
          progress: int,
          score: int,
          todos: int,
          abstractWords: int,
          headingCount: int,
          nextAction: str,
          deadline: str,
          question: str,
          checks: { type: "array", items: object({
            id: str,
            label: str,
            status: str,
            detail: str,
          }, ["id", "label", "status", "detail"]) },
        }, ["ok", "docId", "title", "version", "versionId", "stage", "stageLabel", "words", "targetWords", "progress", "score", "todos", "abstractWords", "headingCount", "nextAction", "deadline", "question", "checks"]),
        render: (args, value) => text(value.docId + " · " + value.stageLabel + " · " + value.score + "/100 · " + value.words + "/" + (value.targetWords || "?") + " words\n" + value.checks.map((check) => "- [" + check.status + "] " + check.label + ": " + check.detail).join("\n")),
      },
      presentCall: (args) => ({ card: "generic", title: "Check draft", kind: "read", rawInput: args.docId }),
      async execute(args, exec) {
        const docId = requireString(args, "docId");
        const root = rootFor(state, exec);
        const store = storeFor(state, root);
        const value = await store.check({ docId });
        return {
          ok: true,
          docId: value.docId,
          title: value.title,
          version: value.version,
          versionId: value.versionId ?? "",
          stage: value.stage,
          stageLabel: value.stageLabel,
          words: value.words,
          targetWords: value.targetWords,
          progress: value.progress ?? 0,
          score: value.score,
          todos: value.todos,
          abstractWords: value.abstractWords,
          headingCount: value.headingCount,
          nextAction: value.nextAction,
          deadline: value.deadline,
          question: value.question,
          checks: value.checks,
        };
      },
    },

    {
      name: "paper_list",
      description: "List version-managed papers with their current version, status, stage, word progress, lineage, and whether the paper entry file has unversioned external changes (DRIFT).",
      parameters: object({}),
      output: {
        schema: object({
          ok: bool,
          root: str,
          count: int,
          papers: { type: "array", items: object({
            docId: str,
            title: str,
            path: str,
            registered: bool,
            missing: bool,
            status: str,
            stage: str,
            stageLabel: str,
            targetWords: int,
            progress: int,
            score: int,
            question: str,
            nextAction: str,
            deadline: str,
            currentVersion: int,
            versionCount: int,
            drift: bool,
            latestMessage: { type: "string" },
            latestCreatedAt: { type: "string" },
            updatedAt: { type: "string" },
            bytes: int,
            words: int,
            exports: int,
            lineage: object({
              parents: { type: "array", items: object({ docId: str, version: int, relation: str, at: str }, ["docId", "version", "relation"]) },
              children: { type: "array", items: object({ docId: str, version: int, relation: str, at: str }, ["docId", "version", "relation"]) },
            }, ["parents", "children"]),
          }, ["docId", "title", "path", "registered", "missing", "status", "currentVersion", "versionCount", "drift", "bytes", "words", "exports", "lineage"]) },
        }, ["ok", "root", "count", "papers"]),
        render: (args, value) => listRender(value),
      },
      presentCall: () => ({ card: "generic", title: "List papers", kind: "other" }),
      async execute(args, exec) {
        const root = rootFor(state, exec);
        const store = storeFor(state, root);
        const value = await store.list();
        return {
          ok: true,
          root: value.root,
          count: value.papers.length,
          papers: value.papers.map((paper) => ({
            docId: paper.docId,
            title: paper.title,
            path: paper.path,
            registered: paper.registered,
            missing: paper.missing,
            status: paper.status,
            stage: paper.stage,
            stageLabel: paper.stageLabel,
            targetWords: paper.targetWords,
            progress: paper.draft?.progress ?? 0,
            score: paper.draft?.score ?? 0,
            question: paper.question ?? "",
            nextAction: paper.nextAction ?? "",
            deadline: paper.deadline ?? "",
            currentVersion: paper.currentVersion,
            versionCount: paper.versionCount,
            drift: paper.drift,
            latestMessage: paper.latestMessage ?? "",
            latestCreatedAt: paper.latestCreatedAt ?? "",
            updatedAt: paper.updatedAt ?? "",
            bytes: paper.bytes,
            words: paper.words,
            exports: paper.exports,
            lineage: {
              parents: (paper.lineage?.parents ?? []).map((entry) => ({ docId: entry.docId, version: entry.version, relation: entry.relation, at: entry.at ?? "" })),
              children: (paper.lineage?.children ?? []).map((entry) => ({ docId: entry.docId, version: entry.version, relation: entry.relation, at: entry.at ?? "" })),
            },
          })),
        };
      },
    },

    {
      name: "paper_read",
      description: "Read a paper by id, optionally a historical version or one section. External changes are adopted as a new version first. Use brief:true for a compact digest (metadata + headings) when resuming.",
      parameters: object({
        docId: { ...str, description: "Paper id." },
        version: { ...str, description: "Optional version: \"latest\" or a number such as \"3\"." },
        brief: { ...bool, description: "Return metadata and headings only, not the full body." },
        section: { ...str, description: "Optional section selector: number like 2 or 2.1, or a heading title." },
      }, ["docId"]),
      output: {
        schema: object({
          ok: bool,
          docId: str,
          title: str,
          version: int,
          versionId: { type: "string" },
          sha256: str,
          bytes: int,
          words: int,
          body: str,
          meta: { type: "object", additionalProperties: true },
          headings: { type: "array", items: object({ level: int, number: str, title: str, line: int }, ["level", "number", "title", "line"]) },
          adopted: bool,
          drift: bool,
        }, ["ok", "docId", "title", "version", "versionId", "sha256", "bytes", "words", "body", "meta", "headings", "adopted", "drift"]),
        render: readRender,
      },
      presentCall: (args) => ({ card: "generic", title: "Read paper", kind: "read", rawInput: args.docId }),
      async execute(args, exec) {
        const docId = requireString(args, "docId");
        const root = rootFor(state, exec);
        const store = storeFor(state, root);
        const value = await store.read({
          docId,
          version: optionalVersion(args, "version"),
          brief: optionalBoolean(args, "brief") === true,
          section: optionalString(args, "section"),
        });
        return { ok: true, ...value, versionId: value.versionId ?? "" };
      },
    },

    {
      name: "paper_write",
      description: "Replace a paper's Markdown body and create a new immutable version. A non-empty message is mandatory. If the content is unchanged no version is created. Content may include YAML front matter; paper/title/status are normalized.",
      parameters: object({
        docId: { ...str, description: "Paper id." },
        content: { ...str, description: "Complete new Markdown content (body, optionally with front matter)." },
        message: { ...str, description: "Mandatory change message stored in the version history." },
        title: { ...str, description: "Optional new title; updates front matter and the first H1." },
        status: { ...str, description: "Optional status such as draft, review, published." },
      }, ["docId", "content", "message"]),
      output: {
        schema: object({
          ok: bool,
          docId: str,
          changed: bool,
          version: int,
          versionId: str,
          sha256: str,
          bytes: int,
          message: str,
          adopted: bool,
        }, ["ok", "docId", "changed", "version", "versionId", "sha256", "bytes", "message", "adopted"]),
        render: (args, value) => text((value.changed ? "committed " : "no change; still at ") + value.docId + " " + value.versionId + (value.changed ? " — " + value.message : "")),
      },
      presentCall: (args) => ({ card: "generic", title: "Write paper", kind: "edit", rawInput: args.docId }),
      async execute(args, exec) {
        const docId = requireString(args, "docId");
        const content = requireString(args, "content");
        const message = requireString(args, "message");
        const root = rootFor(state, exec);
        const store = storeFor(state, root);
        const result = await store.write({
          docId,
          content,
          message,
          title: optionalString(args, "title"),
          status: optionalString(args, "status"),
        });
        return {
          ok: true,
          docId,
          changed: result.changed,
          version: result.version.version,
          versionId: result.version.id,
          sha256: result.version.sha256,
          bytes: result.version.bytes,
          message: result.version.message,
          adopted: result.adopted === true,
        };
      },
    },

    {
      name: "paper_edit",
      description: "Apply one or more exact text replacements to a paper's Markdown body and create a new immutable version. A non-empty message is mandatory. Each oldText must occur; no match fails the whole edit.",
      parameters: object({
        docId: { ...str, description: "Paper id." },
        replacements: {
          type: "array",
          description: "Ordered exact replacements applied to the body (front matter is preserved).",
          items: object({
            oldText: { ...str, description: "Exact text to find." },
            newText: { ...str, description: "Replacement text (may be empty)." },
            all: { ...bool, description: "Replace every occurrence (default: first only)." },
          }, ["oldText", "newText"]),
        },
        message: { ...str, description: "Mandatory change message stored in the version history." },
      }, ["docId", "replacements", "message"]),
      output: {
        schema: object({
          ok: bool,
          docId: str,
          changed: bool,
          applied: int,
          version: int,
          versionId: str,
          sha256: str,
          message: str,
          adopted: bool,
        }, ["ok", "docId", "changed", "applied", "version", "versionId", "sha256", "message", "adopted"]),
        render: (args, value) => text((value.changed ? "applied " : "no change; applied ") + value.applied + " replacement(s) to " + value.docId + " " + value.versionId),
      },
      presentCall: (args) => ({ card: "generic", title: "Edit paper", kind: "edit", rawInput: args.docId }),
      async execute(args, exec) {
        const docId = requireString(args, "docId");
        const message = requireString(args, "message");
        if (!Array.isArray(args.replacements) || args.replacements.length === 0) {
          throw new Error("replacements must be a non-empty array");
        }
        const root = rootFor(state, exec);
        const store = storeFor(state, root);
        const result = await store.edit({ docId, replacements: args.replacements, message });
        return {
          ok: true,
          docId,
          changed: result.changed,
          applied: result.applied,
          version: result.version.version,
          versionId: result.version.id,
          sha256: result.version.sha256,
          message: result.version.message,
          adopted: result.adopted === true,
        };
      },
    },

    {
      name: "paper_history",
      description: "List a paper's immutable version history, newest first: version id, time, message, source, content hash.",
      parameters: object({
        docId: { ...str, description: "Paper id." },
        limit: { ...int, description: "Maximum versions to return (default 30, max 200)." },
      }, ["docId"]),
      output: {
        schema: object({
          ok: bool,
          docId: str,
          title: str,
          currentVersion: int,
          adopted: bool,
          versions: { type: "array", items: object({
            version: int,
            id: str,
            createdAt: str,
            message: str,
            source: str,
            sha256: str,
            shortSha: str,
            bytes: int,
            title: str,
            previous: { type: "integer" },
          }, ["version", "id", "createdAt", "message", "source", "sha256", "shortSha", "bytes", "title", "previous"]) },
        }, ["ok", "docId", "title", "currentVersion", "adopted", "versions"]),
        render: (args, value) => text(value.docId + " · " + value.title + " · current " + value.currentVersion + "\n" + value.versions.map((v) => v.id + "  " + v.createdAt + "  [" + v.source + "]  " + v.message).join("\n")),
      },
      presentCall: (args) => ({ card: "generic", title: "Paper history", kind: "other", rawInput: args.docId }),
      async execute(args, exec) {
        const docId = requireString(args, "docId");
        const root = rootFor(state, exec);
        const store = storeFor(state, root);
        const value = await store.history({ docId, limit: optionalInteger(args, "limit") });
        return { ok: true, ...value };
      },
    },

    {
      name: "paper_diff",
      description: "Show a unified diff between two versions of a paper (defaults: previous vs latest; body only unless includeFrontMatter). Use it to review what changed before publishing.",
      parameters: object({
        docId: { ...str, description: "Paper id." },
        fromVersion: { ...str, description: "Older version (default: version before to)." },
        toVersion: { ...str, description: "Newer version (default: latest)." },
        includeFrontMatter: { ...bool, description: "Include YAML front matter in the diff (default false: body only)." },
      }, ["docId"]),
      output: {
        schema: object({
          ok: bool,
          docId: str,
          from: object({ version: int, id: str, message: str }, ["version", "id", "message"]),
          to: object({ version: int, id: str, message: str }, ["version", "id", "message"]),
          patch: str,
          truncated: bool,
          added: int,
          removed: int,
          unchanged: int,
        }, ["ok", "docId", "from", "to", "patch", "truncated", "added", "removed", "unchanged"]),
        render: (args, value) => text("diff " + value.docId + " " + value.from.id + " -> " + value.to.id + " (+" + value.added + " -" + value.removed + ")\n" + value.patch),
      },
      presentCall: (args) => ({ card: "generic", title: "Paper diff", kind: "other", rawInput: args.docId }),
      async execute(args, exec) {
        const docId = requireString(args, "docId");
        const root = rootFor(state, exec);
        const store = storeFor(state, root);
        const value = await store.diff({
          docId,
          fromVersion: optionalVersion(args, "fromVersion"),
          toVersion: optionalVersion(args, "toVersion"),
          includeFrontMatter: optionalBoolean(args, "includeFrontMatter") === true,
        });
        return { ok: true, ...value };
      },
    },

    {
      name: "paper_restore",
      description: "Restore an older version as a NEW version (history is never rewritten). Useful when an edit went wrong; the restored content gets a fresh version number.",
      parameters: object({
        docId: { ...str, description: "Paper id." },
        version: { ...str, description: "Version to restore, such as \"3\" or v000003." },
        message: { ...str, description: "Optional reason; defaults to a restore message." },
      }, ["docId", "version"]),
      output: {
        schema: object({
          ok: bool,
          docId: str,
          restoredFrom: object({ version: int, id: str, message: str }, ["version", "id", "message"]),
          changed: bool,
          version: int,
          versionId: str,
          sha256: str,
          message: str,
        }, ["ok", "docId", "restoredFrom", "changed", "version", "versionId", "sha256", "message"]),
        render: (args, value) => text("restored " + value.docId + " from " + value.restoredFrom.id + " as " + value.versionId + (value.changed ? "" : " (already identical)")),
      },
      presentCall: (args) => ({ card: "generic", title: "Restore paper", kind: "other", rawInput: args.docId }),
      async execute(args, exec) {
        const docId = requireString(args, "docId");
        const version = optionalVersion(args, "version");
        if (!version) throw new Error("parameter \"version\" is required");
        const root = rootFor(state, exec);
        const store = storeFor(state, root);
        const result = await store.restore({ docId, version, message: optionalString(args, "message") });
        return {
          ok: true,
          docId,
          restoredFrom: { version: result.restoredFrom.version, id: result.restoredFrom.id, message: result.restoredFrom.message },
          changed: result.changed,
          version: result.version.version,
          versionId: result.version.id,
          sha256: result.version.sha256,
          message: result.version.message,
        };
      },
    },

    {
      name: "paper_branch",
      description: "Derive one or more standalone papers from a paper (or a historical version). mode: full copies the whole body; mode: excerpt keeps the preamble plus selected sections and their subsections. Each new paper starts at v000001 and records its lineage. Use this to split an evolving paper into topic branches.",
      parameters: object({
        from: { ...str, description: "Source paper id." },
        fromVersion: { ...str, description: "Optional source version; defaults to latest." },
        mode: { ...str, description: "Default branch mode: full or excerpt. Per-branch mode overrides it." },
        message: { ...str, description: "Default version message for created branches." },
        branches: {
          type: "array",
          description: "One or more new papers to derive.",
          items: object({
            title: { ...str, description: "Title of the new paper." },
            slug: { ...str, description: "Optional id for the new paper; defaults to a slug of title." },
            sections: { ...strArray, description: "Section selectors (number like 2.1 or heading title) for excerpt mode." },
            includeAbstract: { ...bool, description: "Include the Abstract/摘要 section automatically in excerpt mode (default true)." },
            mode: { ...str, description: "full or excerpt for this branch." },
            message: { ...str, description: "Optional version message for this branch." },
          }, ["title"]),
        },
      }, ["from", "branches"]),
      output: {
        schema: object({
          ok: bool,
          from: str,
          fromVersion: int,
          created: { type: "array", items: object({
            docId: str,
            title: str,
            path: str,
            version: int,
            versionId: str,
            mode: str,
            sections: strArray,
          }, ["docId", "title", "path", "version", "versionId", "mode", "sections"]) },
        }, ["ok", "from", "fromVersion", "created"]),
        render: (args, value) => text("derived " + value.created.length + " paper(s) from " + value.from + " v" + value.fromVersion + "\n" + value.created.map((c) => "- " + c.docId + " (" + c.mode + ") v" + String(c.version).padStart(6, "0") + " at " + c.path).join("\n")),
      },
      presentCall: (args) => ({ card: "generic", title: "Branch paper", kind: "other", rawInput: args.from }),
      async execute(args, exec) {
        const from = requireString(args, "from");
        if (!Array.isArray(args.branches) || args.branches.length === 0) throw new Error("branches must be a non-empty array");
        const root = rootFor(state, exec);
        const store = storeFor(state, root);
        const result = await store.branch({
          from,
          fromVersion: optionalVersion(args, "fromVersion"),
          mode: optionalString(args, "mode"),
          message: optionalString(args, "message"),
          branches: args.branches,
        });
        return {
          ok: true,
          from: result.from,
          fromVersion: result.fromVersion,
          created: result.created.map((item) => ({
            docId: item.docId,
            title: item.title,
            path: store.docPath(item.docId),
            version: item.version.version,
            versionId: item.version.id,
            mode: item.mode,
            sections: item.sections,
          })),
        };
      },
    },

    {
      name: "paper_export",
      description: "Export an immutable paper version to publication formats: html, docx, pdf (default all three). PDF uses a local Chromium browser (Chrome/Edge) headless print-to-PDF. Files are named <docId>-<versionId>.<ext> under exports/<docId>/<versionId>/ with a manifest. Set watch:true to copy the DOCX to papers/<docId>/work and coalesce Word saves there: it is imported only after watchIdleSeconds of quiet, or immediately when watchSync is immediate.",
      parameters: object({
        docId: { ...str, description: "Paper id." },
        version: { ...str, description: "Optional version; defaults to latest." },
        formats: { ...strArray, description: "Any of html, docx, pdf, all. Defaults to all three." },
        watch: { ...bool, description: "Copy the exported DOCX to papers/<docId>/work and watch that working copy. Only the current version can be watched." },
        watchSync: { ...str, description: "idle (default), manual, or immediate. idle coalesces saves until watchIdleSeconds of quiet; manual only writes on paper_sync_docx." },
        watchIdleSeconds: { ...int, description: "Quiet period before an idle watch commits, in seconds. Default 300; 0 commits on the next poll." },
      }, ["docId"]),
      output: {
        schema: object({
          ok: bool,
          docId: str,
          dir: str,
          version: int,
          versionId: str,
          sha256: str,
          files: { type: "array", items: object({
            format: str,
            ok: bool,
            path: { type: "string" },
            bytes: int,
            error: { type: "string" },
          }, ["format", "ok", "path", "bytes", "error"]) },
          warnings: strArray,
          watch: watchSchema(),
        }, ["ok", "docId", "dir", "version", "versionId", "sha256", "files", "warnings"]),
        render: (args, value) => text("exported " + value.docId + " " + value.versionId + " to " + value.dir + "\n" + value.files.map((f) => "- " + f.format + ": " + (f.ok ? "ok (" + f.bytes + " bytes) " + f.path : "FAILED — " + f.error)).join("\n") + (value.warnings.length > 0 ? "\nwarnings:\n" + value.warnings.map((w) => "- " + w).join("\n") : "")),
      },
      presentCall: (args) => ({ card: "generic", title: "Export paper", kind: "other", rawInput: args.docId }),
      timeoutMs: 300000,
      async execute(args, exec) {
        const docId = requireString(args, "docId");
        const formats = normalizeFormats(args.formats);
        const root = rootFor(state, exec);
        const store = storeFor(state, root);
        const snapshot = await store.readVersionForExport(docId, optionalVersion(args, "version"));
        const watchRequested = args.watch === true;
        if (watchRequested && !formats.includes("docx")) throw new Error("watch:true requires the docx format");
        if (formats.includes("docx")) {
          const existing = state.watchers.findForDoc(docId);
          if (existing && existing.pending && (watchRequested || existing.baseVersion === snapshot.meta.version)) {
            throw new Error("Word edits are pending for " + docId + "; sync them with paper_sync_docx before re-exporting the DOCX");
          }
        }
        if (watchRequested) {
          const current = await store.read({ docId });
          if (current.version !== snapshot.meta.version) {
            throw new Error("watch:true only supports the current version; export " + current.versionId + " instead of " + snapshot.meta.id);
          }
        }
        const result = await exportPaper({
          root,
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
          dir: path.relative(root, result.dir).replace(/\\/g, "/"),
          formats: result.files.filter((file) => file.ok).map((file) => file.format),
          createdAt: new Date().toISOString(),
        });
        let watch = null;
        if (watchRequested) {
          const docxFile = result.files.find((file) => file.format === "docx" && file.ok);
          if (!docxFile) throw new Error("DOCX export failed; cannot start watching");
          const workingCopy = await store.prepareWorkingDocx({
            docId,
            versionId: snapshot.meta.id,
            sourcePath: docxFile.path,
          });
          watch = await state.watchers.start({
            store,
            docId,
            filePath: workingCopy,
            baseVersion: snapshot.meta.version,
            syncMode: typeof args.watchSync === "string" ? args.watchSync : "idle",
            idleMs: Number.isInteger(args.watchIdleSeconds) ? args.watchIdleSeconds * 1000 : 300000,
          });
        }
        const value = {
          ok: result.files.some((file) => file.ok),
          docId,
          dir: result.dir,
          version: snapshot.meta.version,
          versionId: snapshot.meta.id,
          sha256: snapshot.meta.sha256,
          files: result.files.map((file) => ({
            format: file.format,
            ok: file.ok,
            path: file.path ?? "",
            bytes: file.bytes,
            error: file.error ?? "",
          })),
          warnings: result.warnings,
        };
        if (watch !== null) value.watch = watch;
        return value;
      },
    },
    {
      name: "paper_import_docx",
      description: "Round-trip Word edits back into the paper store. Converts a .docx to Markdown, previews the diff against the current paper, and (with confirm=true) commits it as a new immutable version with source docx_import. Preview first; the base version is inferred from v000123 in the path or can be passed explicitly. If the paper has advanced beyond the DOCX base, or the base cannot be inferred from a v000123 filename, confirm is refused unless force=true. Word comments, tracked changes and complex equations are not fully preserved.",
      parameters: object({
        docId: { ...str, description: "Paper id." },
        path: { ...str, description: "Path to the edited .docx (absolute, or relative to the workspace root)." },
        message: { ...str, description: "Version message; defaults to Import Word edits from <filename>." },
        baseVersion: { ...int, description: "Optional base version the DOCX was exported from; inferred from v000123 in the filename when omitted." },
        confirm: { ...bool, description: "false (default) returns a preview and writes no version; true commits the converted Markdown." },
        force: { ...bool, description: "Allow confirm even when the paper has advanced beyond baseVersion. Review the preview diff first." },
      }, ["docId", "path"]),
      output: {
        schema: object({
          ok: bool,
          docId: str,
          preview: bool,
          changed: bool,
          conflict: bool,
          baseVersion: int,
          currentVersion: int,
          added: int,
          removed: int,
          unchanged: int,
          patch: str,
          truncated: bool,
          warnings: strArray,
          images: { type: "array", items: object({ name: str, contentType: str, bytes: int }, ["name", "contentType", "bytes"]) },
          version: int,
          versionId: str,
          sha256: str,
        }, ["ok", "docId", "preview", "changed", "conflict", "baseVersion", "currentVersion", "added", "removed", "unchanged", "patch", "truncated", "warnings", "images", "version", "versionId", "sha256"]),
        render: (args, value) => text(
          (value.preview ? "Word preview for " : "imported Word edits into ") + value.docId +
          " (base " + (value.baseVersion > 0 ? "v" + String(value.baseVersion).padStart(6, "0") : "unknown") + ", current v" + String(value.currentVersion).padStart(6, "0") + ")" +
          " +" + value.added + " -" + value.removed +
          (value.conflict ? "\nCONFLICT: paper advanced beyond the DOCX base; review the diff" : "") +
          (value.images.length > 0 ? "\nimages: " + value.images.map((image) => image.name).join(", ") : "") +
          (value.warnings.length > 0 ? "\nwarnings:\n" + value.warnings.map((warning) => "- " + warning).join("\n") : "") +
          (value.patch ? "\n" + value.patch : "")
        ),
      },
      presentCall: (args) => ({ card: "generic", title: "Import Word edits", kind: "other", rawInput: args.docId }),
      async execute(args, exec) {
        const docId = requireString(args, "docId");
        const filePath = requireString(args, "path");
        const root = rootFor(state, exec);
        const store = storeFor(state, root);
        const result = await store.importDocx({
          docId,
          filePath,
          message: optionalString(args, "message"),
          confirm: optionalBoolean(args, "confirm") === true,
          force: optionalBoolean(args, "force") === true,
          baseVersion: optionalInteger(args, "baseVersion") ?? null,
        });
        return {
          ok: true,
          ...result,
          baseVersion: result.baseVersion === null ? 0 : result.baseVersion,
          version: result.version === null ? 0 : result.version,
        };
      },
    },
    {
      name: "paper_sync_docx",
      description: "Force a watched Word DOCX checkpoint now. Use it after a batch of edits when watchSync is manual, or before closing Word. If there is no pending save, returns the current watch status without creating a version.",
      parameters: object({
        watchId: { ...str, description: "Watch id returned by paper_export watch:true." },
        docId: { ...str, description: "Paper id, used when watchId is omitted." },
        message: { ...str, description: "Optional version message; defaults to Sync Word edits: <filename>." },
      }),
      output: {
        schema: object({ ok: bool, watch: watchSchema() }, ["ok", "watch"]),
        render: (args, value) => text("sync " + value.watch.docId + " => " + (value.watch.pending ? "pending" : "v" + String(value.watch.lastVersion).padStart(6, "0")) + (value.watch.lastError ? "\n" + value.watch.lastError : "")),
      },
      presentCall: (args) => ({ card: "generic", title: "Sync Word edits", kind: "other", rawInput: args.docId || args.watchId || "" }),
      async execute(args, exec) {
        const watchId = optionalString(args, "watchId");
        const docId = optionalString(args, "docId");
        if (!watchId && !docId) throw new Error("watchId or docId is required");
        const watch = watchId ? state.watchers.get(watchId) : state.watchers.findForDoc(docId);
        if (!watch) throw new Error("no Word watcher found for " + (watchId || docId));
        if (!isInside(rootFor(state, exec), watch.filePath)) throw new Error("watch belongs to another workspace");
        const result = await state.watchers.sync(watch.id, { message: optionalString(args, "message") });
        return { ok: true, watch: result };
      },
    },

    {
      name: "paper_unwatch_docx",
      description: "Stop watching a Word DOCX. Any pending save is left uncommitted; call paper_sync_docx first if you want to keep it.",
      parameters: object({ watchId: { ...str, description: "Watch id returned by paper_export watch:true." } }, ["watchId"]),
      output: {
        schema: object({ ok: bool, watch: watchSchema() }, ["ok", "watch"]),
        render: (args, value) => text("stopped watching " + value.watch.docId + " (" + value.watch.id + ")"),
      },
      presentCall: (args) => ({ card: "generic", title: "Stop Word watch", kind: "other", rawInput: args.watchId || "" }),
      async execute(args, exec) {
        const watchId = requireString(args, "watchId");
        const watch = state.watchers.get(watchId);
        if (!watch) throw new Error("watch not found: " + watchId);
        if (!isInside(rootFor(state, exec), watch.filePath)) throw new Error("watch belongs to another workspace");
        const stopped = state.watchers.stop(watchId);
        if (!stopped) throw new Error("watch not found: " + watchId);
        return { ok: true, watch: stopped };
      },
    },
  ];
}