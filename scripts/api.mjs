export function createPublicApi(manager) {
  return Object.freeze({
    addActorToNpcLog: (actor, options = {}) => manager.addActorToNpcLog(actor, options),
    getConfiguredTarget: () => manager.getConfiguredTarget(),
    ensureConfiguredTargetVisibility: () => manager.ensureConfiguredTargetVisibility(),
    canManage: (user = game.user) => manager.canManage(user)
  });
}
