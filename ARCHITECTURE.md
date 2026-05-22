# NPC Log Architecture

NPC Log follows a small Foundry VTT v13 module layout inspired by the Your Flavor module structure: a thin entrypoint, isolated settings registration, a manager for document behavior, ApplicationV2 UI classes, Handlebars templates, scoped styles, and language files.

## Runtime Flow

1. `scripts/main.mjs` registers settings and UI hooks during `init`.
2. `scripts/main.mjs` exposes a minimal API at `game.modules.get("npc-log").api`.
3. `scripts/main.mjs` applies journal visibility and creates the default macro during `ready`, when world documents are available.
4. `scripts/ui-hooks.mjs` adds GM-only entry points to actor sheets, Actor Directory context menus, and Token Controls.
5. `scripts/ui/add-actor-app.mjs` collects add-card options and persists the most recent user choices.
6. `scripts/manager.mjs` resolves actors, images, journals, and pages, then appends or replaces one owned HTML block.

## File Responsibilities

- `scripts/constants.mjs` - stable IDs, setting keys, choices, template paths.
- `scripts/settings.mjs` - Foundry setting and settings-menu registration.
- `scripts/manager.mjs` - core journal-writing behavior and actor data extraction.
- `scripts/api.mjs` - public API wrapper with no mutable internals exposed.
- `scripts/ui-hooks.mjs` - Foundry hook integration and DOM-safe sheet/menu insertion.
- `scripts/ui/*.mjs` - ApplicationV2 windows.
- `templates/*.hbs` - UI markup only; no business logic.
- `styles/npc-log.css` - scoped UI and journal-card styling.
- `languages/*.json` - visible strings.

## Design Decisions

- **No libWrapper**: current hooks are enough, and avoiding a dependency keeps installation simple.
- **GM-only writes**: actions are hidden for players and rechecked by `NpcLogManager.canManage`.
- **Player visibility without writes**: the optional share setting grants Observer ownership on the target journal while write actions remain GM-only.
- **System-agnostic first**: actor metadata is optional and guarded. Unsupported systems still work with name, image, and description.
- **Append, do not replace page content**: the manager appends an owned card block and only replaces blocks marked with this module's actor UUID attribute.
- **Small API surface**: macros get `addActorToNpcLog`, `getConfiguredTarget`, and `canManage`.
- **Scoped CSS**: UI styles use `.npc-log`, and journal-card styles use `.npc-log-npc-entry`.

## Extension Points

- Add a new system metadata extractor in `NpcLogManager.#getSystemMetaSettings` and the matching label helpers.
- Add new card layouts through `CARD_STYLES`, `#renderNpcBlock`, and scoped CSS.
- Add additional add-dialog options in `AddActorToNpcLogApp`, then pass normalized values to `NpcLogManager.addActorToNpcLog`.

## Packaging Note

The package id is `npc-log`. Keep the module directory name, manifest id, public API examples, and release archive name aligned with that id.
