import { nowIso } from "./util.js";
import { firstHeading, splitFrontMatter, stringifyFrontMatter } from "./frontmatter.js";

const HEADING = /^(#{1,6})[ \t]+(.+?)[ \t]*#*[ \t]*$/;

/** Remove common inline Markdown so a heading can be shown or matched plainly. */
export function stripInline(value) {
  return String(value ?? "")
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/\x60([^\x60]*)\x60/g, "$1")
    .replace(/[*_~]{1,3}/g, "")
    .replace(/<[^>]+>/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Parse ATX headings outside fenced code blocks, with hierarchical numbers.
 * The returned sections include every heading of level 2 or deeper; a section
 * runs until the next heading at the same or a shallower level.
 */
export function parseHeadings(body) {
  const lines = String(body ?? "").split(/\r?\n/);
  const raw = [];
  let fenced = false;
  let fence = null;
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const fenceMatch = /^\s*(\x60{3,}|~{3,})/.exec(line);
    if (fenceMatch) {
      if (!fenced) {
        fenced = true;
        fence = fenceMatch[1][0];
      } else if (fenceMatch[1][0] === fence) {
        fenced = false;
        fence = null;
      }
      continue;
    }
    if (fenced) continue;
    const match = HEADING.exec(line);
    if (!match) continue;
    raw.push({ level: match[1].length, title: match[2].trim(), line: index });
  }

  const explicitNumbers = raw.map((heading) => {
    const match = /^(\d+(?:\.\d+)*)[.)]?\s+/.exec(heading.title);
    return match ? match[1] : null;
  });
  const hasExplicitNumbers = raw.some((heading, index) => heading.level >= 2 && explicitNumbers[index] !== null);
  const counters = [0, 0, 0, 0, 0, 0, 0];
  const headings = raw.map((heading, index) => {
    let computed = "";
    if (heading.level >= 2) {
      counters[heading.level] += 1;
      for (let level = heading.level + 1; level <= 6; level += 1) counters[level] = 0;
      computed = counters.slice(2, heading.level + 1).join(".");
    }
    const number = heading.level >= 2
      ? (hasExplicitNumbers ? (explicitNumbers[index] ?? "") : computed)
      : "";
    return {
      ...heading,
      index,
      number,
      plain: stripInline(heading.title),
      endLine: lines.length,
    };
  });

  for (let i = 0; i < headings.length; i += 1) {
    for (let j = i + 1; j < headings.length; j += 1) {
      if (headings[j].level <= headings[i].level) {
        headings[i].endLine = headings[j].line;
        break;
      }
    }
  }

  const sections = headings.filter((heading) => heading.level >= 2).map((heading) => ({
    level: heading.level,
    number: heading.number,
    title: heading.plain,
    line: heading.line,
    endLine: heading.endLine,
  }));
  return { headings, sections, lines };
}

/** Display rows for a paper's sections. */
export function sectionRows(body) {
  return parseHeadings(body).sections.map((section) => ({
    level: section.level,
    number: section.number,
    title: section.title,
    line: section.line + 1,
  }));
}

function selectorMatches(section, selector) {
  const value = selector.trim().toLowerCase();
  if (value.length === 0) return false;
  const title = section.title.toLowerCase();
  if (section.number === value) return 1;
  if (title === value) return 2;
  if (title.startsWith(value)) return 3;
  if (title.includes(value)) return 4;
  return 0;
}

/**
 * Resolve section selectors ("2", "2.1", or a heading title) to merged line
 * ranges in the body. Ambiguous or unknown selectors fail with the available
 * heading list; selecting a parent includes all of its descendants.
 */
