export const SKILL_NAME = "paper-writing";

export const SKILL_CONTENT = `# 论文写作与版本管理（dsh-paper）

## 何时使用

当任务涉及论文、白皮书、研究报告、综述、技术文档的创作、修改、分叉或发布时，使用本 skill。所有论文源文件都在工作区的 \`papers/<docId>/<docId>.md\`，由 dsh-paper 插件强制做版本管理。

## 不能做的事

- **不要**用 \`write\`、\`edit\` 或 \`str_replace_editor\` 直接改 \`papers/**/<docId>.md\` 或 \`papers/.paper/**\`。守卫会拒绝，并提示改用 paper_* 工具。
- **不要**在没有 \`message\` 的情况下写入；每次变更都必须说明“为什么”。
- **不要**试图覆盖历史版本；历史是只追加的。回退用 \`paper_restore\`，它会生成一个新版本。

## 工具速查

| 工具 | 用途 |
|---|---|
| \`paper_new\` | 新建论文，写入 v000001；可带 stage/targetWords/question/nextAction |
| \`paper_list\` | 列出论文、当前版本、阶段、字数/目标、清单分、是否 DRIFT |
| \`paper_brief\` | 更新写作简报（stage/question/targetWords/nextAction/deadline），生成版本 |
| \`paper_check\` | 写作清单：问题、标题、摘要、结构、字数、TODO、下一步 |
| \`paper_read\` | 读当前/历史版本，或单节；\`brief:true\` 只回元数据+目录 |
| \`paper_write\` | 整体替换正文，生成新版本 |
| \`paper_edit\` | 精确替换一段或多段文字，生成新版本 |
| \`paper_history\` | 版本历史（id、时间、message、source、hash） |
| \`paper_diff\` | 两个版本的 unified diff |
| \`paper_restore\` | 把旧版本恢复为新版本 |
| \`paper_branch\` | 从一个论文/版本分化出 1..N 个独立分支论文 |
| \`paper_export\` | 导出 html/docx/pdf，产物绑定版本；\`watch:true\` 监听 DOCX |
| \`paper_sync_docx\` | 立即把 watch 的待同步 Word 保存写成版本 |
| \`paper_unwatch_docx\` | 停止监听 Word 文件 |
| \`paper_import_docx\` | 把编辑过的 Word 转回 Markdown，预览 diff，再确认成新版本 |

## 标准写作流程

1. 先 \`paper_list\` 看是否已有同名论文；没有就 \`paper_new\`。
2. 用 \`paper_read\` 读现状；上下文被压缩或接手别人的工作时用 \`paper_read({ docId, brief: true })\`。
3. 小改动优先 \`paper_edit\`，大改/重构用 \`paper_write\`。两者都必须带 \`message\`。
4. 每完成一个逻辑单元（一节、一次修订、一轮审稿意见）就提交一个版本，不要攒成一次巨大的写入。
5. 用 \`paper_diff\` 自检；确认后用 \`paper_export\` 发布。
6. 需要多个主题并行时用 \`paper_branch\`，不要复制粘贴文件。

### 先写出来模式

目标是形成完整初稿，不追求投稿合规：

1. 用 \`paper_new\` 创建，或 \`paper_brief\` 设置 \`question\`、\`targetWords\`、\`nextAction\`、\`deadline\`、\`stage\`。
2. 阶段：\`idea → outline → drafting → revising → done\`；每次推进用 \`paper_brief({ docId, stage })\`，会生成 \`paper_stage\` 版本。
3. 每写完一节用 \`paper_edit\` 提交；不要等全文完成。
4. 用 \`paper_check\` 看 7 项清单；它只提示，不阻止导出。
5. 完成标准：能从头读到尾，问题/摘要/结构/下一步清楚，所有改动可追溯。

注意：\`status\` 是发布生命周期，\`stage\` 是写作阶段，两者分开。

## 版本 message 的写法

message 是给未来的自己和审稿人看的，不是 "update"。建议格式：

- \`Add related work on retrieval-augmented generation\`
- \`Revise Section 3.2: clarify the ablation protocol\`
- \`Restore v000004 after rejecting the restructure\`
- \`Split evaluation into a separate benchmark paper\`

## 论文 Markdown 约定

- 文件开头是 YAML front matter：
  \`\`\`markdown
  ---
  paper: my-paper
  title: 论文标题
  subtitle: 可选副标题
  authors:
    - 张三
    - 李四
  status: draft
  stage: drafting
  targetWords: 6000
  question: 这篇论文要回答的一个问题是什么？
  nextAction: 补完方法节的实验设置
  deadline: 2026-11-30
  stage: drafting
  targetWords: 6000
  question: 这篇论文要回答的一个问题是什么？
  nextAction: 补完方法节的实验设置
  deadline: 2026-11-30
  keywords:
    - 关键词
  language: zh-CN
  createdAt: 2026-10-19T00:00:00.000Z
  updatedAt: 2026-10-19T00:00:00.000Z
  ---
  \`\`\`
- 正文第一个标题必须是唯一的 H1：\`# 论文标题\`。
- 章节用 H2/H3；插件会从标题生成目录和 DOCX 样式。标题可以自带编号（\`## 1 引言\`），也可以不写编号（导出时 HTML 自动编号）。
- 图片用相对路径：\`![图 1 系统架构](figures/architecture.png)\`。HTML/PDF 会内嵌为 data URI，DOCX 会嵌入原图。
- 表格用 GFM 表格；导出时保留。
- 公式先写成文本或代码块；当前基础版不渲染 LaTeX。
- 参考文献用普通列表或 H2 章节；当前基础版不做 BibTeX 解析。

## 分叉成多个主题

典型场景：一篇大论文演化出多个可独立成文的方向。

\`\`\`json
{
  "from": "main-survey",
  "fromVersion": "3",
  "branches": [
    { "title": "Retrieval-Augmented Generation: A Focused Review", "slug": "rag-review", "sections": ["2 Background", "3.1 RAG"] },
    { "title": "Evaluation Protocols for RAG", "slug": "rag-evaluation", "sections": ["4 Evaluation"] }
  ]
}
\`\`\`

- \`mode:"excerpt"\`（默认，当提供 sections 时）：保留 H1 与摘要区，加上选中的章节及其子章节。
- \`mode:"full"\`：整篇复制后再改。
- 每个分支是独立论文，v000001 开始；父论文的 \`lineage.children\` 和新论文的 \`lineage.parents\` 都会记录血缘。
- 章节选择器可以是编号（\`2.1\`）或标题文本（\`Methods\`）；歧义/找不到会报错并列出可选章节。

## 发布导出

\`\`\`json
{ "docId": "main-survey", "version": "latest", "formats": ["html", "docx", "pdf"] }
\`\`\`

- 产物目录：\`exports/<docId>/<versionId>/<docId>-<versionId>.html|<docId>-<versionId>.docx|<docId>-<versionId>.pdf\`，另有 \`manifest.json\` 记录版本哈希。
- PDF 用本机 Chrome/Edge 的 headless print-to-PDF；找不到浏览器时 HTML 和 DOCX 仍会生成，PDF 会报告失败原因。
- 同一版本重复导出会覆盖同目录产物，不改变源版本。
- 发布时通常先 \`paper_write\` 把 \`status\` 改成 \`published\`，再导出。

## Word 回写

Markdown 仍是唯一真源，DOCX 是派生产物。需要在 Word 里改时，按回写流程走：

1. \`paper_export({ docId, formats:["docx"] })\` 导出某个版本；文件名带 \`v000123\`。
2. 在 Word 里编辑并保存，**不要直接覆盖** \`papers/<docId>/<docId>.md\`。
3. \`paper_import_docx({ docId, path, confirm:false })\` 先看预览：转换后的 Markdown、diff、图片、警告。
4. 确认后再次调用 \`confirm:true\`，写入 \`source:"docx_import"\` 的新版本；原 Word 文件保留为外部副本。
5. 如果论文在导出后又前进过，导入会报冲突；先重新导出最新版再改，或审阅 diff 后用 \`force:true\`。

### 自动回写

- \`paper_export({ docId, formats:["docx"], watch:true })\` 会监听导出的 DOCX；保存只标记 \`pending\`，默认安静 5 分钟后才合并提交一个 \`docx_import\` 版本。
- \`watchSync:"manual"\` 时只在 \`paper_sync_docx\` 或 \`/paper sync <doc>\` 时提交；\`watchSync:"immediate"\` 才每次保存都提交。
- 冲突时 watch 状态变为 \`conflict\`，不会覆盖较新的源；自动回写不会反向重写 DOCX，不会形成循环。
- 发布产物 \`exports/<docId>/<versionId>/\` 是只读快照；建议复制到 \`papers/<docId>/work/\` 再编辑。

限制：Word 批注、修订痕迹、复杂公式、文本框、页眉页脚不会完整转换；导入前必须看 diff。图片会复制到 \`papers/<docId>/assets/\`。

## 外部改动与 DRIFT

- 如果有人用编辑器或 shell 直接改了 \`<docId>.md\`，\`paper_list\` 会显示 \`DRIFT\`。
- 下一次 \`paper_read\` / \`paper_write\` / \`paper_export\` 会把外部内容自动采纳为一个新版本（source: external），不会丢内容。
- 如果 \`autoAdoptExternal\` 被关闭，写入类操作会直接拒绝，要求先显式处理。

## 常见失败与处理

- **direct write denied**：改用 \`paper_edit\` 或 \`paper_write\`。
- **no section matches**：用 \`paper_read({ brief:true })\` 看准确的章节编号/标题。
- **ambiguous section**：改用编号（如 \`2.1\`）而不是模糊标题。
- **PDF browser not found**：设置 \`export.pdf.browserPath\` 指向 chrome.exe/msedge.exe，或安装 Edge/Chrome。
- **version does not exist**：用 \`paper_history\` 看有效版本范围。
`;

/** Register the model-facing paper-writing skill. */
export function registerSkill(ctx) {
  ctx.skills.register({
    name: SKILL_NAME,
    description: "Version-managed Markdown paper writing: create, edit, diff, restore, branch into topic papers, export HTML/DOCX/PDF, and round-trip Word edits.",
    whenToUse: "Use when writing, revising, splitting, versioning, publishing, or importing Word edits for a paper or research document in this workspace.",
    content: SKILL_CONTENT,
    source: "plugin:dsh-paper",
    invocation: { modelInvocable: true, userInvocable: true },
  });
}