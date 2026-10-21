import { resolveConfig } from "./lib/config.js";
import { PaperStore } from "./lib/store.js";
import { toolDefinitions } from "./lib/tools.js";
import { installGuard } from "./lib/guard.js";
import { registerCommand } from "./lib/command.js";
import { registerSkill } from "./lib/skill.js";
import { registerPrompt } from "./lib/prompt.js";
import { createPaperWebHandler } from "./lib/web.js";
import { DocxWatchManager } from "./lib/watch.js";

export const name = "paper";

/**
 * dsh-paper host entry.
 *
 * Versioned Markdown papers live under papers/<docId>/<docId>.md; every write
 * creates an immutable snapshot, and publication formats are rendered from a
 * specific snapshot. The plugin exposes paper_* tools, a /paper command, an
 * always-on policy section, and an embedded paper-writing skill.
 */
export function apply(ctx, rawConfig) {
  const config = resolveConfig(rawConfig);
  const state = {
    config,
    stores: new Map(),
    startTurnCooldown: new Map(),
    watchers: new DocxWatchManager({ logger: ctx.logger }),
    createStore(root) {
      return new PaperStore({ root, config, logger: ctx.logger });
    },
  };

  ctx.inject(["tools"], (toolCtx) => {
    for (const definition of toolDefinitions(state)) toolCtx.tools.register(definition);
    installGuard(toolCtx, state);
  });

  ctx.inject(["webServer"], (webCtx) => {
    const handler = createPaperWebHandler(webCtx, state);
    webCtx.effect(() => webCtx.webServer.register({ kind: "prefix", path: "/paper", handler }), "paper: audit routes");
  });

  ctx.inject(["commands"], (commandCtx) => registerCommand(commandCtx, state));
  ctx.inject(["skills"], (skillCtx) => registerSkill(skillCtx));
  ctx.inject(["systemPrompt"], (promptCtx) => registerPrompt(promptCtx));

  ctx.effect(() => () => state.watchers.stopAll(), "paper: docx watcher cleanup");

  console.log("[dsh-paper] ready; papers under " + config.papersDir + "/<docId>/<docId>.md, exports under " + config.exportsDir + "/");
}