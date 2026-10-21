import { createHash, randomBytes } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";

/** SHA-256 of a UTF-8 string, hex encoded. */
export function sha256(text) {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

/** Current time as an ISO string. */
export function nowIso() {
  return new Date().toISOString();
}

/** Read a UTF-8 file, returning null when it does not exist. */
export async function readTextIfExists(file) {
  try {
    return await fs.readFile(file, "utf8");
  } catch (error) {
    if (error && error.code === "ENOENT") return null;
    throw error;
  }
}

/** Read a JSON file, returning null when it does not exist. */
export async function readJsonIfExists(file) {
  const text = await readTextIfExists(file);
  if (text === null) return null;
  try {
    return JSON.parse(text);
  } catch (error) {
    throw new Error("cannot parse JSON at " + file + ": " + error.message);
  }
}

/**
 * Write a file atomically: write a sibling temp file, then rename it into place.
 * On Windows a rename over an existing file can fail, so the destination is
 * removed first in that one case only.
 */
export async function writeFileAtomic(file, data) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  const temp = file + ".tmp-" + process.pid + "-" + randomBytes(4).toString("hex");
  const handle = await fs.open(temp, "w");
  try {
    await handle.writeFile(data);
    await handle.sync();
  } finally {
    await handle.close();
  }
  try {
    await fs.rename(temp, file);
  } catch (error) {
    if (error && (error.code === "EEXIST" || error.code === "EPERM" || error.code === "EACCES")) {
      await fs.rm(file, { force: true });
      await fs.rename(temp, file);
    } else {
      await fs.rm(temp, { force: true });
      throw error;
    }
  }
}

/** Write a JSON file atomically with a trailing newline. */
export async function writeJsonAtomic(file, value) {
  await writeFileAtomic(file, JSON.stringify(value, null, 2) + "\n");
}

/** Slug for a title, keeping Unicode letters (including Chinese) and digits. */
export function slugifyTitle(title) {
  const normalized = String(title ?? "").normalize("NFKC").toLowerCase();
  const slug = normalized
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-")
    .slice(0, 48)
    .replace(/-+$/g, "");
  if (slug.length > 0) return slug;
  const stamp = new Date().toISOString().replace(/[-:T]/g, "").slice(0, 14);
  return "paper-" + stamp;
}

/** A document id is a single path segment of letters, digits, underscore or hyphen. */
export function validateDocId(docId) {
  if (typeof docId !== "string" || docId.length === 0) {
    throw new Error("a paper id is required");
  }
  if (docId.length > 64) throw new Error("paper id is longer than 64 characters: " + docId);
  if (!/^[\p{L}\p{N}][\p{L}\p{N}_-]*$/u.test(docId)) {
    throw new Error("invalid paper id \"" + docId + "\": use letters, digits, underscore or hyphen (no slashes, dots or spaces)");
  }
  if (docId === "." || docId === "..") throw new Error("invalid paper id: " + docId);
  return docId;
}

/** Whether candidate is root itself or lies below it at a path boundary. */
export function isInside(root, candidate) {
  const base = path.resolve(root);
  const target = path.resolve(candidate);
  const fold = process.platform === "win32" ? (value) => value.toLowerCase() : (value) => value;
  const a = fold(base);
  const b = fold(target);
  return b === a || b.startsWith(a.endsWith(path.sep) ? a : a + path.sep);
}

/** Short display form of a SHA-256 hash. */
export function shortHash(hash) {
  return typeof hash === "string" ? hash.slice(0, 12) : "";
}

/** Human-readable byte size. */
export function formatBytes(bytes) {
  if (!Number.isFinite(bytes) || bytes < 0) return "?";
  if (bytes < 1024) return bytes + " B";
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
  return (bytes / (1024 * 1024)).toFixed(1) + " MB";
}

/** Count CJK characters plus whitespace-delimited Latin words. */
export function wordCount(text) {
  const value = String(text ?? "");
  const cjk = (value.match(/[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]/g) ?? []).length;
  const latin = (value.replace(/[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]/g, " ").match(/[A-Za-z0-9][A-Za-z0-9'’-]*/g) ?? []).length;
  return cjk + latin;
}

/** Version number to v000001. */
export function versionLabel(version) {
  return "v" + String(version).padStart(6, "0");
}

/** Parse a version reference (3, "3", "v000003") to a positive integer. */
export function parseVersionRef(value) {
  if (typeof value === "number" && Number.isInteger(value) && value > 0) return value;
  if (typeof value === "string") {
    const match = /^(?:v)?(\d{1,9})$/i.exec(value.trim());
    if (match) {
      const parsed = Number(match[1]);
      if (Number.isInteger(parsed) && parsed > 0) return parsed;
    }
  }
  return null;
}
