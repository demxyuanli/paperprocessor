import { promises as fs } from "node:fs";
import path from "node:path";

import { nowIso, parseVersionRef, readJsonIfExists, readTextIfExists, sha256, shortHash, slugifyTitle, validateDocId, versionLabel, wordCount, writeFileAtomic, writeJsonAtomic } from "./util.js";
import { firstHeading, splitFrontMatter, stringifyFrontMatter, titleOf, publicMeta } from "./frontmatter.js";
import { buildBranchContent, replaceTitle, sectionRows, selectSectionRanges } from "./markdown.js";
import { evaluateDraft, normalizeStage, stageLabel } from "./draft.js";
import { diffStats, unifiedDiff } from "./diff.js";
import { convertDocxToMarkdown } from "./import/docx.js";

function rel(root, file) {
  return path.relative(root, file).replace(/\\/g, "/");
}

/** Compare content semantically, ignoring the volatile updatedAt timestamp. */
function semanticContent(value) {
  const split = splitFrontMatter(value);
  const data = { ...split.data };
  delete data.updatedAt;
  delete data.createdAt;
  return JSON.stringify({ data, body: split.body.replace(/\s+$/, "") });
}

function localDayKey(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  const pad = (number) => String(number).padStart(2, "0");
  return date.getFullYear() + "-" + pad(date.getMonth() + 1) + "-" + pad(date.getDate());
}

function baseVersionFromDocx(filePath) {
  const name = path.basename(String(filePath || ""));
  const match = /(?:^|[-_])v(\d{6})(?=[-_.]|$)/i.exec(name) || /^v(\d{6})/i.exec(name);
  return match ? Number(match[1]) : null;
}

function requireMessage(message, fallback) {
  const text = typeof message === "string" ? message.trim() : "";
  if (text.length > 0) return text;
  if (fallback) return fallback;
  throw new Error("a non-empty change message is required: every version must say why it exists");
}

/**
 * One workspace's versioned paper library.
 *
 * The Markdown file is the readable source; every content change is snapshotted
 * under <papers>/.paper/versions/<docId>/. The registry and per-document history
 * are append-only for content: restore creates a new version rather than editing
 * an old one.
 */
export class PaperStore {
  constructor({ root, config, logger }) {
    this.root = path.resolve(root);
    this.config = config;
    this.logger = logger;
    this.papersRoot = path.join(this.root, config.papersDir);
    this.metaRoot = path.join(this.papersRoot, ".paper");
    this.registryPath = path.join(this.metaRoot, "registry.json");
    this.exportsRoot = path.join(this.root, config.exportsDir);
    this._lock = Promise.resolve();
  }

  _withLock(fn) {
    const previous = this._lock;
    let release;
    this._lock = new Promise((resolve) => { release = resolve; });
    return previous.then(async () => {
      try {
        return await fn();
      } finally {
        release();
      }
    });
  }

  docPath(docId) {
    validateDocId(docId);
    return path.join(this.papersRoot, docId, docId + ".md");
  }

  legacyDocPath(docId) {
    validateDocId(docId);
    return path.join(this.papersRoot, docId, "paper.md");
  }

  /** Rename the old fixed paper.md entry to <docId>.md on first access. */
  async _ensureEntry(docId) {
    const preferred = this.docPath(docId);
    const legacy = this.legacyDocPath(docId);
    if (await readTextIfExists(preferred) === null && await readTextIfExists(legacy) !== null) {
      await fs.rename(legacy, preferred);
    }
    return preferred;
  }

  historyPath(docId) {
    return path.join(this.metaRoot, "versions", docId, "history.json");
  }

  versionDir(docId) {
    return path.join(this.metaRoot, "versions", docId);
  }

  exportDir(docId, versionId) {
    return path.join(this.exportsRoot, docId, versionId);
  }

  async loadRegistry() {
    const data = await readJsonIfExists(this.registryPath);
    if (data === null) return { schemaVersion: 1, updatedAt: nowIso(), papers: {} };
    if (data === null || typeof data !== "object" || Array.isArray(data)) {
      throw new Error("paper registry is not a JSON object: " + this.registryPath);
    }
    if (data.papers === undefined) data.papers = {};
    if (data.papers === null || typeof data.papers !== "object" || Array.isArray(data.papers)) {
      throw new Error("paper registry .papers is not an object: " + this.registryPath);
    }
    return data;
  }

  async saveRegistry(registry) {
    registry.schemaVersion = 1;
    registry.updatedAt = nowIso();
    await writeJsonAtomic(this.registryPath, registry);
  }

  async readHistory(docId) {
    const data = await readJsonIfExists(this.historyPath(docId));
    if (data === null) return [];
    if (!data || !Array.isArray(data.versions)) {
      throw new Error("paper history is malformed: " + this.historyPath(docId));
    }
    return data.versions;
  }

  async writeHistory(docId, versions) {
    await writeJsonAtomic(this.historyPath(docId), {
      schemaVersion: 1,
      docId,
      updatedAt: nowIso(),
      versions,
    });
  }

  _newRecord(docId, content, options = {}) {
    const split = splitFrontMatter(content);
    const title = String(options.title || "").trim() || titleOf(split.data, split.body, "Untitled paper");
    return {
      docId,
      title,
      path: rel(this.root, this.docPath(docId)),
      status: typeof split.data.status === "string" && split.data.status ? split.data.status : (options.status || "draft"),
      stage: normalizeStage(split.data.stage || options.stage || "idea"),
      targetWords: Number(split.data.targetWords || options.targetWords) || 0,
      question: typeof split.data.question === "string" ? split.data.question : (options.question || ""),
      audience: typeof split.data.audience === "string" ? split.data.audience : (options.audience || ""),
      contribution: typeof split.data.contribution === "string" ? split.data.contribution : (options.contribution || ""),
      nextAction: typeof split.data.nextAction === "string" ? split.data.nextAction : (options.nextAction || ""),
      deadline: typeof split.data.deadline === "string" ? split.data.deadline : (options.deadline || ""),
      createdAt: options.createdAt || nowIso(),
      updatedAt: nowIso(),
      currentVersion: 0,
      versionCount: 0,
      latest: null,
      lineage: {
        parents: Array.isArray(options.parents) ? options.parents : [],
        children: [],
      },
      derivedFrom: options.derivedFrom || null,
      exports: [],
    };
  }