export function selectSectionRanges(body, selectors) {
  if (!Array.isArray(selectors) || selectors.length === 0) {
    throw new Error("sections is required when mode is \"excerpt\"");
  }
  const parsed = parseHeadings(body);
  const sections = parsed.sections;
  const available = sections.map((s) => (s.number ? s.number + " " : "") + s.title).join("; ");
  const chosen = [];
  for (const selector of selectors) {
    if (typeof selector !== "string" || selector.trim() === "") {
      throw new Error("every section selector must be a non-empty string");
    }
    let bestTier = 5;
    let matches = [];
    for (const section of sections) {
      const tier = selectorMatches(section, selector);
      if (tier === 0) continue;
      if (tier < bestTier) {
        bestTier = tier;
        matches = [section];
      } else if (tier === bestTier) {
        matches.push(section);
      }
    }
    if (matches.length === 0) {
      throw new Error("no section matches \"" + selector + "\"; available sections: " + (available || "(none)"));
    }
    if (matches.length > 1) {
      throw new Error("section selector \"" + selector + "\" is ambiguous: " + matches.map((m) => m.number + " " + m.title).join("; "));
    }
    chosen.push(matches[0]);
  }
  chosen.sort((a, b) => a.line - b.line);
  const ranges = [];
  for (const section of chosen) {
    const last = ranges[ranges.length - 1];
    if (last && section.line <= last.end) {
      last.end = Math.max(last.end, section.endLine);
    } else {
      ranges.push({ start: section.line, end: section.endLine });
    }
  }
  return ranges;
}

export function mergeRanges(ranges) {
  const sorted = ranges.slice().sort((a, b) => a.start - b.start || a.end - b.end);
  const merged = [];
  for (const range of sorted) {
    const last = merged[merged.length - 1];
    if (last && range.start <= last.end) {
      last.end = Math.max(last.end, range.end);
    } else {
      merged.push({ start: range.start, end: range.end });
    }
  }
  return merged;
}

export function replaceTitle(body, title) {
  const lines = String(body ?? "").split(/\r?\n/);
  let fenced = false;
  for (let i = 0; i < lines.length; i += 1) {
    if (/^\s*(\x60{3,}|~{3,})/.test(lines[i])) {
      fenced = !fenced;
      continue;
    }
    if (fenced) continue;
    if (/^#\s+/.test(lines[i])) {
      lines[i] = "# " + title;
      return lines.join("\n");
    }
  }
  return "# " + title + "\n\n" + lines.join("\n");
}

/**
 * Build a derived paper from a source document. "full" copies the body and
 * replaces its H1; "excerpt" keeps the preamble plus the selected sections and
 * their descendants. The new front matter records the lineage.
 */
export function buildBranchContent(options) {
  const { source, fromDocId, fromVersion, slug, title, mode, sections, includeAbstract } = options;
  const split = splitFrontMatter(source);
  const body = split.body;
  const sourceTitle = firstHeading(body) || split.data.title || "Untitled paper";
  const finalTitle = String(title || sourceTitle).trim();
  let nextBody;
  if (mode === "full") {
    nextBody = replaceTitle(body, finalTitle);
  } else {
    const parsed = parseHeadings(body);
    let ranges = selectSectionRanges(body, sections ?? []);
    if (includeAbstract !== false) {
      const abstract = parsed.sections.find((section) => /^(?:\d+(?:\.\d+)*[.)]?\s+)?(abstract|摘要)$/i.test(section.title));
      if (abstract) ranges = mergeRanges([...ranges, { start: abstract.line, end: abstract.endLine }]);
    }
    const lines = body.split(/\r?\n/);
    const h1 = parsed.headings.find((h) => h.level === 1);
    const firstH2 = parsed.headings.find((h) => h.level >= 2);
    const start = h1 ? h1.line + 1 : 0;
    const end = firstH2 ? firstH2.line : lines.length;
    const preamble = lines.slice(start, end).join("\n").trim();
    const chunks = ranges.map((range) => lines.slice(range.start, range.end).join("\n").trim());
    nextBody = "# " + finalTitle + "\n\n" + [preamble, ...chunks].filter(Boolean).join("\n\n") + "\n";
  }
  const data = {
    ...split.data,
    paper: slug,
    title: finalTitle,
    status: "draft",
    branchOf: fromDocId,
    derivedFrom: fromDocId + "@v" + fromVersion,
    createdAt: nowIso(),
    updatedAt: nowIso(),
  };
  delete data.version;
  return stringifyFrontMatter(data, nextBody);
}

/** True when a heading list already carries explicit numbers (1, 1.1, ...). */
export function headingsAreNumbered(sections) {
  if (!sections || sections.length === 0) return false;
  const numbered = sections.filter((s) => /^\d+(?:\.\d+)*[.)]?\s+/.test(s.title)).length;
  return numbered >= Math.ceil(sections.length / 2);
}

/** Rough language hint for the HTML document. */
export function detectLanguage(body) {
  const text = String(body ?? "");
  const cjk = (text.match(/[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]/g) ?? []).length;
  return cjk >= Math.max(12, text.length * 0.05) ? "zh-CN" : "en";
}