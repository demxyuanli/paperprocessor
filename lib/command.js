import path from "node:path";

import { exportPaper, normalizeFormats } from "./export/index.js";
import { formatBytes } from "./util.js";

function cwdFrom(value) {
  if (value === undefined || value === null) return undefined;
  const agent = value.agent;
  const session = value.session;
  const header = value.header;
  const sessionHeader = session !== undefined && session !== null ? session.header : undefined;
  const agentSession = agent !== undefined && agent !== null ? agent.session : undefined;
  const agentSessionHeader = agentSession !== undefined && agentSession !== null ? agentSession.header : undefined;
  const candidates = [
    sessionHeader !== undefined && sessionHeader !== null ? sessionHeader.cwd : undefined,
    agentSessionHeader !== undefined && agentSessionHeader !== null ? agentSessionHeader.cwd : undefined,
    agentSession !== undefined && agentSession !== null ? agentSession.cwd : undefined,
    header !== undefined && header !== null ? header.cwd : undefined,
    value.cwd,
  ];
  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate !== "") return candidate;
  }
  return undefined;
}

function papersText(value) {
  if (value.papers.length === 0) return "还没有论文。用 agent 的 paper_new 创建第一篇。";
  const lines = value.papers.map((paper) => {
    const drift = paper.drift ? "  DRIFT" : "";
    const words = paper.targetWords > 0 ? paper.words + "/" + paper.targetWords + "w" : paper.words + "w";
    return paper.docId + "  v" + paper.currentVersion + "  [" + (paper.stage || "idea") + "/" + paper.status + "]  " + words + drift + "  " + paper.title + "  (" + paper.versionCount + " versions, " + formatBytes(paper.bytes) + ")";
  });
  return value.papers.length + " 篇论文，根目录 " + value.root + "\n" + lines.join("\n");
}

const HELP = [
  "/paper                 列出论文与当前版本",
  "/paper list            同上",
  "/paper status          显示版本、字数和外部改动（DRIFT）",
  "/paper history <doc>   最近版本历史",
  "/paper check <doc>     写作阶段、字数与 7 项清单",
  "/paper export <doc> [html,docx,pdf]  导出指定论文的最新版本",
  "/paper import <doc> <file.docx> [--force]  把 Word 修改导入为新版本",
  "",
  "创建、写作、编辑、分叉请让 agent 使用 paper_new / paper_read / paper_write / paper_edit / paper_branch。",
].join("\n");

/** Register the human-facing /paper command. */
export function registerCommand(ctx, state) {
  ctx.commands.register({
    name: "paper",
    description: "List, inspect and export version-managed papers",
    input: { hint: "[list|status|history <doc>|export <doc> [html,docx,pdf]|import <doc> <file.docx>]" },
    async handler(invocation) {
      const input = String(invocation.rawInput ?? "").trim();
      const parts = input === "" ? [] : input.split(/\s+/);
      const action = (parts.shift() || "list").toLowerCase();
      const root = cwdFrom(invocation.agent) || state.config.workspaceRoot || process.cwd();
      const store = state.createStore(root);
      try {
        if (action === "help" || action === "-h" || action === "--help") {
          return { kind: "success", text: HELP };
        }
        if (action === "list" || action === "status") {
          const value = await store.list();
          return { kind: "success", text: papersText(value) };
        }
        if (action === "history") {
          const docId = parts[0];
          if (!docId) return { kind: "error", text: "用法：/paper history <doc>" };
          const value = await store.history({ docId, limit: 20 });
          const lines = value.versions.map((v) => v.id + "  " + v.createdAt + "  [" + v.source + "]  " + v.message);
          return { kind: "success", text: value.docId + " · " + value.title + " · current v" + value.currentVersion + "\n" + lines.join("\n") };
        }
        if (action === "check") {
          const docId = parts[0];
          if (!docId) return { kind: "error", text: "用法：/paper check <doc>" };
          const value = await store.check({ docId });
          const lines = value.checks.map((check) => "- [" + check.status + "] " + check.label + ": " + check.detail);
          return { kind: "success", text: value.docId + " · " + value.stageLabel + " · " + value.words + (value.targetWords > 0 ? "/" + value.targetWords : "") + " words · " + value.score + "/100\n" + lines.join("\n") };
        }
        if (action === "export") {
          const docId = parts[0];
          if (!docId) return { kind: "error", text: "用法：/paper export <doc> [html,docx,pdf]" };
          const formats = normalizeFormats(parts[1] ? parts[1].split(",") : undefined);
          const snapshot = await store.readVersionForExport(docId);
          const result = await exportPaper({
            root,
            docId,
            paperDir: path.dirname(store.docPath(docId)),
            config: state.config,
            meta: snapshot.meta,
            content: snapshot.content,
            formats,
          });
          await store.recordExport(docId, {
            version: snapshot.meta.version,
            id: snapshot.meta.id,
            dir: path.relative(root, result.dir).replace(/\\/g, "/"),
            formats: result.files.filter((file) => file.ok).map((file) => file.format),
            createdAt: new Date().toISOString(),
          });
          const lines = result.files.map((file) => file.format + ": " + (file.ok ? "ok  " + file.path + "  (" + formatBytes(file.bytes) + ")" : "FAILED  " + file.error));
          return { kind: "success", text: "导出 " + docId + " " + snapshot.meta.id + " -> " + result.dir + "\n" + lines.join("\n") };
        }
        if (action === "import") {
          const docId = parts[0];
          const filePath = parts[1];
          if (!docId || !filePath) return { kind: "error", text: "用法：/paper import <doc> <file.docx> [--force]" };
          const force = parts.includes("--force");
          const result = await store.importDocx({ docId, filePath, confirm: true, force });
          return { kind: "success", text: "导入 " + docId + " " + result.versionId + "  (+" + result.added + " -" + result.removed + ")\n" + (result.warnings.length > 0 ? result.warnings.map((warning) => "- " + warning).join("\n") : "") };
        }
        return { kind: "error", text: "未知子命令 \"" + action + "\"\n\n" + HELP };
      } catch (error) {
        return { kind: "error", text: error && error.message ? error.message : String(error) };
      }
    },
  });
}
