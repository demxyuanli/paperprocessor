import { promises as fs } from "node:fs";
import path from "node:path";

import mammoth from "mammoth";
import TurndownService from "turndown";
import { gfm } from "turndown-plugin-gfm";

import { BODY_MARKER } from "../docx-marker.js";

function extensionFor(contentType) {
  if (contentType === "image/png") return "png";
  if (contentType === "image/jpeg") return "jpg";
  if (contentType === "image/gif") return "gif";
  if (contentType === "image/webp") return "webp";
  if (contentType === "image/svg+xml") return "svg";
  return "bin";
}

/**
 * Convert a Word document into Markdown for round-tripping into the paper
 * store. Images are copied into the paper's assets directory so relative
 * Markdown image paths keep working.
 */
export async function convertDocxToMarkdown({ filePath, assetsDir, assetPrefix = "assets" }) {
  await fs.mkdir(assetsDir, { recursive: true });
  const images = [];
  let imageIndex = 0;
  const result = await mammoth.convertToHtml(
    { path: filePath },
    {
      convertImage: mammoth.images.imgElement(async (image) => {
        const buffer = await image.read("buffer");
        const extension = extensionFor(image.contentType);
        imageIndex += 1;
        const name = "word-" + Date.now() + "-" + imageIndex + "." + extension;
        await fs.writeFile(path.join(assetsDir, name), buffer);
        images.push({ name, contentType: image.contentType, bytes: buffer.length });
        return { src: assetPrefix + "/" + name };
      }),
    }
  );
  const warnings = result.messages
    .map((message) => String(message.message || "").trim())
    .filter((message) => message !== "");
  warnings.push("Word 批注、修订痕迹和复杂公式不会完整转换；请先看 diff 再确认。");
  const turndown = new TurndownService({
    headingStyle: "atx",
    bulletListMarker: "-",
    codeBlockStyle: "fenced",
  });
  turndown.use(gfm);
  let markdown = turndown.turndown(result.value);
  markdown = markdown
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+$/gm, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  const markerIndex = markdown.indexOf(BODY_MARKER);
  if (markerIndex >= 0) {
    markdown = markdown.slice(markerIndex + BODY_MARKER.length).trim();
  } else {
    const tocIndex = markdown.indexOf("# Contents / 目录");
    if (tocIndex >= 0) {
      const firstSection = markdown.indexOf("\n## ", tocIndex);
      if (firstSection >= 0) {
        markdown = markdown.slice(firstSection + 1).trim();
        warnings.push("未找到正文标记，已按目录后的第一个二级标题推断正文起点；建议用新版导出的 DOCX。");
      }
    }
  }
  if (markdown === "") throw new Error("Word document produced no Markdown text");
  return { markdown, warnings, images };
}