  async _contextLocked(registry, docId) {
    validateDocId(docId);
    const file = await this._ensureEntry(docId);
    const content = await readTextIfExists(file);
    let record = registry.papers[docId];
    if (!record) {
      if (content === null) {
        throw new Error("paper \"" + docId + "\" was not found under " + this.papersRoot + "; create it with paper_new");
      }
      record = this._newRecord(docId, content);
      registry.papers[docId] = record;
    }
    if (content === null) {
      throw new Error("paper source is missing: " + file + "; restore it from .paper/versions or remove the registry entry");
    }
    const history = await this.readHistory(docId);
    return { registry, record, history, content, file };
  }

  async _adoptLocked(context, options = {}) {
    const hash = sha256(context.content);
    const latest = context.history[context.history.length - 1];
    if (latest && latest.sha256 === hash) return { adopted: false, drift: false };
    if (!this.config.autoAdoptExternal) {
      if (options.strict) {
        throw new Error("the paper entry file changed outside the paper_* tools; enable autoAdoptExternal or write through paper_write/paper_edit");
      }
      return { adopted: false, drift: true };
    }
    const result = await this._commitLocked(context, context.content, {
      message: latest ? "Adopt external change (written outside paper_* tools)" : "Initial import of an existing paper entry file",
      source: "external",
    });
    return { adopted: result.changed, drift: false, version: result.version };
  }

  async _commitLocked(context, content, options) {
    const normalized = String(content).replace(/\s+$/, "") + "\n";
    const bytes = Buffer.byteLength(normalized, "utf8");
    if (bytes > this.config.maxPaperBytes) {
      throw new Error("paper is larger than maxPaperBytes (" + this.config.maxPaperBytes + " bytes)");
    }
    const hash = sha256(normalized);
    const history = context.history;
    const latest = history[history.length - 1];
    if (latest && latest.sha256 === hash) {
      context.content = normalized;
      return { changed: false, version: latest };
    }
    if (latest) {
      const previousContent = await this._readVersionContent(latest);
      if (semanticContent(previousContent) === semanticContent(normalized)) {
        return { changed: false, version: latest };
      }
    }
    const version = latest ? latest.version + 1 : 1;
    const id = versionLabel(version);
    const dir = this.versionDir(context.record.docId);
    const contentPath = path.join(dir, id + ".md");
    const metaPath = path.join(dir, id + ".json");
    const split = splitFrontMatter(normalized);
    const meta = {
      schemaVersion: 1,
      docId: context.record.docId,
      version,
      id,
      createdAt: nowIso(),
      message: requireMessage(options.message),
      source: options.source || "paper_write",
      sha256: hash,
      bytes,
      previous: latest ? latest.version : null,
      content: rel(this.metaRoot, contentPath),
      title: titleOf(split.data, split.body, context.record.title),
      parents: Array.isArray(options.parents) ? options.parents : (context.record.lineage?.parents ?? []),
      derivedFrom: options.derivedFrom ?? context.record.derivedFrom ?? null,
    };
    await writeFileAtomic(contentPath, normalized);
    await writeJsonAtomic(metaPath, meta);
    history.push(meta);
    await this.writeHistory(context.record.docId, history);
    await writeFileAtomic(context.file, normalized);
    context.record.title = meta.title;
    context.record.status = typeof split.data.status === "string" && split.data.status ? split.data.status : context.record.status;
    context.record.stage = normalizeStage(split.data.stage || context.record.stage);
    context.record.targetWords = Number(split.data.targetWords || context.record.targetWords) || 0;
    context.record.question = typeof split.data.question === "string" ? split.data.question : (context.record.question || "");
    context.record.audience = typeof split.data.audience === "string" ? split.data.audience : (context.record.audience || "");
    context.record.contribution = typeof split.data.contribution === "string" ? split.data.contribution : (context.record.contribution || "");
    context.record.nextAction = typeof split.data.nextAction === "string" ? split.data.nextAction : (context.record.nextAction || "");
    context.record.deadline = typeof split.data.deadline === "string" ? split.data.deadline : (context.record.deadline || "");
    context.record.updatedAt = meta.createdAt;
    context.record.currentVersion = version;
    context.record.versionCount = history.length;
    context.record.latest = {
      version,
      id,
      sha256: hash,
      message: meta.message,
      createdAt: meta.createdAt,
      source: meta.source,
    };
    context.content = normalized;
    return { changed: true, version: meta };
  }

  _normalizeContent(record, content, options = {}) {
    const split = splitFrontMatter(content);
    const data = { ...split.data };
    data.paper = record.docId;
    if (typeof options.title === "string" && options.title.trim() !== "") data.title = options.title.trim();
    if (!data.title) data.title = record.title || "Untitled paper";
    if (typeof options.status === "string" && options.status.trim() !== "") data.status = options.status.trim();
    if (!data.status) data.status = record.status || "draft";
    if (typeof options.stage === "string" && options.stage.trim() !== "") data.stage = normalizeStage(options.stage);
    if (!data.stage) data.stage = normalizeStage(record.stage || "idea");
    if (data.targetWords !== undefined) {
      const target = Number(data.targetWords);
      if (Number.isInteger(target) && target > 0) data.targetWords = target;
      else delete data.targetWords;
    }
    if (options.targetWords !== undefined) {
      const target = Number(options.targetWords);
      if (Number.isInteger(target) && target > 0) data.targetWords = target;
      else delete data.targetWords;
    }
    if (options.targetWords === undefined && data.targetWords === undefined && record.targetWords) {
      data.targetWords = record.targetWords;
    }
    for (const key of ["question", "audience", "contribution", "nextAction", "deadline"]) {
      if (options[key] !== undefined) {
        const value = typeof options[key] === "string" ? options[key].trim() : "";
        if (value !== "") data[key] = value;
        else delete data[key];
      } else if (!data[key] && record[key]) {
        data[key] = record[key];
      }
    }
    data.createdAt = data.createdAt || record.createdAt || nowIso();
    data.updatedAt = nowIso();
    delete data.version;
    let body = split.body;
    if (!options.title) {
      const h1 = firstHeading(body);
      if (h1) data.title = h1;
    }
    const currentTitle = firstHeading(body);
    if (options.title && currentTitle && currentTitle !== data.title) {
      body = replaceTitle(body, data.title);
    }
    if (!firstHeading(body)) body = "# " + data.title + "\n\n" + body;
    const normalized = stringifyFrontMatter(data, body);
    if (Buffer.byteLength(normalized, "utf8") > this.config.maxPaperBytes) {
      throw new Error("paper is larger than maxPaperBytes (" + this.config.maxPaperBytes + " bytes)");
    }
    return normalized;
  }

