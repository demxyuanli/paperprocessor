import { promises as fs } from "node:fs";
import path from "node:path";

import { sha256 } from "./util.js";

let sequence = 0;

async function hashFile(filePath) {
  return sha256(await fs.readFile(filePath));
}

/**
 * Poll a DOCX file written by paper_export. Word saves are not always atomic,
 * so a change must be stable for stableMs before it is imported. Auto-import
 * never writes back to the DOCX, which avoids a watch/export feedback loop.
 */
export class DocxWatchManager {
  constructor({ logger, intervalMs = 1000, stableMs = 1500 } = {}) {
    this.logger = logger;
    this.intervalMs = intervalMs;
    this.stableMs = stableMs;
    this.watches = new Map();
  }

  async start({ store, docId, filePath, baseVersion = null }) {
    const absolute = path.resolve(filePath);
    for (const [id, existing] of [...this.watches.entries()]) {
      if (existing.docId === docId || existing.filePath === absolute) this.stop(id);
    }
    const stat = await fs.stat(absolute);
    const hash = await hashFile(absolute);
    const id = "word-" + Date.now().toString(36) + "-" + (++sequence);
    const entry = {
      id,
      store,
      docId,
      filePath: absolute,
      baseVersion: Number.isInteger(baseVersion) && baseVersion > 0 ? baseVersion : null,
      lastHash: hash,
      lastMtime: stat.mtimeMs,
      lastSize: stat.size,
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
      this.logger.info("[dsh-paper] watching Word file " + absolute + " for " + docId);
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
    return {
      id: entry.id,
      docId: entry.docId,
      filePath: entry.filePath,
      baseVersion: entry.baseVersion === null ? 0 : entry.baseVersion,
      status: entry.status,
      lastVersion: entry.lastVersion === null ? 0 : entry.lastVersion,
      lastError: entry.lastError,
      updatedAt: entry.updatedAt,
    };
  }

  async pollOnce(id) {
    const entry = this.watches.get(id);
    if (!entry || entry.status === "stopped" || entry.busy) {
      return entry ? this.serialize(entry) : null;
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
      entry.pendingSince = Date.now();
      if (this.stableMs > 0) return this.serialize(entry);
    } else if (Date.now() - entry.pendingSince < this.stableMs) {
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
    entry.busy = true;
    entry.status = "importing";
    entry.updatedAt = new Date().toISOString();
    try {
      const result = await entry.store.importDocx({
        docId: entry.docId,
        filePath: entry.filePath,
        confirm: true,
        baseVersion: entry.baseVersion,
        message: "Auto import Word save: " + path.basename(entry.filePath),
      });
      entry.lastHash = hash;
      entry.lastMtime = stat.mtimeMs;
      entry.lastSize = stat.size;
      entry.pendingMtime = null;
      entry.pendingSize = null;
      entry.status = "watching";
      entry.lastError = "";
      entry.lastVersion = result.version;
      entry.baseVersion = result.version;
      entry.updatedAt = new Date().toISOString();
      if (this.logger && typeof this.logger.info === "function") {
        this.logger.info("[dsh-paper] imported Word save into " + entry.docId + " " + (result.versionId || ""));
      }
    } catch (error) {
      const message = error && error.message ? error.message : String(error);
      entry.lastError = message;
      entry.status = /based on|advanced|conflict/i.test(message) ? "conflict" : "error";
      // Do not retry the same bytes forever; the next Word save can retry.
      entry.lastHash = hash;
      entry.lastMtime = stat.mtimeMs;
      entry.lastSize = stat.size;
      entry.pendingMtime = null;
      entry.pendingSize = null;
      entry.updatedAt = new Date().toISOString();
      if (this.logger && typeof this.logger.warn === "function") {
        this.logger.warn("[dsh-paper] Word auto-import failed for " + entry.docId + ": " + message);
      }
    } finally {
      entry.busy = false;
    }
    return this.serialize(entry);
  }
}
