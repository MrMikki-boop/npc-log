export const MODULE_ID = "npc-log";

export const IMAGE_MODES = Object.freeze({
  PORTRAIT: "portrait",
  TOKEN: "token"
});

export const CARD_STYLES = Object.freeze({
  PORTRAIT: "portrait",
  COMPACT: "compact",
  GALLERY: "gallery"
});

export const CARD_IMAGE_SIZES = Object.freeze({
  SMALL: "small",
  MEDIUM: "medium",
  LARGE: "large"
});

export const CARD_FRAMES = Object.freeze({
  STANDARD: "standard",
  SOFT: "soft",
  NONE: "none"
});

export const DUPLICATE_MODES = Object.freeze({
  UPDATE: "update",
  SKIP: "skip",
  COPY: "copy"
});

export const SETTINGS = Object.freeze({
  TARGET_JOURNAL_UUID: "targetJournalUuid",
  TARGET_PAGE_UUID: "targetPageUuid",
  IMAGE_MODE: "imageMode",
  CARD_STYLE: "cardStyle",
  CARD_IMAGE_SIZE: "cardImageSize",
  CARD_FRAME: "cardFrame",
  SHOW_IMAGE_SIZE_IN_ADD_DIALOG: "showImageSizeInAddDialog",
  DUPLICATE_MODE: "duplicateMode",
  ADVANCED_SETTINGS_ENABLED: "advancedSettingsEnabled",
  INCLUDE_META_TYPE: "includeMetaType",
  INCLUDE_META_LEVEL: "includeMetaLevel",
  INCLUDE_META_CR: "includeMetaCr",
  INCLUDE_META_RARITY: "includeMetaRarity",
  INCLUDE_META_TRAITS: "includeMetaTraits",
  AUTO_CREATE: "autoCreate",
  SHARE_WITH_PLAYERS: "shareWithPlayers",
  SHOW_TOKEN_CONTROL: "showTokenControl",
  DEFAULT_MACRO_UUID: "defaultMacroUuid"
});

export const DEFAULT_JOURNAL_NAME_KEY = "NPCLOG.Defaults.JournalName";
export const DEFAULT_PAGE_NAME_KEY = "NPCLOG.Defaults.PageName";

export const NPC_ENTRY_CLASS = `${MODULE_ID}-npc-entry`;
export const NPC_ENTRY_ATTRIBUTE = `data-${MODULE_ID}-actor-uuid`;

export const TEMPLATES = Object.freeze({
  ADD_ACTOR: `modules/${MODULE_ID}/templates/add-actor-app.hbs`,
  SETTINGS: `modules/${MODULE_ID}/templates/settings-app.hbs`
});
