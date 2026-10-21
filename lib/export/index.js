import { promises as fs } from "node:fs";
import path from "node:path";

import { nowIso, writeFileAtomic, writeJsonAtomic } from "../util.js";
import { renderHtml } from "./html.js";
import { renderDocx } from "./docx.js";
import { renderPdf } from "./pdf.js";

const ALL_FORMATS = ["html", "docx", "pdf"];

export function normalizeFormats(formats) {
  if (formats === undefined || formats === null) return ALL_FORMATS.slice();
  const list = Array.isArray(formats) ? formats : [formats];
  const out = [];
  for (const raw of list) {
    const value = String(raw).trim().toLowerCase();
    if (value === "all") return ALL_FORMATS.slice();
    if (!ALL_FORMATS.includes(value)) throw new Error("unknown export format \"" + raw + "\"; use html, docx, pdf or all");
    if (!out.includes(value)) out.push(value);
  }
  if (out.length === 0) throw new Error("at least one export format is required");
  return out;
}

/** Render one immutable paper version into every requested publication format. */
export async function exportPaper({ root, docId, paperDir, config, meta, content, formats }) {
  const selected = normalizeFormats(formats);
  const dir = path.join(root, config.exportsDir, docId, meta.id);
  await fs.mkdir(dir, { recursive: true });
  const fileBase = docId + "-" + meta.id;
  const warnings = [];
  const files = [];
  let htmlPath = null;
  const needHtml = selected.includes("html") || selected.includes("pdf");
  if (needHtml) {
    try {
      const rendered = await renderHtml({ docId, versionMeta: meta, content, root, baseDir: paperDir, config: config.export });
      htmlPath = path.join(dir, fileBase + ".html");
      await writeFileAtomic(htmlPath, rendered.html);
      warnings.push(...rendered.warnings);
      if (selected.includes("html")) {
        files.push({ format: "html", ok: true, path: htmlPath, bytes: Buffer.byteLength(rendered.html, "utf8") });
      }
    } catch (error) {
      const message = "HTML render failed: " + error.message;
      warnings.push(message);
      if (selected.includes("html")) files.push({ format: "html", ok: false, path: null, bytes: 0, error: message });
    }
  }
  if (selected.includes("docx")) {
    try {
      const rendered = await renderDocx({ docId, versionMeta: meta, content, root, baseDir: paperDir, config: config.export });
      const file = path.join(dir, fileBase + ".docx");
      await writeFileAtomic(file, rendered.buffer);
      warnings.push(...rendered.warnings);
      files.push({ format: "docx", ok: true, path: file, bytes: rendered.buffer.length });
    } catch (error) {
      files.push({ format: "docx", ok: false, path: null, bytes: 0, error: "DOCX render failed: " + error.message });
    }
  }
  if (selected.includes("pdf")) {
    if (!htmlPath) {
      files.push({ format: "pdf", ok: false, path: null, bytes: 0, error: "PDF needs the HTML render, which failed" });
    } else {
      const file = path.join(dir, fileBase + ".pdf");
      try {
        const rendered = await renderPdf({ htmlPath, pdfPath: file, config: config.export, warnings });
        if (rendered.ok) files.push({ format: "pdf", ok: true, path: file, bytes: rendered.bytes, browser: rendered.browser });
        else files.push({ format: "pdf", ok: false, path: null, bytes: 0, error: rendered.error, stderr: rendered.stderr ?? null });
      } catch (error) {
        files.push({ format: "pdf", ok: false, path: null, bytes: 0, error: "PDF export failed: " + error.message });
      }
    }
  }
  const manifest = {
    schemaVersion: 1,
    docId,
    version: meta.version,
    versionId: meta.id,
    sha256: meta.sha256,
    versionCreatedAt: meta.createdAt,
    generatedAt: nowIso(),
    formats: selected,
    files: files.map((file) => ({ format: file.format, ok: file.ok, name: file.path ? path.basename(file.path) : null, bytes: file.bytes, error: file.error ?? null })),
  };
  await writeJsonAtomic(path.join(dir, "manifest.json"), manifest);
  return {
    dir,
    version: meta,
    files: files.map((file) => ({
      format: file.format,
      ok: file.ok,
      path: file.path,
      bytes: file.bytes,
      error: file.error ?? null,
    })),
    warnings,
  };
}