  async create({ docId, title, content, message, stage, targetWords, question, audience, contribution, nextAction, deadline }) {
    return this._withLock(async () => {
      validateDocId(docId);
      const registry = await this.loadRegistry();
      if (registry.papers[docId]) throw new Error("paper \"" + docId + "\" already exists");
      const file = this.docPath(docId);
      if (await readTextIfExists(file) !== null || await readTextIfExists(this.legacyDocPath(docId)) !== null) {
        throw new Error("a paper entry file already exists for \"" + docId + "\"; register it by reading it or choose another id");
      }
      const body = typeof content === "string" && content.trim() !== ""
        ? content
        : "# " + (title || docId) + "\n\n## Abstract\n\n## 1. Introduction\n";
      const record = this._newRecord(docId, body, {
        title: title || titleOf(splitFrontMatter(body).data, splitFrontMatter(body).body, docId),
        stage,
        targetWords,
        question,
        nextAction,
        deadline,
      });
      registry.papers[docId] = record;
      const normalized = this._normalizeContent(record, body, {
        title: title || record.title,
        stage,
        targetWords,
        question,
        audience,
        contribution,
        nextAction,
        deadline,
      });
      const context = { registry, record, history: [], content: normalized, file };
      const result = await this._commitLocked(context, normalized, {
        message: requireMessage(message, "Create paper " + docId),
        source: "paper_new",
      });
      await this.saveRegistry(registry);
      return { docId, record, version: result.version, changed: result.changed };
    });
  }

  async ensureCurrent(docId, options = {}) {
    return this._withLock(async () => {
      const registry = await this.loadRegistry();
      const context = await this._contextLocked(registry, docId);
      const adopt = await this._adoptLocked(context, options);
      if (adopt.adopted) await this.saveRegistry(registry);
      return { record: context.record, history: context.history, content: context.content, adopted: adopt.adopted, drift: adopt.drift };
    });
  }

  async read({ docId, version, brief, section }) {
    return this._withLock(async () => {
      const registry = await this.loadRegistry();
      const context = await this._contextLocked(registry, docId);
      const adopt = await this._adoptLocked(context, { strict: false });
      if (adopt.adopted) await this.saveRegistry(registry);
      let content = context.content;
      let meta = context.history[context.history.length - 1] ?? null;
      if (version !== undefined && version !== null && version !== "latest") {
        const target = this._resolveVersion(context.history, version);
        content = await this._readVersionContent(target);
        meta = target;
      }
      const split = splitFrontMatter(content);
      let body = split.body;
      if (typeof section === "string" && section.trim() !== "") {
        const parsed = parseSectionsForRead(body, section);
        body = parsed;
      }
      const headings = sectionRows(split.body);
      return {
        docId,
        title: titleOf(split.data, split.body, context.record.title),
        version: meta ? meta.version : 0,
        versionId: meta ? meta.id : null,
        sha256: sha256(content),
        bytes: Buffer.byteLength(content, "utf8"),
        words: wordCount(split.body),
        body: brief ? "" : body,
        meta: publicMeta(split.data),
        headings,
        adopted: adopt.adopted,
        drift: adopt.drift,
      };
    });
  }

  async write({ docId, content, message, title, status }) {
    return this._withLock(async () => {
      const registry = await this.loadRegistry();
      const context = await this._contextLocked(registry, docId);
      const adopt = await this._adoptLocked(context, { strict: true });
      const normalized = this._normalizeContent(context.record, content, { title, status });
      if (sha256(normalized) === sha256(context.content)) {
        if (adopt.adopted) await this.saveRegistry(registry);
        return { docId, changed: false, version: context.history[context.history.length - 1], record: context.record, adopted: adopt.adopted };
      }
      const result = await this._commitLocked(context, normalized, {
        message: requireMessage(message),
        source: "paper_write",
      });
      await this.saveRegistry(registry);
      return { docId, changed: result.changed, version: result.version, record: context.record, adopted: adopt.adopted };
    });
  }

  async edit({ docId, replacements, message }) {
    if (!Array.isArray(replacements) || replacements.length === 0) {
      throw new Error("replacements must be a non-empty array of { oldText, newText }");
    }
    return this._withLock(async () => {
      const registry = await this.loadRegistry();
      const context = await this._contextLocked(registry, docId);
      const adopt = await this._adoptLocked(context, { strict: true });
      const split = splitFrontMatter(context.content);
      let body = split.body;
      let applied = 0;
      for (let index = 0; index < replacements.length; index += 1) {
        const item = replacements[index];
        const oldText = item && typeof item.oldText === "string" ? item.oldText : "";
        const newText = item && typeof item.newText === "string" ? item.newText : "";
        if (oldText === "") throw new Error("replacements[" + index + "].oldText must be a non-empty string");
        if (!body.includes(oldText)) {
          throw new Error("replacements[" + index + "] did not match: " + JSON.stringify(oldText.slice(0, 80)));
        }
        body = item.all === true ? body.split(oldText).join(newText) : body.replace(oldText, () => newText);
        applied += 1;
      }
      const next = stringifyFrontMatter(split.data, body);
      const normalized = this._normalizeContent(context.record, next, {});
      const result = await this._commitLocked(context, normalized, {
        message: requireMessage(message),
        source: "paper_edit",
      });
      await this.saveRegistry(registry);
      return { docId, changed: result.changed, version: result.version, applied, record: context.record, adopted: adopt.adopted };
    });
  }

