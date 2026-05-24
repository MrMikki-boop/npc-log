import { ACTOR_SHEET_BUTTON_STYLES, MODULE_ID, SETTINGS } from "./constants.mjs";
import { AddActorToNpcLogApp } from "./ui/add-actor-app.mjs";

export function registerUiHooks(manager) {
  const openAddActorApp = (actor, options = {}) => {
    if (!manager.canManage() || !actor) return;
    new AddActorToNpcLogApp({ actor, manager, ...options }).render(true);
  };
  const openAddActorEntriesApp = (entries) => {
    const validEntries = entries.filter((entry) => entry.actor);
    if (!manager.canManage() || !validEntries.length) return;
    if (validEntries.length === 1) {
      const [entry] = validEntries;
      openAddActorApp(entry.actor, { tokenDocument: entry.tokenDocument });
      return;
    }
    new AddActorToNpcLogApp({ manager, entries: validEntries }).render(true);
  };
  const openControlledTokenActor = () => {
    const entries = getControlledTokenEntries();
    if (!entries.length) {
      ui.notifications?.warn(game.i18n.localize("NPCLOG.Notifications.NoControlledToken"));
      return;
    }
    openAddActorEntriesApp(entries);
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
    installActorSheetControl(app, element, actor, openAddActorApp);
  });

  Hooks.on("renderActorSheetV2", (app, html) => {
    const element = getHtmlElement(html);
    const actor = app.actor ?? app.document;
    if (!element || !manager.canManage() || !(actor instanceof Actor)) return;
    installActorSheetControl(app, element, actor, openAddActorApp);
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
    if (getActorSheetButtonStyle() === ACTOR_SHEET_BUTTON_STYLES.ICON) return;
    yield {
      name: game.i18n.localize("NPCLOG.Actions.AddToNpcLog"),
      icon: '<i class="fas fa-book" inert></i>',
      callback: () => openAddActorApp(actor)
    };
  };
  app[`_${MODULE_ID}HeaderMenuInstalled`] = true;
  return true;
}

function installActorSheetControl(app, element, actor, openAddActorApp) {
  if (getActorSheetButtonStyle() === ACTOR_SHEET_BUTTON_STYLES.ICON) {
    if (!applyLegacyHeaderButtonStyle(element)) addHeaderIconButton(app, element, actor, openAddActorApp);
    return;
  }

  removeHeaderIconButton(element);
  if (installHeaderMenuEntry(app, actor, openAddActorApp)) removeVisibleHeaderButton(element);
  else applyLegacyHeaderButtonStyle(element);
}

function addLegacyHeaderButton(buttons, actor, openAddActorApp) {
  const buttonClass = `${MODULE_ID}-add-to-log`;
  if (buttons.some((button) => String(button.class ?? "").split(/\s+/).includes(buttonClass))) return;
  const label = game.i18n.localize("NPCLOG.Actions.AddToNpcLog");
  const compact = getActorSheetButtonStyle() === ACTOR_SHEET_BUTTON_STYLES.ICON;
  buttons.unshift({
    label: compact ? "" : label,
    class: `${buttonClass}${compact ? ` ${buttonClass}--icon` : ""}`,
    icon: "fas fa-book",
    title: label,
    onclick: () => openAddActorApp(actor)
  });
}

function removeVisibleHeaderButton(element) {
  element.querySelector(`.${MODULE_ID}-sheet-button, .${MODULE_ID}-add-to-log`)?.remove();
}

function getActorSheetButtonStyle() {
  const value = game.settings.get(MODULE_ID, SETTINGS.ACTOR_SHEET_BUTTON_STYLE);
  return Object.values(ACTOR_SHEET_BUTTON_STYLES).includes(value) ? value : ACTOR_SHEET_BUTTON_STYLES.FULL;
}

function applyLegacyHeaderButtonStyle(element) {
  const button = element.querySelector(`.${MODULE_ID}-add-to-log`);
  if (!button) return false;

  const label = game.i18n.localize("NPCLOG.Actions.AddToNpcLog");
  button.dataset.tooltip = label;
  button.setAttribute("aria-label", label);
  button.title = label;

  if (getActorSheetButtonStyle() !== ACTOR_SHEET_BUTTON_STYLES.ICON) return true;

  button.classList.add(`${MODULE_ID}-add-to-log--icon`);
  for (const node of Array.from(button.childNodes)) {
    if (node.nodeType === Node.TEXT_NODE) node.textContent = "";
  }
  return true;
}

function addHeaderIconButton(app, element, actor, openAddActorApp) {
  const header = getApplicationHeader(app, element);
  if (!header || header.querySelector(`.${MODULE_ID}-sheet-icon-button`)) return;

  const label = game.i18n.localize("NPCLOG.Actions.AddToNpcLog");
  const button = document.createElement("button");
  button.type = "button";
  button.classList.add("header-control", `${MODULE_ID}-sheet-icon-button`);
  button.dataset.tooltip = label;
  button.setAttribute("aria-label", label);
  button.innerHTML = '<i class="fas fa-book" inert></i>';
  button.addEventListener("click", (event) => {
    event.preventDefault();
    openAddActorApp(actor);
  });

  const close = header.querySelector('[data-action="close"], .close');
  header.insertBefore(button, close ?? null);
}

function removeHeaderIconButton(element) {
  const root = element.closest?.(".app, .application, .window-app") ?? element;
  root.querySelector?.(`.${MODULE_ID}-sheet-icon-button`)?.remove();
}

function getApplicationHeader(app, element) {
  return app?.element?.querySelector?.(".window-header")
    ?? element.closest?.(".app, .application, .window-app")?.querySelector?.(".window-header")
    ?? element.querySelector?.(".window-header")
    ?? null;
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

function getControlledTokenEntries() {
  return dedupeTokenEntries([
    ...(canvas.tokens?.controlled ?? []).map((token) => ({
      actor: token.actor,
      tokenDocument: token.document
    })),
    ...getOpenTokenConfigEntries()
  ]);
}

function getOpenTokenConfigEntries() {
  return getOpenApplications()
    .map((app) => getTokenDocumentFromApplication(app))
    .filter((document) => document?.actor)
    .map((document) => ({
      actor: document.actor,
      tokenDocument: document
    }));
}

function getOpenApplications() {
  const applications = Object.values(ui.windows ?? {});
  const instances = foundry.applications?.instances;
  if (instances instanceof Map) applications.push(...instances.values());
  else if (instances && typeof instances === "object") applications.push(...Object.values(instances));
  return applications.filter((app) => app?.rendered !== false);
}

function getTokenDocumentFromApplication(app) {
  const candidates = [
    app?.document,
    app?.object,
    app?.token,
    app?.token?.document
  ];
  return candidates.find((candidate) => isTokenDocument(candidate)) ?? null;
}

function isTokenDocument(value) {
  return (globalThis.TokenDocument && value instanceof TokenDocument) || value?.documentName === "Token";
}

function dedupeTokenEntries(entries) {
  const seen = new Set();
  const deduped = [];
  for (const entry of entries) {
    if (!entry.actor) continue;
    const key = entry.tokenDocument?.uuid ?? entry.actor.uuid;
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(entry);
  }
  return deduped;
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
