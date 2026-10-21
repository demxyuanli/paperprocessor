import { promises as fs } from "node:fs";
import path from "node:path";
import { Marked } from "marked";

import { firstHeading, publicMeta, splitFrontMatter } from "../frontmatter.js";
import { detectLanguage, headingsAreNumbered, sectionRows, stripInline } from "../markdown.js";
import { nowIso, wordCount } from "../util.js";

const MIME = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
  ".bmp": "image/bmp",
};

function esc(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function stripLeadingH1(body) {
  return String(body ?? "").replace(/^\s*#\s+[^\n]*(?:\n+|$)/, "");
}

function tocHtml(headings) {
  const items = headings.filter((h) => h.level >= 2 && h.level <= 4);
  if (items.length === 0) return "";
  const lines = items.map((h) => {
    const indent = "  ".repeat(Math.max(0, h.level - 2));
    const label = h.explicit ? h.title : (h.number ? h.number + " " + h.title : h.title);
    return indent + '<li class="toc-level-' + h.level + '"><a href="#' + esc(h.id) + '">' + esc(label) + "</a></li>";
  });
  return '<nav class="toc" aria-label="Contents"><h2 class="toc-title">Contents / 目录</h2><ul>\n' + lines.join("\n") + "\n</ul></nav>";
}

async function inlineLocalImages(markdown, baseDir, root, warnings) {
  const instance = new Marked({ gfm: true, breaks: false });
  const tokens = instance.lexer(markdown);
  const cache = new Map();
  const images = [];
  instance.walkTokens(tokens, (token) => {
    if (token.type === "image" && typeof token.href === "string") images.push(token.href);
  });
  for (const href of images) {
    if (cache.has(href)) continue;
    if (/^(?:https?:|data:|file:|mailto:)/i.test(href)) {
      cache.set(href, href);
      continue;
    }
    const cleaned = decodeURIComponent(href.replace(/[?#].*$/, ""));
    const target = path.resolve(baseDir, cleaned.replace(/^[/\\]/, ""));
    if (!target.startsWith(path.resolve(root) + path.sep)) {
      warnings.push("image outside the workspace was not embedded: " + href);
      cache.set(href, href);
      continue;
    }
    try {
      const data = await fs.readFile(target);
      const mime = MIME[path.extname(target).toLowerCase()] || "application/octet-stream";
      cache.set(href, "data:" + mime + ";base64," + data.toString("base64"));
    } catch (error) {
      warnings.push("image could not be read: " + href + " (" + error.code + ")");
      cache.set(href, href);
    }
  }
  if (cache.size > 0) {
    instance.walkTokens(tokens, (token) => {
      if (token.type === "image" && cache.has(token.href)) token.href = cache.get(token.href);
    });
  }
  return { tokens, instance };
}

const CSS = `
:root { color-scheme: light; }
* { box-sizing: border-box; }
html { font-size: 16px; }
body {
  margin: 0 auto;
  padding: 0 24px 64px;
  max-width: 860px;
  color: #1c1c1c;
  background: #fff;
  font-family: "Source Han Serif SC", "Noto Serif CJK SC", "Songti SC", SimSun, "Times New Roman", serif;
  line-height: 1.75;
  text-align: justify;
  hyphens: auto;
}
.title-page { padding: 96px 0 56px; border-bottom: 1px solid #d8d3c6; margin-bottom: 40px; text-align: center; }
.title-page .kicker { letter-spacing: .22em; text-transform: uppercase; font-size: 12px; color: #7a6f5c; }
.title-page h1 { font-size: 30px; line-height: 1.35; margin: 18px 0 10px; font-family: "Source Han Sans SC", "Microsoft YaHei", "Helvetica Neue", sans-serif; font-weight: 700; }
.title-page .subtitle { font-size: 17px; color: #555; margin: 0 0 18px; }
.title-page .authors { font-size: 15px; margin: 18px 0 4px; }
.title-page .meta { font-size: 13px; color: #6b6459; margin-top: 20px; }
.title-page .meta span { margin: 0 8px; white-space: nowrap; }
.toc { margin: 0 0 44px; padding: 22px 26px; border: 1px solid #e3ded2; background: #faf9f5; }
.toc-title { font-size: 16px; margin: 0 0 12px; font-family: "Source Han Sans SC", "Microsoft YaHei", sans-serif; }
.toc ul { list-style: none; margin: 0; padding: 0; }
.toc li { margin: 4px 0; font-size: 14px; }
.toc li.toc-level-3 { padding-left: 1.6em; }
.toc li.toc-level-4 { padding-left: 3.2em; }
.toc a { color: #2f3b49; text-decoration: none; }
.toc a:hover { text-decoration: underline; }
.paper-body h1, .paper-body h2, .paper-body h3, .paper-body h4 {
  font-family: "Source Han Sans SC", "Microsoft YaHei", "Helvetica Neue", sans-serif;
  color: #16202a;
  line-height: 1.35;
  text-align: left;
}
.paper-body h2 { font-size: 22px; margin: 2.2em 0 .8em; padding-bottom: .28em; border-bottom: 1px solid #e7e2d7; }
.paper-body h3 { font-size: 18px; margin: 1.8em 0 .6em; }
.paper-body h4 { font-size: 16px; margin: 1.5em 0 .5em; }
.paper-body p { margin: 0 0 1em; }
.paper-body a { color: #1a5c9c; }
.paper-body blockquote { margin: 1.4em 0; padding: .2em 1.1em; border-left: 3px solid #c9b98c; color: #4b463c; background: #fbfaf6; }
.paper-body code { font-family: "Cascadia Code", Consolas, "Courier New", monospace; font-size: .9em; background: #f2f0ea; padding: .12em .32em; border-radius: 3px; }
.paper-body pre { background: #f6f4ee; border: 1px solid #e7e2d7; border-radius: 6px; padding: 14px 16px; overflow-x: auto; line-height: 1.55; }
.paper-body pre code { background: none; padding: 0; }
.paper-body table { width: 100%; border-collapse: collapse; margin: 1.4em 0; font-size: 14px; }
.paper-body th, .paper-body td { border: 1px solid #ddd7ca; padding: 7px 10px; text-align: left; vertical-align: top; }
.paper-body th[align="right"], .paper-body td[align="right"] { text-align: right; }
.paper-body th[align="center"], .paper-body td[align="center"] { text-align: center; }
.paper-body th { background: #f4f1e9; font-weight: 600; }
.paper-body img { max-width: 100%; height: auto; display: block; margin: 1.2em auto; }
.paper-body hr { border: none; border-top: 1px solid #ddd7ca; margin: 2.4em 0; }
.paper-body ul, .paper-body ol { padding-left: 1.6em; margin: 0 0 1em; }
.paper-body li { margin: .28em 0; }
.footnote { margin-top: 56px; padding-top: 14px; border-top: 1px solid #e3ded2; color: #8a8175; font-size: 12px; }
${""}
@media print {
  html { font-size: 11.5pt; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  body { max-width: none; padding: 0; margin: 0; line-height: 1.65; }
  .title-page { padding-top: 48mm; border-bottom: none; page-break-after: always; }
  .toc { page-break-after: always; border: none; background: none; padding: 0; }
  .paper-body h2, .paper-body h3, .paper-body h4 { page-break-after: avoid; }
  .paper-body pre, .paper-body table, .paper-body img, .paper-body blockquote { page-break-inside: avoid; }
  a { color: inherit; text-decoration: none; }
}
@page { size: A4; margin: 20mm 18mm 18mm; }
`;

function numberingCss(enabled) {
  if (!enabled) return "";
  return `
.paper-body { counter-reset: h2; }
.paper-body h2 { counter-increment: h2; counter-reset: h3; }
.paper-body h2::before { content: counter(h2) ". "; }
.paper-body h3 { counter-increment: h3; counter-reset: h4; }
.paper-body h3::before { content: counter(h2) "." counter(h3) " "; }
.paper-body h4 { counter-increment: h4; }
.paper-body h4::before { content: counter(h2) "." counter(h3) "." counter(h4) " "; }
.paper-body h2.no-counter::before, .paper-body h3.no-counter::before, .paper-body h4.no-counter::before { content: none; }
`;
}

/** Render one immutable version to a standalone, print-ready HTML document. */
export async function renderHtml({ docId, versionMeta, content, root, baseDir, config }) {
  const split = splitFrontMatter(content);
  const meta = publicMeta(split.data);
  const warnings = [];
  const title = meta.title || firstHeading(split.body) || docId;
  const body = stripLeadingH1(split.body);
  const { tokens, instance } = await inlineLocalImages(body, baseDir, root, warnings);
  const headings = [];
  let counter = 0;
  instance.use({
    renderer: {
      heading(token) {
        const text = this.parser.parseInline(token.tokens);
        counter += 1;
        const plain = stripInline(text);
        const explicit = /^\d+(?:\.\d+)*[.)]?\s+/.test(plain);
        const id = "h-" + counter + "-" + plain.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-+|-+$/g, "").slice(0, 40);
        headings.push({ level: token.depth, id, title: plain, number: "", explicit });
        return '<h' + token.depth + ' id="' + esc(id) + '"' + (explicit ? ' class="no-counter"' : "") + ">" + text + "</h" + token.depth + ">\n";
      },
      link(token) {
        const raw = String(token.href ?? "");
        const safe = /^(?:https?:|mailto:|#|\/|\.\/|\.\.\/)/i.test(raw) ? raw : "#";
        const external = /^https?:/i.test(safe);
        return '<a href="' + esc(safe) + '"' + (external ? ' target="_blank" rel="noopener noreferrer"' : "") + ">" + this.parser.parseInline(token.tokens) + "</a>";
      },
      html(token) {
        return esc(token.text);
      },
    },
  });
  const rendered = instance.parser(tokens);
  // Number headings in the TOC the same way the body is numbered, when needed.
  const sections = sectionRows(split.body);
  const needNumbers = config.html.numberSections && !headingsAreNumbered(sections);
  if (needNumbers) {
    for (let i = 0; i < headings.length; i += 1) {
      const section = sections.find((item) => item.title === headings[i].title);
      if (section && !headings[i].explicit) headings[i].number = section.number;
    }
  }
  const tblOfContents = config.html.toc ? tocHtml(headings) : "";
  const authors = Array.isArray(meta.authors) ? meta.authors.join(" · ") : (typeof meta.authors === "string" ? meta.authors : "");
  const date = versionMeta && versionMeta.createdAt ? versionMeta.createdAt.slice(0, 10) : nowIso().slice(0, 10);
  const status = meta.status ? '<span>' + esc(meta.status) + "</span>" : "";
  const versionLine = versionMeta ? '<span>' + esc(versionMeta.id) + "</span>" : "";
  const lang = meta.language || detectLanguage(split.body);
  const titlePage = `
<header class="title-page">
  <div class="kicker">Paper</div>
  <h1>${esc(title)}</h1>
  ${meta.subtitle ? '<p class="subtitle">' + esc(meta.subtitle) + "</p>" : ""}
  ${authors ? '<p class="authors">' + esc(authors) + "</p>" : ""}
  <div class="meta">${status}${versionLine}<span>${esc(date)}</span><span>${wordCount(split.body)} words</span></div>
</header>`;
  const footnote = '<footer class="footnote">' + esc(docId) + (versionMeta ? " · " + esc(versionMeta.id) : "") + " · generated by dsh-paper on " + esc(nowIso()) + "</footer>";
  return {
    html: `<!doctype html>
<html lang="${esc(lang)}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<style>${CSS}${numberingCss(needNumbers)}</style>
</head>
<body>
${titlePage}
${tblOfContents}
<main class="paper-body">
${rendered}
</main>
${footnote}
</body>
</html>
`,
    warnings,
    title,
    headings,
    words: wordCount(split.body),
  };
}