  async importDocx({ docId, filePath, message, confirm = false, force = false, baseVersion = null }) {
    return this._withLock(async () => {
      const registry = await this.loadRegistry();
      const context = await this._contextLocked(registry, docId);
      const adopt = await this._adoptLocked(context, { strict: true });
      const currentVersion = context.history.length > 0 ? context.history[context.history.length - 1].version : 0;
      const parsedBase = baseVersion === null || baseVersion === undefined || baseVersion === ""
        ? baseVersionFromDocx(filePath)
        : Number(baseVersion);
      const base = Number.isInteger(parsedBase) && parsedBase > 0 ? parsedBase : null;
      const conflict = base === null ? currentVersion > 0 : currentVersion > base;
      if (conflict && confirm && !force) {
        const reason = base === null
          ? "cannot infer a base version from the Word filename"
          : "Word file is based on " + versionLabel(base);
        throw new Error(reason + " but the paper is at " + versionLabel(currentVersion) + "; export a fresh DOCX or pass force=true after reviewing the diff");
      }
      const absolute = path.isAbsolute(String(filePath)) ? String(filePath) : path.resolve(this.root, String(filePath));
      const converted = await convertDocxToMarkdown({
        filePath: absolute,
        assetsDir: path.join(path.dirname(context.file), "assets"),
        assetPrefix: "assets",
        persistAssets: confirm,
        maxBytes: this.config.maxDocxBytes,
      });
      const currentBody = splitFrontMatter(context.content).body.trim();
      const nextBody = converted.markdown.trim();
      const patch = unifiedDiff(currentBody, nextBody, docId + "@current", docId + "@word");
      const stats = diffStats(currentBody, nextBody);
      const warnings = converted.warnings.slice();
      if (conflict) {
        warnings.push(base === null
          ? "无法从文件名识别 Word 的基础版本；当前论文是 " + versionLabel(currentVersion) + "，确认写入需要 force=true，请先核对 diff。"
          : "这个 Word 基于 " + versionLabel(base) + "，当前论文已经是 " + versionLabel(currentVersion) + "；确认写入前请核对 diff，或重新导出最新版本再编辑。");
      }
      if (adopt.adopted) warnings.push("写入前已先把外部改动采纳为一个版本。");
      const result = {
        docId,
        preview: !confirm,
        changed: currentBody !== nextBody,
        conflict,
        baseVersion: base,
        currentVersion,
        added: stats.added,
        removed: stats.removed,
        unchanged: stats.unchanged,
        patch: patch.slice(0, this.config.maxDiffChars),
        truncated: patch.length > this.config.maxDiffChars,
        warnings,
        images: converted.images,
        version: null,
        versionId: "",
        sha256: "",
      };
      if (!confirm) {
        if (adopt.adopted) await this.saveRegistry(registry);
        return result;
      }
      const normalized = this._normalizeContent(context.record, nextBody, {});
      const committed = await this._commitLocked(context, normalized, {
        message: requireMessage(message, "Import Word edits from " + path.basename(absolute)),
        source: "docx_import",
      });
      await this.saveRegistry(registry);
      return {
        ...result,
        preview: false,
        changed: committed.changed,
        version: committed.version ? committed.version.version : null,
        versionId: committed.version ? committed.version.id : "",
        sha256: committed.version ? committed.version.sha256 : "",
      };
    });
  }

  async restore({ docId, version, message }) {
    return this._withLock(async () => {
      const registry = await this.loadRegistry();
      const context = await this._contextLocked(registry, docId);
      const adopt = await this._adoptLocked(context, { strict: true });
      const target = this._resolveVersion(context.history, version);
      const content = await this._readVersionContent(target);
      const normalized = this._normalizeContent(context.record, content, {});
      const result = await this._commitLocked(context, normalized, {
        message: requireMessage(message, "Restore " + target.id + " from " + target.createdAt),
        source: "paper_restore",
      });
      await this.saveRegistry(registry);
      return { docId, restoredFrom: target, changed: result.changed, version: result.version, record: context.record, adopted: adopt.adopted };
    });
  }

  async history({ docId, limit }) {
    return this._withLock(async () => {
      const registry = await this.loadRegistry();
      const context = await this._contextLocked(registry, docId);
      const adopt = await this._adoptLocked(context, { strict: false });
      if (adopt.adopted) await this.saveRegistry(registry);
      const max = Number.isInteger(limit) && limit > 0 ? Math.min(limit, 200) : 30;
      const versions = context.history.slice().reverse().slice(0, max).map((meta) => ({
        version: meta.version,
        id: meta.id,
        createdAt: meta.createdAt,
        message: meta.message,
        source: meta.source,
        sha256: meta.sha256,
        shortSha: shortHash(meta.sha256),
        bytes: meta.bytes,
        title: meta.title,
        previous: meta.previous ?? 0,
      }));
      return { docId, title: context.record.title, currentVersion: context.record.currentVersion, versions, adopted: adopt.adopted };
    });
  }

