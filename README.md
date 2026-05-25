# NPC Log

NPC Log is a Foundry VTT v13 module for keeping important NPCs visible during play. A GM can add an Actor to a configured journal page in a few clicks, preserving the actor name, portrait or token image, a short editable description, and optional system-aware details.

The module is system-agnostic by default and includes small integrations for common actor data in Dungeons & Dragons Fifth Edition and Pathfinder Second Edition. Unsupported or missing fields are ignored safely.

## Features

- Add an NPC from an Actor sheet header menu.
- Add an NPC from the Actor Directory context menu.
- Open the add dialog from Token Controls or the default macro for one or more selected tokens.
- Review grouped batch selections before saving.
- Choose portrait art or token art.
- Add or edit a short description before saving.
- Add reusable additional fields per card, including system fields, token relationship, custom labels, actor-data paths, and custom dropdowns.
- Append cards to a configured JournalEntryPage without replacing unrelated page content.
- Create a new journal page directly from the add dialog.
- Link each card name back to its source Actor, with long bilingual names shortened before ` / ` on the card.
- Update an existing NPC card instead of creating obvious duplicates.
- Choose a full or icon-only actor sheet button.
- Automatically create the default journal and page when enabled.
- Keep GM-only actions hidden from players.
- Localized English and Russian UI strings.

## Usage

1. Enable the module in your world.
2. Open **Configure Settings > NPC Log > Configure**.
3. Choose the target journal and text page, or leave them empty and keep automatic creation enabled.
4. Right-click an actor in the Actor Directory, use the actor sheet header menu, or select token(s) and use the Token Controls button or bundled macro.
5. Review the image, target page, fields, and description, then save.

## Installation

Use this manifest URL in Foundry VTT:

```text
https://github.com/MrMikki-boop/npc-log/releases/latest/download/module.json
```

## Settings

NPC Log uses two layers of settings:

- **General module settings**: defaults that should be easy to find in Foundry settings, such as image mode, card style, image size, frame style, automatic creation, player visibility, sheet button style, and Token Controls visibility.
- **NPC Log Configure menu**: workflow settings for the journal target and advanced behavior, such as duplicate handling and additional fields.

Advanced settings are hidden behind a single checkbox so the basic workflow stays compact.

Custom field paths are resolved against `actor.system` first, so `details.race` works for `actor.system.details.race`. Prefixes like `system.details.race`, `actor.name`, `npc.bio.exp`, or `character.race` are also accepted where the underlying system data exists.

## Public API

Macros and other modules can use the public API:

```js
const api = game.modules.get("npc-log").api;
await api.addActorToNpcLog(actor, {
  imageMode: "token",
  replaceExisting: true
});
```

Available methods:

- `addActorToNpcLog(actorOrId, options)` - add or update an NPC card.
- `addActorsToNpcLog(entries, options)` - add or update multiple cards with one journal page update.
- `openAddActorDialog(actorOrOptions, options)` - open the "Add to Journal" dialog from a macro or another module.
- `getConfiguredTarget()` - resolve the configured journal and page.
- `ensureConfiguredTargetVisibility()` - apply the configured player visibility policy to the current target journal.
- `canManage(user)` - check whether a user may manage the NPC log.

Useful `addActorToNpcLog` options:

- `imageMode`: `"portrait"` or `"token"`.
- `cardStyle`: `"portrait"`, `"compact"`, or `"gallery"`.
- `cardImageSize`: `"small"`, `"medium"`, or `"large"`.
- `cardFrame`: `"standard"`, `"soft"`, or `"none"`.
- `journalUuid` / `pageUuid`: override the configured target.
- `createPage`: create a new text page in the selected journal.
- `pageName`: name used with `createPage`.
- `description`: override the suggested description.
- `includeDescription`: set to `false` to save the card without a description block.
- `customFields`: custom metadata fields to render on the card. Checkbox fields render as labels; text/path and select fields render as `Label: value`.
- `customFieldDefinitionIds`: fields currently defined in settings, used to remove unchecked fields during single-card updates.
- `replaceExisting`: update an existing card for the same actor.
- `preventDuplicates`: skip adding when the actor already exists.
- `openAfterSave`: open the target journal after saving.
- `notify`: set to `false` to suppress module notifications for scripted flows.

Useful `addActorsToNpcLog` entries:

```js
await api.addActorsToNpcLog([
  { actor, tokenDocument: token.document }
], {
  imageMode: "token",
  replaceExisting: true
});
```

To open the same dialog used by the module UI:

```js
const entries = canvas.tokens.controlled.map((token) => ({
  actor: token.actor,
  tokenDocument: token.document
})).filter((entry) => entry.actor);

game.modules.get("npc-log").api.openAddActorDialog({ entries });
```

## Player Visibility

When **Share NPC journal with players** is enabled, the module sets the target journal's default ownership to Observer. Players can read the journal, but only GMs can add or update NPC cards through module actions or the public API.

## Compatibility

- Foundry VTT: v13
- Systems: system-agnostic
- Tested design targets: Dungeons & Dragons Fifth Edition, Pathfinder Second Edition, Legends of the Mist

## Development Notes

The implementation avoids libWrapper and other runtime dependencies. It uses Foundry hooks, ApplicationV2, Handlebars templates, DOM APIs, scoped CSS, and a small public API. See [ARCHITECTURE.md](ARCHITECTURE.md) for implementation notes.

## Development Smoke Check

Before release, run a quick in-Foundry smoke pass:

1. Create or pick three actors with different names and images.
2. Select their tokens and open the bundled **Add Selected Token(s) to Journal** macro.
3. Save them once with **Gallery** and description disabled, then confirm the journal page updates once with a single summary notification.
4. Add one actor again with duplicate handling set to update, then add it again as a copy.
5. Add custom fields covering a simple label, a path such as `details.race`, and a comma-separated dropdown.
6. Confirm old cards still update without losing their description or saved custom fields.

## Release

Releases are published from version tags. Update `module.json` version and `download`, commit the change, then push a matching tag:

```bash
git tag v1.0.0
git push origin v1.0.0
```

Before publishing, validate JSON, check `.mjs` syntax, build `npc-log.zip`, and upload both `npc-log.zip` and `module.json` to the GitHub Release.

## License

MIT License. See [LICENSE](LICENSE).
