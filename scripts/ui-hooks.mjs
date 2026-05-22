import { MODULE_ID, SETTINGS } from "./constants.mjs";
import { AddActorToNpcLogApp } from "./ui/add-actor-app.mjs";

export function registerUiHooks(manager) {
  const openAddActorApp = (actor, options = {}) => {
    if (!manager.canManage() || !actor) return;
    new AddActorToNpcLogApp({ actor, manager, ...options }).render(true);
  };
  const openControlledTokenActor = () => {
    const token = canvas.tokens?.controlled?.[0];
    const actor = token?.actor;
    if (!actor) {
      ui.notifications?.warn(game.i18n.localize("NPCLOG.Notifications.NoControlledToken"));
      return;
    }
    openAddActorApp(actor, { tokenDocument: token.document });
  };

  Hooks.on("getActorSheetHeaderButtons", (app, buttons) => {
    const actor = app.actor ?? app.document;
    if (!manager.canManage() || !(actor instanceof Actor)) return;
    addLegacyHeaderButton(buttons, actor, openAddActorApp);
  });

  Hooks.on("renderActorSheet", (app, html) => {
    const element = getHtmlElement(html);
    const actor = app.actor ?? app.document;
    if (!element || !manager.canManage() || !(actor instanceof Actor)) return;
    if (installHeaderMenuEntry(app, actor, openAddActorApp)) removeVisibleHeaderButton(element);
  });

  Hooks.on("renderActorSheetV2", (app, html) => {
    const element = getHtmlElement(html);
    const actor = app.actor ?? app.document;
    if (!element || !manager.canManage() || !(actor instanceof Actor)) return;
    if (installHeaderMenuEntry(app, actor, openAddActorApp)) removeVisibleHeaderButton(element);
  });

  const addActorDirectoryContextOption = (_app, options) => {
    const name = "NPCLOG.Actions.AddToNpcLog";
    if (options.some((option) => option.name === name)) return;

    options.push({
      name,
      icon: '<i class="fas fa-book"></i>',
      condition: () => manager.canManage(),
      callback: (entry) => {
        const actor = getActorFromDirectoryEntry(entry);
        if (!actor) {
          ui.notifications?.warn(game.i18n.localize("NPCLOG.Notifications.ActorMissing"));
          return;
        }
        openAddActorApp(actor);
      },
      group: "system"
    });
  };
  Hooks.on("getActorContextOptions", addActorDirectoryContextOption);
  Hooks.on("getActorDirectoryEntryContext", addActorDirectoryContextOption);

  Hooks.on("getSceneControlButtons", (controls) => {
    if (!manager.canManage() || !game.settings.get(MODULE_ID, SETTINGS.SHOW_TOKEN_CONTROL)) return;

    const tokenControls = getTokenControls(controls);
    if (!tokenControls) return;

    const addTool = {
      name: `${MODULE_ID}-add-controlled-token`,
      title: game.i18n.localize("NPCLOG.Controls.AddSelectedToken"),
      icon: "fas fa-book",
      visible: true,
      button: true,
      onClick: openControlledTokenActor
    };
    addSceneControlTool(tokenControls, addTool);
  });
}

function installHeaderMenuEntry(app, actor, openAddActorApp) {
  if (app[`_${MODULE_ID}HeaderMenuInstalled`]) return true;
  if (typeof app._getHeaderControlContextEntries !== "function") return false;

  const original = app._getHeaderControlContextEntries.bind(app);
  app._getHeaderControlContextEntries = function* npcLogHeaderControlContextEntries() {
    yield* original();
    yield {
      name: game.i18n.localize("NPCLOG.Actions.AddToNpcLog"),
      icon: '<i class="fas fa-book" inert></i>',
      callback: () => openAddActorApp(actor)
    };
  };
  app[`_${MODULE_ID}HeaderMenuInstalled`] = true;
  return true;
}

function addLegacyHeaderButton(buttons, actor, openAddActorApp) {
  const buttonClass = `${MODULE_ID}-add-to-log`;
  if (buttons.some((button) => button.class === buttonClass)) return;
  buttons.unshift({
    label: game.i18n.localize("NPCLOG.Actions.AddToNpcLog"),
    class: buttonClass,
    icon: "fas fa-book",
    onclick: () => openAddActorApp(actor)
  });
}

function removeVisibleHeaderButton(element) {
  element.querySelector(`.${MODULE_ID}-sheet-button, .${MODULE_ID}-add-to-log`)?.remove();
}

function getActorFromDirectoryEntry(entry) {
  const element = getHtmlElement(entry)?.closest?.("[data-document-id], [data-entry-id], [data-entity-id], [data-uuid]")
    ?? getHtmlElement(entry);
  const actorId = element?.dataset.documentId
    ?? element?.dataset.entryId
    ?? element?.dataset.entityId
    ?? element?.dataset.uuid
    ?? entry?.data?.("documentId")
    ?? entry?.data?.("entryId")
    ?? entry?.data?.("entityId")
    ?? entry?.data?.("uuid");
  if (!actorId) return null;
  return game.actors.get(actorId)
    ?? game.actors.get(actorId.replace(/^Actor\./, ""))
    ?? null;
}

function getHtmlElement(value) {
  if (value instanceof HTMLElement) return value;
  if (value?.[0] instanceof HTMLElement) return value[0];
  return null;
}

function getTokenControls(controls) {
  if (Array.isArray(controls)) return controls.find((control) => control.name === "token" || control.name === "tokens");
  return controls?.tokens ?? controls?.token ?? null;
}

function addSceneControlTool(control, tool) {
  if (!control.tools) control.tools = {};

  if (Array.isArray(control.tools)) {
    if (!control.tools.some((existing) => existing.name === tool.name)) control.tools.push(tool);
    return;
  }

  if (control.tools instanceof Map) {
    if (!control.tools.has(tool.name)) control.tools.set(tool.name, tool);
    return;
  }

  if (typeof control.tools === "object") control.tools[tool.name] ??= tool;
}