  async diff({ docId, fromVersion, toVersion, includeFrontMatter }) {
    return this._withLock(async () => {
      const registry = await this.loadRegistry();
      const context = await this._contextLocked(registry, docId);
      const adopt = await this._adoptLocked(context, { strict: false });
      if (adopt.adopted) await this.saveRegistry(registry);
      const latest = context.history[context.history.length - 1];
      if (!latest) throw new Error("paper \"" + docId + "\" has no versions yet");
      const to = toVersion === undefined || toVersion === null ? latest : this._resolveVersion(context.history, toVersion);
      const previous = context.history.find((item) => item.version === to.version - 1);
      const from = fromVersion === undefined || fromVersion === null ? (previous || to) : this._resolveVersion(context.history, fromVersion);
      const beforeRaw = await this._readVersionContent(from);
      const afterRaw = await this._readVersionContent(to);
      const before = includeFrontMatter ? beforeRaw : splitFrontMatter(beforeRaw).body;
      const after = includeFrontMatter ? afterRaw : splitFrontMatter(afterRaw).body;
      let patch = unifiedDiff(before, after, docId + "@" + from.id, docId + "@" + to.id);
      let truncated = false;
      if (patch.length > this.config.maxDiffChars) {
        patch = patch.slice(0, this.config.maxDiffChars) + "\n... diff truncated at " + this.config.maxDiffChars + " characters ...\n";
        truncated = true;
      }
      return {
        docId,
        from: { version: from.version, id: from.id, message: from.message },
        to: { version: to.version, id: to.id, message: to.message },
        patch,
        truncated,
        ...diffStats(before, after),
      };
    });
  }



  /** Dashboard aggregates for the right-sidebar overview. */
  async insights({ days = 14, recentLimit = 12 } = {}) {
    return this._withLock(async () => {
      const scan = await this._scan();
      const totals = {
        papers: scan.papers.length,
        versions: 0,
        branches: 0,
        drift: 0,
        exports: 0,
        words: 0,
        targetWords: 0,
        active: 0,
        done: 0,
      };
      const statusCounts = { draft: 0, review: 0, published: 0, archived: 0, other: 0 };
      const stageCounts = { idea: 0, outline: 0, drafting: 0, revising: 0, done: 0, other: 0 };
      const activityMap = new Map();
      const recent = [];
      const topPapers = [];
      const drafting = [];
      const windowDays = Number.isInteger(days) && days > 0 ? Math.min(days, 90) : 14;
      for (const paper of scan.papers) {
        totals.versions += paper.versionCount;
        totals.exports += paper.exports;
        totals.words += paper.words;
        totals.targetWords += paper.targetWords || 0;
        if (paper.drift) totals.drift += 1;
        if ((paper.lineage?.parents?.length ?? 0) > 0) totals.branches += 1;
        const status = String(paper.status || "draft").toLowerCase();
        if (Object.prototype.hasOwnProperty.call(statusCounts, status)) statusCounts[status] += 1;
        else statusCounts.other += 1;
        const stage = String(paper.stage || "idea").toLowerCase();
        if (Object.prototype.hasOwnProperty.call(stageCounts, stage)) stageCounts[stage] += 1;
        else stageCounts.other += 1;
        if (stage === "done") totals.done += 1;
        else totals.active += 1;
        if (stage !== "done") {
          drafting.push({
            docId: paper.docId,
            title: paper.title,
            stage,
            stageLabel: paper.stageLabel,
            words: paper.words,
            targetWords: paper.targetWords || 0,
            progress: paper.draft?.progress ?? null,
            score: paper.draft?.score ?? 0,
            nextAction: paper.nextAction || "",
            deadline: paper.deadline || "",
            updatedAt: paper.updatedAt,
          });
        }
        const history = await this.readHistory(paper.docId);
        for (const meta of history) {
          const day = localDayKey(meta.createdAt);
          if (day !== null) activityMap.set(day, (activityMap.get(day) ?? 0) + 1);
          recent.push({
            docId: paper.docId,
            title: meta.title || paper.title,
            version: meta.version,
            versionId: meta.id,
            message: meta.message,
            source: meta.source,
            createdAt: meta.createdAt,
            shortSha: shortHash(meta.sha256),
          });
        }
        topPapers.push({
          docId: paper.docId,
          title: paper.title,
          status,
          stage,
          stageLabel: paper.stageLabel,
          versionCount: paper.versionCount,
          words: paper.words,
          targetWords: paper.targetWords || 0,
          progress: paper.draft?.progress ?? null,
          score: paper.draft?.score ?? 0,
          nextAction: paper.nextAction || "",
          drift: paper.drift,
          updatedAt: paper.updatedAt,
        });
      }
      recent.sort((left, right) => String(right.createdAt).localeCompare(String(left.createdAt)));
      topPapers.sort((left, right) => right.versionCount - left.versionCount || right.words - left.words);
      const stageOrder = { idea: 0, outline: 1, drafting: 2, revising: 3, done: 4 };
      drafting.sort((left, right) => (stageOrder[left.stage] ?? 9) - (stageOrder[right.stage] ?? 9) || String(right.updatedAt || "").localeCompare(String(left.updatedAt || "")));
      const activity = [];
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      for (let offset = windowDays - 1; offset >= 0; offset -= 1) {
        const date = new Date(today);
        date.setDate(today.getDate() - offset);
        const key = localDayKey(date);
        activity.push({ date: key, count: activityMap.get(key) ?? 0 });
      }
      return {
        generatedAt: nowIso(),
        days: windowDays,
        totals,
        statusCounts,
        stageCounts,
        activity,
        recent: recent.slice(0, Number.isInteger(recentLimit) && recentLimit > 0 ? Math.min(recentLimit, 50) : 12),
        topPapers: topPapers.slice(0, 8),
        drafting: drafting.slice(0, 20),
      };
    });
  }

  /** Change a paper's workflow status, producing a new version. */
  async setStatus({ docId, status, message }) {
    return this._withLock(async () => {
      const allowed = ["draft", "review", "published", "archived"];
      const nextStatus = String(status || "").toLowerCase();
      if (!allowed.includes(nextStatus)) {
        throw new Error("invalid status \"" + status + "\"; use draft, review, published or archived");
      }
      const registry = await this.loadRegistry();
      const context = await this._contextLocked(registry, docId);
      const adopt = await this._adoptLocked(context, { strict: true });
      const normalized = this._normalizeContent(context.record, context.content, { status: nextStatus });
      const result = await this._commitLocked(context, normalized, {
        message: requireMessage(message, "Set status to " + nextStatus),
        source: "paper_status",
      });
      await this.saveRegistry(registry);
      return { docId, changed: result.changed, version: result.version, record: context.record, adopted: adopt.adopted };
    });
  }

