import { IMAGE_MODES, MODULE_ID, SETTINGS } from "./constants.mjs";

const MANAGED_MACRO_FLAG = "managedDefaultMacro";

export async function ensureDefaultMacro() {
  if (!game.user?.isGM) return null;

  const command = getDefaultMacroCommand();
  const existingUuid = game.settings.get(MODULE_ID, SETTINGS.DEFAULT_MACRO_UUID);
  const existing = await safeFromUuid(existingUuid);
  if (existing instanceof Macro) {
    if (isManagedDefaultMacro(existing)) return syncDefaultMacro(existing, command);
    return existing;
  }

  const name = game.i18n.localize("NPCLOG.Macro.AddSelectedToken.Name");
  const sameName = game.macros?.find((macro) => macro.name === name && isManagedDefaultMacro(macro));
  if (sameName) {
    await syncDefaultMacro(sameName, command);
    await game.settings.set(MODULE_ID, SETTINGS.DEFAULT_MACRO_UUID, sameName.uuid);
    return sameName;
  }

  const macro = await Macro.create({
    name,
    type: "script",
    img: "icons/svg/book.svg",
    command,
    flags: {
      [MODULE_ID]: {
        [MANAGED_MACRO_FLAG]: true
      }
    }
  });

  if (macro) {
    await game.settings.set(MODULE_ID, SETTINGS.DEFAULT_MACRO_UUID, macro.uuid);
    ui.notifications?.info(game.i18n.localize("NPCLOG.Notifications.DefaultMacroCreated"));
  }
  return macro;
}

async function syncDefaultMacro(macro, command) {
  const update = {};
  if (macro.img !== "icons/svg/book.svg") update.img = "icons/svg/book.svg";
  if (macro.command !== command) update.command = command;
  if (Object.keys(update).length) await macro.update(update);
  return macro;
}

function isManagedDefaultMacro(macro) {
  return macro?.getFlag?.(MODULE_ID, MANAGED_MACRO_FLAG) === true;
}

function getDefaultMacroCommand() {
  return `const token = canvas.tokens?.controlled?.[0];
if (!token?.actor) {
  ui.notifications.warn(game.i18n.localize("NPCLOG.Notifications.NoControlledToken"));
} else {
  await game.modules.get("${MODULE_ID}").api.addActorToNpcLog(token.actor, {
    tokenDocument: token.document,
    imageMode: "${IMAGE_MODES.TOKEN}",
    replaceExisting: true
  });
}`;
}

async function safeFromUuid(uuid) {
  if (!uuid) return null;
  try {
    return await fromUuid(uuid);
  } catch {
    return null;
  }
}
