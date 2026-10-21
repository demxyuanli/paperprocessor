import { promises as fs } from "node:fs";
import path from "node:path";

import { sha256 } from "./util.js";

let sequence = 0;

async function hashFile(filePath) {
  return sha256(await fs.readFile(filePath));
}

/**
 * Poll a DOCX written by paper_export and coalesce Word saves into checkpoints.
 *
 * Word users save constantly. A save is therefore only marked pending; the
 * pending DOCX is imported when either:
 *   - syncMode is "idle" and the file has been quiet for idleMs (default 5 min),
 *   - syncMode is "immediate" (the old behavior), or
 *   - sync() is called explicitly (paper_sync_docx / /paper sync).
 *
 * Importing never writes back to the DOCX, so there is no export/import loop.
 */
export class DocxWatchManager {
  constructor({ logger, intervalMs = 1000, stableMs = 1500 } = {}) {
    this.logger = logger;
    this.intervalMs = intervalMs;
    this.stableMs = stableMs;
    this.watches = new Map();
  }

  async start({ store, docId, filePath, baseVersion = null, syncMode = "idle", idleMs = 300000 }) {
    const absolute = path.resolve(filePath);
    for (const [id, existing] of [...this.watches.entries()]) {
      if (existing.docId === docId || existing.filePath === absolute) this.stop(id);
    }
    const mode = syncMode === "manual" || syncMode === "immediate" ? syncMode : "idle";
    const quietMs = Number.isFinite(Number(idleMs)) && Number(idleMs) >= 0 ? Number(idleMs) : 300000;
    const stat = await fs.stat(absolute);
    const hash = await hashFile(absolute);
    const id = "word-" + Date.now().toString(36) + "-" + (++sequence);
    const entry = {
      id,
      store,
      docId,
      filePath: absolute,
      baseVersion: Number.isInteger(baseVersion) && baseVersion > 0 ? baseVersion : null,
      syncMode: mode,
      idleMs: quietMs,
      lastHash: hash,
      lastMtime: stat.mtimeMs,
      lastSize: stat.size,
      pending: false,
      pendingAt: 0,
      pendingHash: null,
      pendingStatMtime: null,
      pendingStatSize: null,
      pendingMtime: null,
      pendingSize: null,
      pendingSince: 0,
      status: "watching",
      lastVersion: null,
      lastError: "",
      updatedAt: new Date().toISOString(),
      busy: false,
      timer: null,
    };
    entry.timer = setInterval(() => {
      this.pollOnce(id).catch((error) => {
        entry.status = "error";
        entry.lastError = error && error.message ? error.message : String(error);
      });
    }, this.intervalMs);
    if (typeof entry.timer.unref === "function") entry.timer.unref();
    this.watches.set(id, entry);
    if (this.logger && typeof this.logger.info === "function") {
      this.logger.info("[dsh-paper] watching Word file " + absolute + " for " + docId + " (" + mode + ")");
    }
    return this.serialize(entry);
  }

  list() {
    return [...this.watches.values()].map((entry) => this.serialize(entry));
  }

  get(id) {
    const entry = this.watches.get(id);
    return entry ? this.serialize(entry) : null;
  }

  findForDoc(docId) {
    for (const entry of this.watches.values()) {
      if (entry.docId === docId) return this.serialize(entry);
    }
    return null;
  }

  stop(id) {
    const entry = this.watches.get(id);
    if (!entry) return null;
    if (entry.timer) clearInterval(entry.timer);
    entry.status = "stopped";
    entry.updatedAt = new Date().toISOString();
    this.watches.delete(id);
    return this.serialize(entry);
  }

  stopAll() {
    for (const id of [...this.watches.keys()]) this.stop(id);
  }

  serialize(entry) {
    const pendingForMs = entry.pending ? Math.max(0, Date.now() - entry.pendingAt) : 0;
    return {
      id: entry.id,
      docId: entry.docId,
      filePath: entry.filePath,
      baseVersion: entry.baseVersion === null ? 0 : entry.baseVersion,
      syncMode: entry.syncMode,
      idleMs: entry.idleMs,
      pending: Boolean(entry.pending),
      pendingForMs,
      status: entry.status,
      lastVersion: entry.lastVersion === null ? 0 : entry.lastVersion,
      lastError: entry.lastError,
      updatedAt: entry.updatedAt,
    };
  }

  /** Force the pending DOCX (if any) into a version now. */
  async sync(id, { message } = {}) {
    const entry = this.watches.get(id);
    if (!entry) throw new Error("watch not found: " + id);
    if (entry.busy) return this.serialize(entry);
    if (!entry.pending) return this.serialize(entry);
    return this._commitEntry(entry, message);
  }