  /** Move a paper through the drafting stages, producing a new version. */
  async setStage({ docId, stage, nextAction, message }) {
    return this._withLock(async () => {
      const allowed = ["idea", "outline", "drafting", "revising", "done"];
      const nextStage = String(stage || "").trim().toLowerCase();
      if (!allowed.includes(nextStage)) {
        throw new Error("invalid stage \"" + stage + "\"; use idea, outline, drafting, revising or done");
      }
      const registry = await this.loadRegistry();
      const context = await this._contextLocked(registry, docId);
      const adopt = await this._adoptLocked(context, { strict: true });
      const normalized = this._normalizeContent(context.record, context.content, { stage: nextStage, nextAction });
      const result = await this._commitLocked(context, normalized, {
        message: requireMessage(message, "Move stage to " + stageLabel(nextStage)),
        source: "paper_stage",
      });
      await this.saveRegistry(registry);
      return { docId, stage: nextStage, changed: result.changed, version: result.version, record: context.record, adopted: adopt.adopted };
    });
  }

  /** Update the lightweight writing brief without touching the body. */
  async setBrief({ docId, message, stage, question, audience, contribution, targetWords, nextAction, deadline }) {
    return this._withLock(async () => {
      if (stage !== undefined && !["idea", "outline", "drafting", "revising", "done"].includes(String(stage).toLowerCase())) {
        throw new Error("invalid stage \"" + stage + "\"; use idea, outline, drafting, revising or done");
      }
      const registry = await this.loadRegistry();
      const context = await this._contextLocked(registry, docId);
      const adopt = await this._adoptLocked(context, { strict: true });
      const normalized = this._normalizeContent(context.record, context.content, { stage, question, audience, contribution, targetWords, nextAction, deadline });
      const result = await this._commitLocked(context, normalized, {
        message: requireMessage(message, "Update writing brief"),
        source: "paper_brief",
      });
      await this.saveRegistry(registry);
      return { docId, changed: result.changed, version: result.version, record: context.record, adopted: adopt.adopted };
    });
  }

  /** Advisory draft checklist for the "get it written" workflow. */
  async check({ docId }) {
    return this._withLock(async () => {
      const registry = await this.loadRegistry();
      const context = await this._contextLocked(registry, docId);
      const adopt = await this._adoptLocked(context, { strict: false });
      if (adopt.adopted) await this.saveRegistry(registry);
      const split = splitFrontMatter(context.content);
      const title = titleOf(split.data, split.body, context.record.title);
      const draft = evaluateDraft({ data: split.data, body: split.body, title });
      const latest = context.history[context.history.length - 1] ?? null;
      return {
        docId,
        title,
        version: latest ? latest.version : 0,
        versionId: latest ? latest.id : null,
        ...draft,
        adopted: adopt.adopted,
      };
    });
  }

  /** The version DAG for one paper's lineage family, oldest node first. */
  async graph({ docId }) {
    return this._withLock(async () => {
      const registry = await this.loadRegistry();
      const context = await this._contextLocked(registry, docId);
      const adopt = await this._adoptLocked(context, { strict: false });
      if (adopt.adopted) await this.saveRegistry(registry);
      const scan = await this._scan();
      const byId = new Map(scan.papers.map((paper) => [paper.docId, paper]));
      let root = byId.get(docId) ?? null;
      const visited = new Set();
      while (root && Array.isArray(root.lineage?.parents) && root.lineage.parents.length > 0 && !visited.has(root.docId)) {
        visited.add(root.docId);
        const parentId = root.lineage.parents[0]?.docId;
        const parent = parentId ? byId.get(parentId) : undefined;
        if (!parent) break;
        root = parent;
      }
      const rootId = root ? root.docId : docId;
      const children = new Map();
      for (const paper of scan.papers) {
        for (const parent of paper.lineage?.parents ?? []) {
          if (!parent || typeof parent.docId !== "string") continue;
          if (!children.has(parent.docId)) children.set(parent.docId, []);
          children.get(parent.docId).push(paper.docId);
        }
      }
      const familyIds = [];
      const seen = new Set();
      const queue = [rootId];
      for (let index = 0; index < queue.length; index += 1) {
        const id = queue[index];
        if (seen.has(id)) continue;
        seen.add(id);
        familyIds.push(id);
        for (const child of children.get(id) ?? []) queue.push(child);
      }
      if (!seen.has(docId)) familyIds.push(docId);
      const docs = familyIds.map((id, lane) => {
        const paper = byId.get(id);
        return {
          docId: id,
          title: paper ? paper.title : id,
          status: paper ? paper.status : "draft",
          currentVersion: paper ? paper.currentVersion : 0,
          lane,
        };
      });
      const nodes = [];
      const nodeIds = new Set();
      for (const doc of docs) {
        const history = await this.readHistory(doc.docId);
        for (const meta of history) {
          const id = doc.docId + "@" + meta.id;
          nodeIds.add(id);
          nodes.push({
            id,
            docId: doc.docId,
            docTitle: doc.title,
            version: meta.version,
            versionId: meta.id,
            title: meta.title,
            message: meta.message,
            source: meta.source,
            createdAt: meta.createdAt,
            sha256: meta.sha256,
            shortSha: shortHash(meta.sha256),
            bytes: meta.bytes,
            previous: meta.previous ?? 0,
            derivedFrom: meta.derivedFrom ?? null,
            lane: doc.lane,
          });
        }
      }
      nodes.sort((left, right) => String(left.createdAt).localeCompare(String(right.createdAt)) || left.docId.localeCompare(right.docId) || left.version - right.version);
      const edges = [];
      for (const node of nodes) {
        if (node.previous > 0) {
          const previousId = node.docId + "@" + versionLabel(node.previous);
          if (nodeIds.has(previousId)) edges.push({ from: previousId, to: node.id, kind: "previous" });
        }
        if (node.version === 1) {
          let lineage = node.derivedFrom;
          const paper = byId.get(node.docId);
          if ((!lineage || typeof lineage.docId !== "string") && paper) {
            const first = paper.lineage?.parents?.[0];
            if (first && typeof first.docId === "string") lineage = { docId: first.docId, version: first.version };
          }
          if (lineage && typeof lineage.docId === "string" && Number.isInteger(lineage.version)) {
            const parentId = lineage.docId + "@" + versionLabel(lineage.version);
            if (nodeIds.has(parentId)) edges.push({ from: parentId, to: node.id, kind: "branch" });
          }
        }
      }
      return {
        rootId,
        rootTitle: root ? root.title : docId,
        docs,
        nodes,
        edges,
        generatedAt: nowIso(),
      };
    });
  }

