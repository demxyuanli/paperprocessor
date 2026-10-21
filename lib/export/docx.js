import { promises as fs } from "node:fs";
import path from "node:path";
import { imageSize } from "image-size";
import { Marked } from "marked";

import { BODY_MARKER } from "../docx-marker.js";
import {
  AlignmentType,
  BorderStyle,
  Document,
  ExternalHyperlink,
  Footer,
  Header,
  HeadingLevel,
  ImageRun,
  LevelFormat,
  PageBreak,
  PageNumber,
  Packer,
  Paragraph,
  ShadingType,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
} from "docx";

import { firstHeading, publicMeta, splitFrontMatter } from "../frontmatter.js";
import { headingsAreNumbered, sectionRows } from "../markdown.js";
import { nowIso, wordCount } from "../util.js";

const MIME_TYPE = {
  ".png": "png",
  ".jpg": "jpg",
  ".jpeg": "jpg",
  ".gif": "gif",
  ".bmp": "bmp",
};

function stripLeadingH1(body) {
  return String(body ?? "").replace(/^\s*#\s+[^\n]*(?:\n+|$)/, "");
}

function walkTokens(tokens, visit) {
  if (!Array.isArray(tokens)) return;
  for (const token of tokens) {
    if (!token || typeof token !== "object") continue;
    visit(token);
    if (Array.isArray(token.tokens)) walkTokens(token.tokens, visit);
    if (Array.isArray(token.items)) for (const item of token.items) walkTokens(item.tokens, visit);
    if (Array.isArray(token.header)) for (const cell of token.header) walkTokens(cell.tokens, visit);
    if (Array.isArray(token.rows)) for (const row of token.rows) for (const cell of row) walkTokens(cell.tokens, visit);
  }
}

function stripHtml(value) {
  return String(value ?? "").replace(/<br\s*\/?>/gi, "\n").replace(/<[^>]+>/g, "");
}

async function loadImages(tokens, baseDir, root, warnings) {
  const images = new Map();
  const hrefs = new Set();
  walkTokens(tokens, (token) => {
    if (token.type === "image" && typeof token.href === "string") hrefs.add(token.href);
  });
  for (const href of hrefs) {
    if (/^(?:https?:|data:|file:)/i.test(href)) {
      warnings.push("remote or embedded image is kept as a label in DOCX: " + href);
      continue;
    }
    const cleaned = decodeURIComponent(href.replace(/[?#].*$/, ""));
    const target = path.resolve(baseDir, cleaned.replace(/^[/\\]/, ""));
    if (!target.startsWith(path.resolve(root) + path.sep)) {
      warnings.push("image outside the workspace was not embedded in DOCX: " + href);
      continue;
    }
    const ext = path.extname(target).toLowerCase();
    const type = MIME_TYPE[ext];
    if (!type) {
      warnings.push("unsupported image format for DOCX (" + ext + "): " + href);
      continue;
    }
    try {
      const data = await fs.readFile(target);
      let size;
      try { size = imageSize(data); } catch { size = { width: 600, height: 400 }; }
      images.set(href, { data, type, width: size.width || 600, height: size.height || 400 });
    } catch (error) {
      warnings.push("image could not be read for DOCX: " + href + " (" + error.code + ")");
    }
  }
  return images;
}

function fontSet(font) {
  return { ascii: font, eastAsia: font, hAnsi: font, cs: font };
}

function runStyle(style) {
  return {
    bold: style.bold === true ? true : undefined,
    italics: style.italics === true ? true : undefined,
    strike: style.strike === true ? true : undefined,
    color: style.color,
    size: style.size,
    font: style.font,
    underline: style.underline === true ? {} : undefined,
    shading: style.shading,
  };
}

function inlineRuns(tokens, style, context) {
  const runs = [];
  for (const token of Array.isArray(tokens) ? tokens : []) {
    if (!token) continue;
    switch (token.type) {
      case "text":
        if (Array.isArray(token.tokens) && token.tokens.length > 0) runs.push(...inlineRuns(token.tokens, style, context));
        else if (token.text) runs.push(new TextRun({ text: token.text, ...runStyle(style) }));
        break;
      case "escape":
        if (token.text) runs.push(new TextRun({ text: token.text, ...runStyle(style) }));
        break;
      case "strong":
        runs.push(...inlineRuns(token.tokens, { ...style, bold: true }, context));
        break;
      case "em":
        runs.push(...inlineRuns(token.tokens, { ...style, italics: true }, context));
        break;
      case "del":
        runs.push(...inlineRuns(token.tokens, { ...style, strike: true }, context));
        break;
      case "codespan":
        runs.push(new TextRun({
          text: token.text,
          font: fontSet(context.codeFont),
          size: 20,
          shading: { type: ShadingType.CLEAR, fill: "F2F0EA", color: "auto" },
          ...runStyle({ ...style, size: undefined, font: undefined }),
        }));
        break;
      case "link": {
        const children = inlineRuns(token.tokens, { ...style, color: "1A5C9C", underline: true }, context);
        if (/^https?:/i.test(token.href)) {
          runs.push(new ExternalHyperlink({ link: token.href, children }));
        } else {
          runs.push(...children);
          if (token.href && !token.href.startsWith("#")) runs.push(new TextRun({ text: " (" + token.href + ")", ...runStyle({ ...style, color: "666666", size: 20 }) }));
        }
        break;
      }
      case "image": {
        const info = context.images.get(token.href);
        if (!info) {
          runs.push(new TextRun({ text: "[image: " + (token.text || token.href) + "]", ...runStyle({ ...style, color: "888888", italics: true }) }));
          break;
        }
        const maxWidth = 600;
        const maxHeight = 760;
        const scale = Math.min(1, maxWidth / info.width, maxHeight / info.height);
        runs.push(new ImageRun({
          type: info.type,
          data: info.data,
          transformation: { width: Math.round(info.width * scale), height: Math.round(info.height * scale) },
          altText: { title: token.text || "figure", description: token.text || "", name: token.text || "figure" },
        }));
        break;
      }
      case "br":
        runs.push(new TextRun({ break: 1 }));
        break;
      case "html":
        if (token.text) {
          const text = stripHtml(token.text);
          if (text) runs.push(new TextRun({ text, ...runStyle(style) }));
        }
        break;
      default:
        if (Array.isArray(token.tokens)) runs.push(...inlineRuns(token.tokens, style, context));
        else if (token.text) runs.push(new TextRun({ text: token.text, ...runStyle(style) }));
        break;
    }
  }
  return runs;
}

function headingLevel(depth) {
  const value = Math.min(6, Math.max(1, Number(depth) || 1));
  return HeadingLevel["HEADING_" + value] || HeadingLevel.HEADING_1;
}

function codeParagraph(text, context) {
  const lines = String(text ?? "").split(/\r?\n/);
  const runs = lines.map((line, index) => new TextRun({
    text: line,
    break: index === 0 ? undefined : 1,
    font: fontSet(context.codeFont),
    size: 20,
  }));
  return new Paragraph({
    shading: { type: ShadingType.CLEAR, fill: "F6F4EE", color: "auto" },
    spacing: { before: 120, after: 120, line: 240 },
    indent: { left: 240, right: 240 },
    children: runs.length > 0 ? runs : [new TextRun({ text: "" })],
  });
}

function nextListInstance(context, reference) {
  context.listInstances[reference] = (context.listInstances[reference] ?? 0) + 1;
  return context.listInstances[reference];
}

function listParagraphs(token, level, context, instance) {
  const paragraphs = [];
  const reference = token.ordered ? "paper-numbered" : "paper-bullet";
  const safeLevel = Math.min(8, Math.max(0, level));
  for (const item of token.items || []) {
    const inline = [];
    const nested = [];
    for (const child of item.tokens || []) {
      if (child.type === "list") nested.push(child);
      else if (child.type === "paragraph" || child.type === "text") {
        if (Array.isArray(child.tokens)) inline.push(...child.tokens);
        else if (child.text) inline.push({ type: "text", text: child.text });
      } else if (child.type === "code") inline.push({ type: "text", text: child.text });
      else if (Array.isArray(child.tokens)) inline.push(...child.tokens);
      else if (child.text) inline.push({ type: "text", text: child.text });
    }
    const prefix = item.task ? (item.checked ? "☑ " : "☐ ") : "";
    const runs = inlineRuns(inline, {}, context);
    if (prefix) runs.unshift(new TextRun({ text: prefix }));
    paragraphs.push(new Paragraph({
      numbering: { reference, level: safeLevel, instance },
      spacing: { after: 60, line: 320 },
      children: runs.length > 0 ? runs : [new TextRun({ text: item.text || "" })],
    }));
    for (const child of nested) {
      const childReference = child.ordered ? "paper-numbered" : "paper-bullet";
      const childInstance = childReference === reference ? instance : nextListInstance(context, childReference);
      paragraphs.push(...listParagraphs(child, safeLevel + 1, context, childInstance));
    }
  }
  return paragraphs;
}

function cellAlignment(cell) {
  if (cell && cell.align === "right") return AlignmentType.RIGHT;
  if (cell && cell.align === "center") return AlignmentType.CENTER;
  return undefined;
}

function tableElement(token, context) {
  const header = Array.isArray(token.header) ? token.header : [];
  const rows = [];
  if (header.length > 0) {
    rows.push(new TableRow({
      tableHeader: true,
      children: header.map((cell) => new TableCell({
        shading: { type: ShadingType.CLEAR, fill: "F4F1E9", color: "auto" },
        margins: { top: 80, bottom: 80, left: 100, right: 100 },
        children: [new Paragraph({ alignment: cellAlignment(cell), children: inlineRuns(cell.tokens ?? [{ type: "text", text: cell.text ?? "" }], { bold: true }, context) })],
      })),
    }));
  }
  for (const row of Array.isArray(token.rows) ? token.rows : []) {
    rows.push(new TableRow({
      children: row.map((cell) => new TableCell({
        margins: { top: 80, bottom: 80, left: 100, right: 100 },
        children: [new Paragraph({ alignment: cellAlignment(cell), children: inlineRuns(cell.tokens ?? [{ type: "text", text: cell.text ?? "" }], {}, context) })],
      })),
    }));
  }
  if (rows.length === 0) return [];
  return [new Table({
    rows,
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: {
      top: { style: BorderStyle.SINGLE, size: 4, color: "DDD7CA" },
      bottom: { style: BorderStyle.SINGLE, size: 4, color: "DDD7CA" },
      left: { style: BorderStyle.SINGLE, size: 4, color: "DDD7CA" },
      right: { style: BorderStyle.SINGLE, size: 4, color: "DDD7CA" },
      insideHorizontal: { style: BorderStyle.SINGLE, size: 4, color: "DDD7CA" },
      insideVertical: { style: BorderStyle.SINGLE, size: 4, color: "DDD7CA" },
    },
  })];
}

function blockTokens(tokens, level, context, options = {}) {
  const children = [];
  for (const token of Array.isArray(tokens) ? tokens : []) {
    if (!token) continue;
    switch (token.type) {
      case "space":
        break;
      case "heading": {
        const section = context.docxSections ? context.docxSections[context.docxSectionCursor++] : null;
        const explicit = section ? /^\d+(?:\.\d+)*[.)]?\s+/.test(section.title) : false;
        const headingTokens = section && !context.docxNumbered && section.number && !explicit
          ? [{ type: "text", text: section.number + "  " }, ...(token.tokens ?? [])]
          : token.tokens;
        children.push(new Paragraph({
          heading: headingLevel(token.depth),
          children: inlineRuns(headingTokens, {}, context),
        }));
        break;
      }
      case "paragraph":
        children.push(new Paragraph({
          alignment: options.quote ? undefined : AlignmentType.JUSTIFIED,
          indent: options.quote ? { left: 720, right: 360 } : undefined,
          border: options.quote ? { left: { style: BorderStyle.SINGLE, size: 12, color: "C9B98C", space: 8 } } : undefined,
          spacing: { after: 120, line: 360 },
          children: inlineRuns(token.tokens, options.quote ? { color: "4B463C" } : {}, context),
        }));
        break;
      case "text":
        if (Array.isArray(token.tokens) && token.tokens.length > 0) {
          children.push(new Paragraph({ children: inlineRuns(token.tokens, {}, context) }));
        } else if (token.text) {
          children.push(new Paragraph({ children: [new TextRun({ text: token.text })] }));
        }
        break;
      case "code":
        children.push(codeParagraph(token.text, context));
        break;
      case "blockquote":
        children.push(...blockTokens(token.tokens, level, context, { quote: true }));
        break;
      case "list": {
        const reference = token.ordered ? "paper-numbered" : "paper-bullet";
        children.push(...listParagraphs(token, level, context, nextListInstance(context, reference)));
        break;
      }
      case "table":
        children.push(...tableElement(token, context));
        break;
      case "hr":
        children.push(new Paragraph({
          spacing: { before: 240, after: 240 },
          border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: "DDD7CA", space: 1 } },
          children: [],
        }));
        break;
      case "html": {
        const text = stripHtml(token.text).trim();
        if (text) children.push(new Paragraph({ children: [new TextRun({ text })] }));
        break;
      }
      default:
        if (Array.isArray(token.tokens)) children.push(...blockTokens(token.tokens, level, context, options));
        else if (token.text) children.push(new Paragraph({ children: [new TextRun({ text: token.text })] }));
        break;
    }
  }
  return children;
}

function numberingOptions() {
  const decimalLevels = Array.from({ length: 9 }, (_, level) => ({
    level,
    format: LevelFormat.DECIMAL,
    text: level === 0 ? "%1." : Array.from({ length: level + 1 }, (_, i) => "%" + (i + 1)).join(".") + ".",
    alignment: AlignmentType.START,
    isLegalNumberingStyle: true,
    style: { paragraph: { indent: { left: 720 + level * 360, hanging: 360 } } },
  }));
  const bulletChars = ["•", "◦", "▪", "•", "◦", "▪", "•", "◦", "▪"];
  const bulletLevels = Array.from({ length: 9 }, (_, level) => ({
    level,
    format: LevelFormat.BULLET,
    text: bulletChars[level],
    alignment: AlignmentType.START,
    style: { paragraph: { indent: { left: 720 + level * 360, hanging: 360 } } },
  }));
  return { config: [
    { reference: "paper-numbered", levels: decimalLevels },
    { reference: "paper-bullet", levels: bulletLevels },
  ] };
}

/** Render one immutable version to a DOCX buffer. */
export async function renderDocx({ docId, versionMeta, content, root, baseDir, config }) {
  const split = splitFrontMatter(content);
  const meta = publicMeta(split.data);
  const title = meta.title || firstHeading(split.body) || docId;
  const warnings = [];
  const body = stripLeadingH1(split.body);
  const instance = new Marked({ gfm: true, breaks: false });
  const tokens = instance.lexer(body);
  const images = await loadImages(tokens, baseDir, root, warnings);
  const sections = sectionRows(split.body);
  const alreadyNumbered = headingsAreNumbered(sections);
  const context = {
    images,
    codeFont: config.docx.codeFont,
    docxSections: sections,
    docxNumbered: alreadyNumbered,
    docxSectionCursor: 0,
    listInstances: { "paper-numbered": 0, "paper-bullet": 0 },
  };
  const authors = Array.isArray(meta.authors) ? meta.authors.join(" · ") : (typeof meta.authors === "string" ? meta.authors : "");
  const date = versionMeta && versionMeta.createdAt ? versionMeta.createdAt.slice(0, 10) : nowIso().slice(0, 10);
  const metaLine = [
    meta.status,
    versionMeta ? versionMeta.id : null,
    date,
    wordCount(split.body) + " words",
  ].filter(Boolean).join("  ·  ");
  const children = [];
  children.push(new Paragraph({
    heading: HeadingLevel.TITLE,
    alignment: AlignmentType.CENTER,
    spacing: { before: 2600, after: 240 },
    children: [new TextRun({ text: title, font: fontSet(config.docx.headingFont), size: 44, bold: true, color: "16202A" })],
  }));
  if (meta.subtitle) {
    children.push(new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 240 },
      children: [new TextRun({ text: meta.subtitle, font: fontSet(config.docx.bodyFont), size: 28, color: "555555" })],
    }));
  }
  if (authors) {
    children.push(new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 240, after: 120 },
      children: [new TextRun({ text: authors, font: fontSet(config.docx.bodyFont), size: 24 })],
    }));
  }
  children.push(new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { after: 240 },
    children: [new TextRun({ text: metaLine, font: fontSet(config.docx.bodyFont), size: 20, color: "6B6459" })],
  }));
  children.push(new Paragraph({ children: [new PageBreak()] }));
  if (config.docx.toc && sections.length > 0) {
    children.push(new Paragraph({
      heading: HeadingLevel.HEADING_1,
      children: [new TextRun({ text: "Contents / 目录", font: fontSet(config.docx.headingFont) })],
    }));
    for (const section of sections) {
      const explicit = /^\d+(?:\.\d+)*[.)]?\s+/.test(section.title);
      const label = alreadyNumbered || explicit || !section.number ? section.title : section.number + "  " + section.title;
      children.push(new Paragraph({
        indent: { left: 360 * Math.max(0, section.level - 2) },
        spacing: { after: 60 },
        children: [new TextRun({
          text: label,
          font: fontSet(config.docx.bodyFont),
          size: 22,
        })],
      }));
    }
    children.push(new Paragraph({ children: [new PageBreak()] }));
  }
  children.push(new Paragraph({
    spacing: { before: 0, after: 0, line: 1 },
    children: [new TextRun({ text: BODY_MARKER, font: fontSet(config.docx.bodyFont), size: 2, color: "FFFFFF" })],
  }));
  children.push(...blockTokens(tokens, 0, context));
  const document = new Document({
    creator: "dsh-paper",
    title,
    description: "Paper " + docId + (versionMeta ? " " + versionMeta.id : ""),
    styles: {
      default: {
        document: {
          run: { font: fontSet(config.docx.bodyFont), size: 24, color: "1C1C1C" },
          paragraph: { spacing: { line: 360, after: 120 } },
        },
        title: {
          run: { font: fontSet(config.docx.headingFont), size: 44, bold: true, color: "16202A" },
          paragraph: { alignment: AlignmentType.CENTER, spacing: { after: 240 } },
        },
        heading1: {
          run: { font: fontSet(config.docx.headingFont), size: 32, bold: true, color: "16202A" },
          paragraph: { spacing: { before: 360, after: 180 }, keepNext: true },
        },
        heading2: {
          run: { font: fontSet(config.docx.headingFont), size: 30, bold: true, color: "16202A" },
          paragraph: {
            spacing: { before: 360, after: 180 },
            keepNext: true,
            border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: "E7E2D7", space: 2 } },
          },
        },
        heading3: {
          run: { font: fontSet(config.docx.headingFont), size: 26, bold: true, color: "16202A" },
          paragraph: { spacing: { before: 280, after: 120 }, keepNext: true },
        },
        heading4: {
          run: { font: fontSet(config.docx.headingFont), size: 24, bold: true, color: "16202A" },
          paragraph: { spacing: { before: 240, after: 100 }, keepNext: true },
        },
      },
    },
    numbering: numberingOptions(),
    sections: [{
      properties: {
        page: {
          size: { width: 11906, height: 16838 },
          margin: { top: 1440, right: 1440, bottom: 1440, left: 1440, header: 720, footer: 720 },
        },
      },
      headers: {
        default: new Header({
          children: [new Paragraph({
            alignment: AlignmentType.RIGHT,
            children: [new TextRun({ text: title, font: fontSet(config.docx.bodyFont), size: 16, color: "8A8175" })],
          })],
        }),
      },
      footers: {
        default: new Footer({
          children: [new Paragraph({
            alignment: AlignmentType.CENTER,
            children: [
              new TextRun({ text: "第 ", font: fontSet(config.docx.bodyFont), size: 16, color: "8A8175" }),
              new TextRun({ children: [PageNumber.CURRENT], font: fontSet(config.docx.bodyFont), size: 16, color: "8A8175" }),
              new TextRun({ text: " 页 / 共 ", font: fontSet(config.docx.bodyFont), size: 16, color: "8A8175" }),
              new TextRun({ children: [PageNumber.TOTAL_PAGES], font: fontSet(config.docx.bodyFont), size: 16, color: "8A8175" }),
              new TextRun({ text: " 页", font: fontSet(config.docx.bodyFont), size: 16, color: "8A8175" }),
            ],
          })],
        }),
      },
      children,
    }],
  });
  const buffer = await Packer.toBuffer(document);
  return { buffer, warnings, title, words: wordCount(split.body) };
}