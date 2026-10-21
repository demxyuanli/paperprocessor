import path from "node:path";

import { isInside } from "./util.js";

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

/**
 * Install the monotonic gate that keeps built-in write/edit tools away from
 * version-managed sources. This is what makes versioning "forced" for the
 * normal tool path; the paper_* tools write through the store instead.
 */
export function installGuard(ctx, state) {
  ctx.tools.guard((exec) => {
    if (state.config.allowDirectWrites) return undefined;
    const name = exec && exec.name;
    if (name !== "write" && name !== "edit" && name !== "str_replace_editor") return undefined;
    const args = exec.arguments !== null && typeof exec.arguments === "object" ? exec.arguments : {};
    const file = typeof args.file_path === "string" ? args.file_path : (typeof args.path === "string" ? args.path : null);
    if (file === null || file === "") return undefined;
    const root = cwdFrom(exec) || state.config.workspaceRoot || process.cwd();
    const papersRoot = path.resolve(root, state.config.papersDir);
    const abs = path.isAbsolute(file) ? path.resolve(file) : path.resolve(root, file);
    if (!isInside(papersRoot, abs)) return undefined;
    const relative = path.relative(papersRoot, abs);
    const normalized = relative.split(path.sep).join("/");
    if (normalized === ".paper" || normalized.startsWith(".paper/")) {
      return "Version metadata is managed by the paper plugin and cannot be edited directly. Use paper_history, paper_diff or paper_export.";
    }
    const base = path.basename(abs).toLowerCase();
    const parent = path.basename(path.dirname(abs)).toLowerCase();
    if (base === "paper.md" || base === parent + ".md") {
      return "Direct writes to the version-managed paper entry file are blocked. Use paper_write (full replacement) or paper_edit (targeted replacement) with a change message; every accepted change becomes an immutable version.";
    }
    return undefined;
  });
}
