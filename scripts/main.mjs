import { createPublicApi } from "./api.mjs";
import { MODULE_ID } from "./constants.mjs";
import { ensureDefaultMacro } from "./macro.mjs";
import { NpcLogManager } from "./manager.mjs";
import { registerSettings } from "./settings.mjs";
import { registerUiHooks } from "./ui-hooks.mjs";

const manager = new NpcLogManager();

Hooks.once("init", () => {
  registerSettings();
  registerUiHooks(manager);

  const module = game.modules.get(MODULE_ID);
  if (module) module.api = createPublicApi(manager);
});

Hooks.once("ready", async () => {
  await manager.ensureConfiguredTargetVisibility();
  await ensureDefaultMacro();
});

export function getNpcLogManager() {
  return manager;
}