  /** Diff two versions, possibly from different papers (topic branches). */
  async compare({ fromDoc, toDoc, fromVersion, toVersion, includeFrontMatter }) {
    return this._withLock(async () => {
      const registry = await this.loadRegistry();
      const fromContext = await this._contextLocked(registry, fromDoc);
      const fromAdopt = await this._adoptLocked(fromContext, { strict: false });
      let toContext = fromContext;
      let toAdopt = fromAdopt;
      if (toDoc !== fromDoc) {
        toContext = await this._contextLocked(registry, toDoc);
        toAdopt = await this._adoptLocked(toContext, { strict: false });
      }
      if (fromAdopt.adopted || toAdopt.adopted) await this.saveRegistry(registry);
      const fromMeta = this._resolveVersion(fromContext.history, fromVersion);
      const toMeta = this._resolveVersion(toContext.history, toVersion);
      const fromRaw = await this._readVersionContent(fromMeta);
      const toRaw = await this._readVersionContent(toMeta);
      const before = includeFrontMatter ? fromRaw : splitFrontMatter(fromRaw).body;
      const after = includeFrontMatter ? toRaw : splitFrontMatter(toRaw).body;
      let patch = unifiedDiff(before, after, fromDoc + "@" + fromMeta.id, toDoc + "@" + toMeta.id);
      let truncated = false;
      if (patch.length > this.config.maxDiffChars) {
        patch = patch.slice(0, this.config.maxDiffChars) + "\n... diff truncated at " + this.config.maxDiffChars + " characters ...\n";
        truncated = true;
      }
      return {
        from: { docId: fromDoc, version: fromMeta.version, id: fromMeta.id, versionId: fromMeta.id, message: fromMeta.message },
        to: { docId: toDoc, version: toMeta.version, id: toMeta.id, versionId: toMeta.id, message: toMeta.message },
        patch,
        truncated,
        ...diffStats(before, after),
      };
    });
  }

  async branch({ from, fromVersion, mode, branches, message }) {
    return this._withLock(async () => {
      if (!Array.isArray(branches) || branches.length === 0) throw new Error("branches must be a non-empty array");
      if (branches.length > 20) throw new Error("at most 20 branches can be created in one call");
      const registry = await this.loadRegistry();
      const context = await this._contextLocked(registry, from);
      const adopt = await this._adoptLocked(context, { strict: true });
      const sourceMeta = fromVersion === undefined || fromVersion === null
        ? context.history[context.history.length - 1]
        : this._resolveVersion(context.history, fromVersion);
      const sourceContent = sourceMeta ? await this._readVersionContent(sourceMeta) : context.content;
      const sourceVersion = sourceMeta ? sourceMeta.version : 0;
      const prepared = [];
      for (const item of branches) {
        const title = item && typeof item.title === "string" ? item.title.trim() : "";
        if (title === "") throw new Error("every branch needs a non-empty title");
        const slug = item && typeof item.slug === "string" && item.slug.trim() !== "" ? item.slug.trim() : slugifyTitle(title);
        validateDocId(slug);
        if (registry.papers[slug] || await readTextIfExists(this.docPath(slug)) !== null) {
          throw new Error("cannot create branch \"" + slug + "\": that paper already exists");
        }
        const branchMode = item.mode === "full" || item.mode === "excerpt"
          ? item.mode
          : (mode === "full" || mode === "excerpt" ? mode : (Array.isArray(item.sections) && item.sections.length > 0 ? "excerpt" : "full"));
        const content = buildBranchContent({
          source: sourceContent,
          fromDocId: from,
          fromVersion: sourceVersion,
          slug,
          title,
          mode: branchMode,
          sections: item.sections,
          includeAbstract: item.includeAbstract,
        });
        prepared.push({ slug, title, mode: branchMode, sections: item.sections ?? [], includeAbstract: item.includeAbstract, content, message: item.message });
      }
      const created = [];
      const sourceDir = path.dirname(this.docPath(from));
      for (const item of prepared) {
        const targetDir = path.dirname(this.docPath(item.slug));
        // Branches are standalone papers: copy figures and other assets so
        // relative image paths keep working after the split.
        try {
          await fs.cp(sourceDir, targetDir, {
            recursive: true,
            force: false,
            errorOnExist: false,
            filter: (src) => {
              const name = path.basename(src).toLowerCase();
              const sourceEntry = String(from).toLowerCase() + ".md";
              return name !== "paper.md" && name !== sourceEntry && name !== ".paper";
            },
          });
        } catch (error) {
          await fs.rm(targetDir, { recursive: true, force: true }).catch(() => {});
          throw new Error('cannot copy assets for branch "' + item.slug + '": ' + error.message);
        }
        const parents = [{ docId: from, version: sourceVersion, relation: "branch", at: nowIso() }];
        const record = this._newRecord(item.slug, item.content, { title: item.title, parents });
        record.derivedFrom = { docId: from, version: sourceVersion };
        registry.papers[item.slug] = record;
        const normalized = this._normalizeContent(record, item.content, { title: item.title });
        const childContext = { registry, record, history: [], content: normalized, file: this.docPath(item.slug) };
        const result = await this._commitLocked(childContext, normalized, {
          message: requireMessage(item.message || message, "Branch \"" + item.title + "\" from " + from + " " + (sourceMeta ? sourceMeta.id : "current")),
          source: "paper_branch",
          parents,
          derivedFrom: { docId: from, version: sourceVersion },
        });
        const parent = registry.papers[from];
        if (parent) {
          parent.lineage = parent.lineage || { parents: [], children: [] };
          parent.lineage.children = Array.isArray(parent.lineage.children) ? parent.lineage.children : [];
          parent.lineage.children.push({ docId: item.slug, version: result.version.version, relation: "branch", at: nowIso() });
        }
        created.push({ docId: item.slug, title: item.title, mode: item.mode, sections: item.sections, version: result.version, record });
        await this.saveRegistry(registry);
      }
      await this.saveRegistry(registry);
      return { from, fromVersion: sourceVersion, created, adopted: adopt.adopted };
    });
  }