  async _commitEntry(entry, message) {
    entry.busy = true;
    entry.status = "importing";
    entry.updatedAt = new Date().toISOString();
    const commitHash = entry.pendingHash || entry.lastHash;
    const commitMtime = entry.pendingStatMtime ?? entry.lastMtime;
    const commitSize = entry.pendingStatSize ?? entry.lastSize;
    try {
      const result = await entry.store.importDocx({
        docId: entry.docId,
        filePath: entry.filePath,
        confirm: true,
        baseVersion: entry.baseVersion,
        message: message || "Sync Word edits: " + path.basename(entry.filePath),
      });
      entry.pending = false;
      entry.pendingAt = 0;
      entry.pendingMtime = null;
      entry.pendingSize = null;
      entry.pendingHash = null;
      entry.pendingStatMtime = null;
      entry.pendingStatSize = null;
      entry.lastHash = commitHash;
      entry.lastMtime = commitMtime;
      entry.lastSize = commitSize;
      entry.status = "watching";
      entry.lastError = "";
      entry.lastVersion = result.version;
      entry.baseVersion = result.version;
      entry.updatedAt = new Date().toISOString();
      if (this.logger && typeof this.logger.info === "function") {
        this.logger.info("[dsh-paper] synced Word edits into " + entry.docId + " " + (result.versionId || ""));
      }
    } catch (error) {
      const text = error && error.message ? error.message : String(error);
      entry.lastError = text;
      entry.status = /based on|advanced|conflict/i.test(text) ? "conflict" : "error";
      entry.pending = false;
      entry.pendingAt = 0;
      entry.pendingMtime = null;
      entry.pendingSize = null;
      entry.pendingHash = null;
      entry.pendingStatMtime = null;
      entry.pendingStatSize = null;
      entry.lastHash = commitHash;
      entry.lastMtime = commitMtime;
      entry.lastSize = commitSize;
      entry.updatedAt = new Date().toISOString();
      if (this.logger && typeof this.logger.warn === "function") {
        this.logger.warn("[dsh-paper] Word sync failed for " + entry.docId + ": " + text);
      }
    } finally {
      entry.busy = false;
    }
    return this.serialize(entry);
  }

  async pollOnce(id) {
    const entry = this.watches.get(id);
    if (!entry || entry.status === "stopped" || entry.busy) {
      return entry ? this.serialize(entry) : null;
    }
    const now = Date.now();
    if (entry.pending && entry.syncMode === "idle" && now - entry.pendingAt >= entry.idleMs) {
      return this._commitEntry(entry);
    }
    let stat;
    try {
      stat = await fs.stat(entry.filePath);
    } catch (error) {
      entry.status = "error";
      entry.lastError = "cannot stat Word file: " + (error && error.message ? error.message : String(error));
      entry.updatedAt = new Date().toISOString();
      return this.serialize(entry);
    }
    if (stat.mtimeMs === entry.lastMtime && stat.size === entry.lastSize) {
      return this.serialize(entry);
    }
    if (entry.pendingMtime !== stat.mtimeMs || entry.pendingSize !== stat.size) {
      entry.pendingMtime = stat.mtimeMs;
      entry.pendingSize = stat.size;
      entry.pendingSince = now;
      if (this.stableMs > 0) return this.serialize(entry);
    } else if (now - entry.pendingSince < this.stableMs) {
      return this.serialize(entry);
    }
    let hash;
    try {
      hash = await hashFile(entry.filePath);
    } catch (error) {
      // Word may still hold a lock while replacing the file; retry next poll.
      return this.serialize(entry);
    }
    if (hash === entry.lastHash) {
      entry.lastMtime = stat.mtimeMs;
      entry.lastSize = stat.size;
      entry.pendingMtime = null;
      entry.pendingSize = null;
      return this.serialize(entry);
    }

    entry.lastHash = hash;
    entry.lastMtime = stat.mtimeMs;
    entry.lastSize = stat.size;
    entry.pending = true;
    entry.pendingAt = now;
    entry.pendingHash = hash;
    entry.pendingStatMtime = stat.mtimeMs;
    entry.pendingStatSize = stat.size;
    entry.pendingMtime = null;
    entry.pendingSize = null;
    entry.status = "pending";
    entry.lastError = "";
    entry.updatedAt = new Date().toISOString();
    if (entry.syncMode === "immediate" || (entry.syncMode === "idle" && entry.idleMs === 0)) {
      return this._commitEntry(entry);
    }
    return this.serialize(entry);
  }
}
