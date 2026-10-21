import { sectionRows } from "./markdown.js";
import { wordCount } from "./util.js";

export const DRAFT_STAGES = [
  { id: "idea", label: "构思" },
  { id: "outline", label: "提纲" },
  { id: "drafting", label: "初稿" },
  { id: "revising", label: "修订" },
  { id: "done", label: "完成" },
];

const STAGE_IDS = new Set(DRAFT_STAGES.map((stage) => stage.id));

export function normalizeStage(value) {
  const text = String(value ?? "").trim().toLowerCase();
  return STAGE_IDS.has(text) ? text : "idea";
}

export function stageLabel(value) {
  const stage = normalizeStage(value);
  return DRAFT_STAGES.find((entry) => entry.id === stage)?.label ?? "构思";
}

function stringValue(value) {
  return typeof value === "string" ? value.trim() : "";
}

function positiveInteger(value) {
  const number = Number(value);
  return Number.isInteger(number) && number > 0 ? number : 0;
}

function sectionText(body, names) {
  const lines = String(body ?? "").split(/\r?\n/);
  const wanted = names.map((name) => name.toLowerCase());
  let start = -1;
  let level = 0;
  for (let index = 0; index < lines.length; index += 1) {
    const match = /^(#{1,6})\s+(.+?)\s*#*\s*$/.exec(lines[index]);
    if (!match) continue;
    if (wanted.includes(match[2].trim().toLowerCase())) {
      start = index + 1;
      level = match[1].length;
      break;
    }
  }
  if (start < 0) return "";
  const out = [];
  for (let index = start; index < lines.length; index += 1) {
    const match = /^(#{1,6})\s+/.exec(lines[index]);
    if (match && match[1].length <= level) break;
    out.push(lines[index]);
  }
  return out.join("\n");
}

/**
 * Score a draft for the "get it written" workflow. This is intentionally
 * advisory: it highlights missing scaffolding, not submission compliance.
 */
export function evaluateDraft({ data = {}, body = "", title = "" } = {}) {
  const words = wordCount(body);
  const targetWords = positiveInteger(data?.targetWords);
  const progress = targetWords > 0 ? Math.min(100, Math.round(words / targetWords * 100)) : null;
  const headings = sectionRows(body);
  const abstract = sectionText(body, ["abstract", "摘要"]);
  const abstractWords = wordCount(abstract);
  const question = stringValue(data?.question);
  const nextAction = stringValue(data?.nextAction);
  const deadline = stringValue(data?.deadline);
  const stage = normalizeStage(data?.stage);
  const todoMatches = String(body ?? "").match(/\b(?:TODO|TBD|FIXME)\b|待补|待写|待定|待核实/g) ?? [];
  const todos = todoMatches.length;
  const checks = [];

  checks.push({
    id: "question",
    label: "一句话问题",
    status: question === "" ? "warn" : "pass",
    detail: question === "" ? "在 front matter 写 question，先固定研究问题。" : question,
  });
  checks.push({
    id: "title",
    label: "标题",
    status: !title || title === "Untitled paper" ? "warn" : "pass",
    detail: !title || title === "Untitled paper" ? "先给论文一个可工作的标题。" : title,
  });
  checks.push({
    id: "abstract",
    label: "摘要",
    status: abstractWords >= 30 ? "pass" : (abstractWords > 0 ? "warn" : "fail"),
    detail: abstractWords >= 30 ? abstractWords + " 词" : (abstractWords > 0 ? "只有 " + abstractWords + " 词，先写成 3–5 句。" : "还没有 Abstract/摘要 段落。"),
  });
  checks.push({
    id: "structure",
    label: "结构",
    status: headings.length >= 3 ? "pass" : (headings.length > 0 ? "warn" : "fail"),
    detail: headings.length >= 3 ? headings.length + " 个标题" : (headings.length > 0 ? "只有 " + headings.length + " 个标题，先补提纲。" : "还没有二级标题。"),
  });
  checks.push({
    id: "progress",
    label: "字数进度",
    status: targetWords === 0 ? "warn" : (progress >= 80 ? "pass" : (progress >= 40 ? "warn" : "fail")),
    detail: targetWords === 0 ? "在 front matter 写 targetWords，才能显示进度。" : words + " / " + targetWords + " 词（" + progress + "%）",
  });
  checks.push({
    id: "todos",
    label: "未完成标记",
    status: todos === 0 ? "pass" : (todos <= 3 ? "warn" : "fail"),
    detail: todos === 0 ? "没有 TODO/TBD/待补。" : "还有 " + todos + " 处 TODO/TBD/待补。",
  });
  checks.push({
    id: "next",
    label: "下一步",
    status: nextAction === "" ? "warn" : "pass",
    detail: nextAction === "" ? "在 front matter 写 nextAction，让下一次打开知道做什么。" : nextAction,
  });

  const points = checks.reduce((sum, check) => sum + (check.status === "pass" ? 1 : (check.status === "warn" ? 0.5 : 0)), 0);
  const score = Math.round(points / checks.length * 100);
  return {
    stage,
    stageLabel: stageLabel(stage),
    words,
    targetWords,
    progress,
    score,
    checks,
    todos,
    abstractWords,
    headingCount: headings.length,
    nextAction,
    deadline,
    question,
  };
}
