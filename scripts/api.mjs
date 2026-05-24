import { AddActorToNpcLogApp } from "./ui/add-actor-app.mjs";

export function createPublicApi(manager) {
  return Object.freeze({
    addActorToNpcLog: (actor, options = {}) => manager.addActorToNpcLog(actor, options),
    addActorsToNpcLog: (entries, options = {}) => manager.addActorsToNpcLog(entries, options),
    openAddActorDialog: (input, options = {}) => openAddActorDialog(manager, input, options),
    getConfiguredTarget: () => manager.getConfiguredTarget(),
    ensureConfiguredTargetVisibility: () => manager.ensureConfiguredTargetVisibility(),
    canManage: (user = game.user) => manager.canManage(user)
  });
}

function openAddActorDialog(manager, input, options = {}) {
  if (!manager.canManage()) return null;
  const appOptions = normalizeDialogOptions(input, options);
  const app = new AddActorToNpcLogApp({ manager, ...appOptions });
  app.render(true);
  return app;
}

function normalizeDialogOptions(input, options) {
  if (Array.isArray(input)) return { ...options, entries: input };
  if (input?.entries) return { ...options, ...input };
  return { ...options, actor: input };
}
