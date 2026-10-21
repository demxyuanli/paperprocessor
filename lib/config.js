import path from "node:path";

export const DEFAULT_CONFIG = Object.freeze({
  papersDir: "papers",
  exportsDir: "exports",
  allowDirectWrites: false,
  autoAdoptExternal: true,
  maxPaperBytes: 4 * 1024 * 1024,
  maxDiffChars: 120000,
  startTurnCooldownMs: 5000,
  workspaceRoot: null,
  export: {
    html: { toc: true, numberSections: true },
    docx: { toc: true, bodyFont: "SimSun", headingFont: "Microsoft YaHei", codeFont: "Consolas" },
    pdf: { browserPath: null, timeoutMs: 120000 },
  },
});

function relativeDir(value, fallback, field) {
  const raw = typeof value === "string" && value.trim() !== "" ? value.trim() : fallback;
  if (path.isAbsolute(raw)) throw new Error(field + " must be a relative path, got " + raw);
  const normalized = path.normalize(raw);
  if (normalized === ".." || normalized.startsWith(".." + path.sep)) {
    throw new Error(field + " must stay inside the workspace, got " + raw);
  }
  return normalized;
}

function bool(value, fallback) {
  return typeof value === "boolean" ? value : fallback;
}

function positiveInt(value, fallback) {
  return Number.isInteger(value) && value > 0 ? value : fallback;
}

/** Merge the row config over the defaults, rejecting unsafe relative paths. */
export function resolveConfig(raw) {
  const input = raw !== null && typeof raw === "object" && !Array.isArray(raw) ? raw : {};
  const exportInput = input.export !== null && typeof input.export === "object" && !Array.isArray(input.export) ? input.export : {};
  const html = exportInput.html !== null && typeof exportInput.html === "object" ? exportInput.html : {};
  const docx = exportInput.docx !== null && typeof exportInput.docx === "object" ? exportInput.docx : {};
  const pdf = exportInput.pdf !== null && typeof exportInput.pdf === "object" ? exportInput.pdf : {};
  return {
    papersDir: relativeDir(input.papersDir, DEFAULT_CONFIG.papersDir, "papersDir"),
    exportsDir: relativeDir(input.exportsDir, DEFAULT_CONFIG.exportsDir, "exportsDir"),
    allowDirectWrites: bool(input.allowDirectWrites, DEFAULT_CONFIG.allowDirectWrites),
    autoAdoptExternal: bool(input.autoAdoptExternal, DEFAULT_CONFIG.autoAdoptExternal),
    maxPaperBytes: positiveInt(input.maxPaperBytes, DEFAULT_CONFIG.maxPaperBytes),
    maxDiffChars: positiveInt(input.maxDiffChars, DEFAULT_CONFIG.maxDiffChars),
    startTurnCooldownMs: positiveInt(input.startTurnCooldownMs, DEFAULT_CONFIG.startTurnCooldownMs),
    workspaceRoot: typeof input.workspaceRoot === "string" && input.workspaceRoot !== "" ? input.workspaceRoot : null,
    export: {
      html: {
        toc: bool(html.toc, DEFAULT_CONFIG.export.html.toc),
        numberSections: bool(html.numberSections, DEFAULT_CONFIG.export.html.numberSections),
      },
      docx: {
        toc: bool(docx.toc, DEFAULT_CONFIG.export.docx.toc),
        bodyFont: typeof docx.bodyFont === "string" && docx.bodyFont ? docx.bodyFont : DEFAULT_CONFIG.export.docx.bodyFont,
        headingFont: typeof docx.headingFont === "string" && docx.headingFont ? docx.headingFont : DEFAULT_CONFIG.export.docx.headingFont,
        codeFont: typeof docx.codeFont === "string" && docx.codeFont ? docx.codeFont : DEFAULT_CONFIG.export.docx.codeFont,
      },
      pdf: {
        browserPath: typeof pdf.browserPath === "string" && pdf.browserPath ? pdf.browserPath : null,
        timeoutMs: positiveInt(pdf.timeoutMs, DEFAULT_CONFIG.export.pdf.timeoutMs),
      },
    },
  };
}