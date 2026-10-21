export const SECTION_NAME = "paper:policy";

export const SECTION_TEXT = `## 论文工作区（dsh-paper）

本工作区的论文是版本受管对象，源文件位于 \`papers/<docId>/<docId>.md\`。

先写出来模式：\`stage\`（idea/outline/drafting/revising/done）表示写作阶段，\`status\` 表示发布生命周期；用 \`paper_brief\` 维护 question/targetWords/nextAction/deadline，用 \`paper_check\` 查看写作清单。清单只提示，不阻止导出。

硬规则：
1. **不要**用 \`write\` / \`edit\` / \`str_replace_editor\` 修改 \`papers/**/<docId>.md\` 或 \`papers/.paper/**\`；插件守卫会拒绝。写作用 \`paper_write\` 或 \`paper_edit\`。
2. 每次内容变更都必须给出有意义的 \`message\`；插件自动创建不可变版本。历史不可改写；回退用 \`paper_restore\`（生成新版本）。
3. 动手前用 \`paper_read\`（\`brief:true\` 适合续写/恢复上下文），用 \`paper_history\` 与 \`paper_diff\` 审计演进。
4. 需要把论文分化成多个主题时用 \`paper_branch\`：\`mode:"excerpt"\` 按章节选择，\`mode:"full"\` 整体复制；每个分支是独立论文并记录血缘。
5. 发布用 \`paper_export\` 生成 html/docx/pdf；产物按版本存放在 \`exports/<docId>/<versionId>/\`，与源版本哈希绑定。
6. \`paper_list\` 中的 \`DRIFT\` 表示 <docId>.md 被外部改过、尚未纳入版本；下一次读写会自动采纳。
7. 用户在 Word 里改过 DOCX 时，用 \`paper_import_docx\` 先 \`confirm:false\` 预览 diff，再 \`confirm:true\` 写成新版本；不要直接把 DOCX 内容粘回 Markdown 覆盖历史。若论文已前进过，需 \`force:true\` 且先审阅 diff。

详细工作流见 \`paper-writing\` skill。`;

/** Register the always-on paper policy section. */
export function registerPrompt(ctx) {
  ctx.systemPrompt.section({
    name: SECTION_NAME,
    order: 12000,
    text: SECTION_TEXT,
    interpolate: false,
  });
}