  _resolveVersion(history, reference) {
    if (!Array.isArray(history) || history.length === 0) {
      throw new Error("this paper has no versions yet");
    }
    const latest = history[history.length - 1];
    if (reference === undefined || reference === null || reference === "latest") return latest;
    const parsed = parseVersionRef(reference);
    if (parsed === null) {
      throw new Error("invalid version reference \"" + String(reference) + "\"; use latest or a number like 3");
    }
    const found = history.find((item) => item.version === parsed);
    if (!found) {
      throw new Error("version " + parsed + " does not exist; this paper has versions 1.." + latest.version);
    }
    return found;
  }

  async _readVersionContent(meta) {
    const file = path.join(this.metaRoot, meta.content);
    if (!file.startsWith(this.metaRoot + path.sep)) {
      throw new Error("version content path escapes the paper store: " + meta.content);
    }
    const content = await readTextIfExists(file);
    if (content === null) throw new Error("version content is missing: " + file);
    return content;
  }

  async _scan() {
    const registry = await this.loadRegistry();
    const ids = new Set(Object.keys(registry.papers));
    let entries = [];
    try {
      entries = await fs.readdir(this.papersRoot, { withFileTypes: true });
    } catch (error) {
      if (!error || error.code !== "ENOENT") throw error;
    }
    for (const entry of entries) {
      if (!entry.isDirectory() || entry.name === ".paper") continue;
      try { validateDocId(entry.name); } catch { continue; }
      if (await readTextIfExists(await this._ensureEntry(entry.name)) !== null) ids.add(entry.name);
    }
    const papers = [];
    for (const docId of ids) {
      try { validateDocId(docId); } catch { continue; }
      const record = registry.papers[docId] || null;
      const file = this.docPath(docId);
      const content = await readTextIfExists(file);
      const history = await this.readHistory(docId);
      const latest = history[history.length - 1] ?? null;
      const split = content === null ? { data: {}, body: "" } : splitFrontMatter(content);
      const hash = content === null ? null : sha256(content);
      const title = content === null ? (record?.title ?? docId) : titleOf(split.data, split.body, record?.title ?? docId);
      const draft = content === null ? null : evaluateDraft({ data: split.data, body: split.body, title });
      papers.push({
        docId,
        title,
        path: rel(this.root, file),
        registered: record !== null,
        missing: content === null,
        status: typeof split.data.status === "string" ? split.data.status : (record?.status ?? "draft"),
        stage: draft ? draft.stage : normalizeStage(record?.stage ?? split.data.stage),
        stageLabel: draft ? draft.stageLabel : stageLabel(record?.stage ?? split.data.stage),
        targetWords: draft ? draft.targetWords : 0,
        question: draft ? draft.question : "",
        nextAction: draft ? draft.nextAction : "",
        deadline: draft ? draft.deadline : "",
        draft,
        currentVersion: latest ? latest.version : 0,
        versionCount: history.length,
        drift: latest ? latest.sha256 !== hash : content !== null,
        latestMessage: latest ? latest.message : null,
        latestCreatedAt: latest ? latest.createdAt : null,
        updatedAt: record?.updatedAt ?? latest?.createdAt ?? null,
        lineage: record?.lineage ?? { parents: [], children: [] },
        derivedFrom: record?.derivedFrom ?? null,
        exports: Array.isArray(record?.exports) ? record.exports.length : 0,
        bytes: content === null ? 0 : Buffer.byteLength(content, "utf8"),
        words: content === null ? 0 : wordCount(split.body),
      });
    }
    papers.sort((a, b) => String(b.updatedAt ?? "").localeCompare(String(a.updatedAt ?? "")) || a.docId.localeCompare(b.docId));
    return { root: this.root, papersRoot: this.papersRoot, exportsRoot: this.exportsRoot, papers };
  }

  async list() {
    return this._scan();
  }

  async status() {
    return this._scan();
  }

  async readVersionForExport(docId, version) {
    return this._withLock(async () => {
      const registry = await this.loadRegistry();
      const context = await this._contextLocked(registry, docId);
      const adopt = await this._adoptLocked(context, { strict: false });
      if (adopt.adopted) await this.saveRegistry(registry);
      const meta = version === undefined || version === null || version === "latest"
        ? context.history[context.history.length - 1]
        : this._resolveVersion(context.history, version);
      if (!meta) throw new Error("paper \"" + docId + "\" has no versions yet");
      const content = await this._readVersionContent(meta);
      return { record: context.record, meta, content, registry, adopted: adopt.adopted };
    });
  }

  async recordExport(docId, entry) {
    return this._withLock(async () => {
      const registry = await this.loadRegistry();
      const record = registry.papers[docId];
      if (!record) return;
      record.exports = Array.isArray(record.exports) ? record.exports : [];
      record.exports = record.exports.filter((item) => !(item.version === entry.version && item.dir === entry.dir));
      record.exports.push(entry);
      if (record.exports.length > 50) record.exports = record.exports.slice(-50);
      await this.saveRegistry(registry);
    });
  }
}

/** Select a section's text for reading, with the same selector rules as branches. */
function parseSectionsForRead(body, selector) {
  const ranges = selectSectionRanges(body, [selector]);
  const lines = body.split(/\r?\n/);
  return ranges.map((range) => lines.slice(range.start, range.end).join("\n")).join("\n\n");
}