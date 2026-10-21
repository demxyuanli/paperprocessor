import YAML from "yaml";

const FRONT_MATTER = /^---[ \t]*\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/;

/** Split a Markdown document into YAML front matter and body. */
export function splitFrontMatter(source) {
  const text = String(source ?? "").replace(/^\uFEFF/, "");
  const match = FRONT_MATTER.exec(text);
  if (!match) return { data: {}, body: text, hasFrontMatter: false };
  let data;
  try {
    data = YAML.parse(match[1]);
  } catch (error) {
    throw new Error("invalid YAML front matter: " + error.message);
  }
  if (data === null || typeof data !== "object" || Array.isArray(data)) data = {};
  const body = text.slice(match[0].length).replace(/^\r?\n/, "");
  return { data, body, hasFrontMatter: true };
}

/** Render YAML front matter followed by the body. */
export function stringifyFrontMatter(data, body) {
  const clean = {};
  for (const [key, value] of Object.entries(data ?? {})) {
    if (value !== undefined) clean[key] = value;
  }
  const text = String(body ?? "").replace(/^\r?\n+/, "").replace(/\s+$/, "");
  if (Object.keys(clean).length === 0) return text + "\n";
  const yaml = YAML.stringify(clean, { lineWidth: 0, sortMapEntries: false }).trimEnd();
  return "---\n" + yaml + "\n---\n\n" + text + "\n";
}

/** The first H1 title in a Markdown body, if any. */
export function firstHeading(body) {
  const lines = String(body ?? "").split(/\r?\n/);
  let fenced = false;
  for (const line of lines) {
    if (/^\s*(\x60{3,}|~{3,})/.test(line)) {
      fenced = !fenced;
      continue;
    }
    if (fenced) continue;
    const match = /^#\s+(.+?)\s*#*\s*$/.exec(line);
    if (match) return match[1].trim();
  }
  return null;
}

/** Metadata title, falling back to the first H1. */
export function titleOf(data, body, fallback = "Untitled paper") {
  const fromMeta = data && typeof data.title === "string" ? data.title.trim() : "";
  return fromMeta || firstHeading(body) || fallback;
}

/** A compact, human-readable summary of front matter for tool output. */
export function publicMeta(data) {
  const out = {};
  for (const key of ["paper", "title", "subtitle", "authors", "status", "stage", "targetWords", "question", "audience", "contribution", "nextAction", "deadline", "keywords", "createdAt", "updatedAt", "branchOf", "derivedFrom", "language"]) {
    if (data && data[key] !== undefined) out[key] = data[key];
  }
  return out;
}
