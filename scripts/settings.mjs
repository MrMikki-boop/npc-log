import {
  ACTOR_SHEET_BUTTON_STYLES,
  CARD_FRAMES,
  CARD_IMAGE_SIZES,
  CARD_STYLES,
  DUPLICATE_MODES,
  IMAGE_MODES,
  MODULE_ID,
  RELATIONSHIP_DEFAULTS,
  SETTINGS
} from "./constants.mjs";
import { NpcLogSettingsApp } from "./ui/settings-app.mjs";

export function registerSettings() {
  game.settings.register(MODULE_ID, SETTINGS.TARGET_JOURNAL_UUID, {
    name: "NPCLOG.Settings.TargetJournal.Name",
    hint: "NPCLOG.Settings.TargetJournal.Hint",
    scope: "world",
    config: false,
    type: String,
    default: ""
  });

  game.settings.register(MODULE_ID, SETTINGS.TARGET_PAGE_UUID, {
    name: "NPCLOG.Settings.TargetPage.Name",
    hint: "NPCLOG.Settings.TargetPage.Hint",
    scope: "world",
    config: false,
    type: String,
    default: ""
  });

  game.settings.register(MODULE_ID, SETTINGS.IMAGE_MODE, {
    name: "NPCLOG.Settings.ImageMode.Name",
    hint: "NPCLOG.Settings.ImageMode.Hint",
    scope: "world",
    config: true,
    type: String,
    choices: {
      [IMAGE_MODES.PORTRAIT]: "NPCLOG.ImageMode.Portrait",
      [IMAGE_MODES.TOKEN]: "NPCLOG.ImageMode.Token"
    },
    default: IMAGE_MODES.PORTRAIT
  });

  game.settings.register(MODULE_ID, SETTINGS.CARD_STYLE, {
    name: "NPCLOG.Settings.CardStyle.Name",
    hint: "NPCLOG.Settings.CardStyle.Hint",
    scope: "world",
    config: true,
    type: String,
    choices: {
      [CARD_STYLES.PORTRAIT]: "NPCLOG.CardStyle.Portrait",
      [CARD_STYLES.COMPACT]: "NPCLOG.CardStyle.Compact",
      [CARD_STYLES.GALLERY]: "NPCLOG.CardStyle.Gallery"
    },
    default: CARD_STYLES.PORTRAIT
  });

  game.settings.register(MODULE_ID, SETTINGS.CARD_IMAGE_SIZE, {
    name: "NPCLOG.Settings.CardImageSize.Name",
    hint: "NPCLOG.Settings.CardImageSize.Hint",
    scope: "world",
    config: true,
    type: String,
    choices: {
      [CARD_IMAGE_SIZES.SMALL]: "NPCLOG.CardImageSize.Small",
      [CARD_IMAGE_SIZES.MEDIUM]: "NPCLOG.CardImageSize.Medium",
      [CARD_IMAGE_SIZES.LARGE]: "NPCLOG.CardImageSize.Large"
    },
    default: CARD_IMAGE_SIZES.MEDIUM
  });

  game.settings.register(MODULE_ID, SETTINGS.SHOW_IMAGE_SIZE_IN_ADD_DIALOG, {
    name: "NPCLOG.Settings.Advanced.ShowImageSizeInAddDialog.Name",
    hint: "NPCLOG.Settings.Advanced.ShowImageSizeInAddDialog.Hint",
    scope: "world",
    config: true,
    type: Boolean,
    default: false
  });

  game.settings.register(MODULE_ID, SETTINGS.CARD_FRAME, {
    name: "NPCLOG.Settings.CardFrame.Name",
    hint: "NPCLOG.Settings.CardFrame.Hint",
    scope: "world",
    config: true,
    type: String,
    choices: {
      [CARD_FRAMES.STANDARD]: "NPCLOG.CardFrame.Standard",
      [CARD_FRAMES.SOFT]: "NPCLOG.CardFrame.Soft",
      [CARD_FRAMES.NONE]: "NPCLOG.CardFrame.None"
    },
    default: CARD_FRAMES.STANDARD
  });

  game.settings.register(MODULE_ID, SETTINGS.DUPLICATE_MODE, {
    name: "NPCLOG.Settings.DuplicateMode.Name",
    hint: "NPCLOG.Settings.DuplicateMode.Hint",
    scope: "world",
    config: false,
    type: String,
    choices: {
      [DUPLICATE_MODES.UPDATE]: "NPCLOG.DuplicateMode.Update",
      [DUPLICATE_MODES.COPY]: "NPCLOG.DuplicateMode.Copy"
    },
    default: DUPLICATE_MODES.UPDATE
  });

  game.settings.register(MODULE_ID, SETTINGS.ADVANCED_SETTINGS_ENABLED, {
    name: "NPCLOG.Settings.Advanced.Enabled.Name",
    hint: "NPCLOG.Settings.Advanced.Enabled.Hint",
    scope: "world",
    config: false,
    type: Boolean,
    default: false
  });

  game.settings.register(MODULE_ID, SETTINGS.INCLUDE_META_TYPE, {
    name: "NPCLOG.Settings.Advanced.MetaType.Name",
    hint: "NPCLOG.Settings.Advanced.MetaType.Hint",
    scope: "world",
    config: false,
    type: Boolean,
    default: true
  });

  game.settings.register(MODULE_ID, SETTINGS.INCLUDE_META_LEVEL, {
    name: "NPCLOG.Settings.Advanced.MetaLevel.Name",
    hint: "NPCLOG.Settings.Advanced.MetaLevel.Hint",
    scope: "world",
    config: false,
    type: Boolean,
    default: true
  });

  game.settings.register(MODULE_ID, SETTINGS.INCLUDE_META_CR, {
    name: "NPCLOG.Settings.Advanced.MetaCr.Name",
    hint: "NPCLOG.Settings.Advanced.MetaCr.Hint",
    scope: "world",
    config: false,
    type: Boolean,
    default: true
  });

  game.settings.register(MODULE_ID, SETTINGS.INCLUDE_META_RARITY, {
    name: "NPCLOG.Settings.Advanced.MetaRarity.Name",
    hint: "NPCLOG.Settings.Advanced.MetaRarity.Hint",
    scope: "world",
    config: false,
    type: Boolean,
    default: true
  });

  game.settings.register(MODULE_ID, SETTINGS.INCLUDE_META_TRAITS, {
    name: "NPCLOG.Settings.Advanced.MetaTraits.Name",
    hint: "NPCLOG.Settings.Advanced.MetaTraits.Hint",
    scope: "world",
    config: false,
    type: Boolean,
    default: true
  });

  game.settings.register(MODULE_ID, SETTINGS.INCLUDE_META_SIZE, {
    name: "NPCLOG.Settings.Advanced.MetaSize.Name",
    hint: "NPCLOG.Settings.Advanced.MetaSize.Hint",
    scope: "world",
    config: false,
    type: Boolean,
    default: false
  });

  game.settings.register(MODULE_ID, SETTINGS.INCLUDE_META_DISPOSITION, {
    name: "NPCLOG.Settings.Advanced.MetaDisposition.Name",
    hint: "NPCLOG.Settings.Advanced.MetaDisposition.Hint",
    scope: "world",
    config: false,
    type: Boolean,
    default: false
  });

  game.settings.register(MODULE_ID, SETTINGS.RELATIONSHIP_DEFAULT, {
    name: "NPCLOG.Settings.RelationshipDefault.Name",
    hint: "NPCLOG.Settings.RelationshipDefault.Hint",
    scope: "world",
    config: false,
    type: String,
    choices: {
      [RELATIONSHIP_DEFAULTS.TOKEN]: "NPCLOG.RelationshipDefault.Token",
      [RELATIONSHIP_DEFAULTS.SECRET]: "NPCLOG.Relationship.Secret",
      [RELATIONSHIP_DEFAULTS.NEUTRAL]: "NPCLOG.Relationship.Neutral",
      [RELATIONSHIP_DEFAULTS.FRIENDLY]: "NPCLOG.Relationship.Friendly",
      [RELATIONSHIP_DEFAULTS.HOSTILE]: "NPCLOG.Relationship.Hostile"
    },
    default: RELATIONSHIP_DEFAULTS.TOKEN
  });

  game.settings.register(MODULE_ID, SETTINGS.CUSTOM_FIELDS, {
    name: "NPCLOG.Settings.CustomFields.Name",
    hint: "NPCLOG.Settings.CustomFields.Hint",
    scope: "world",
    config: false,
    type: Object,
    default: []
  });

  game.settings.register(MODULE_ID, SETTINGS.AUTO_CREATE, {
    name: "NPCLOG.Settings.AutoCreate.Name",
    hint: "NPCLOG.Settings.AutoCreate.Hint",
    scope: "world",
    config: true,
    type: Boolean,
    default: true
  });

  game.settings.register(MODULE_ID, SETTINGS.SHARE_WITH_PLAYERS, {
    name: "NPCLOG.Settings.ShareWithPlayers.Name",
    hint: "NPCLOG.Settings.ShareWithPlayers.Hint",
    scope: "world",
    config: true,
    type: Boolean,
    default: true
  });

  game.settings.register(MODULE_ID, SETTINGS.ACTOR_SHEET_BUTTON_STYLE, {
    name: "NPCLOG.Settings.ActorSheetButtonStyle.Name",
    hint: "NPCLOG.Settings.ActorSheetButtonStyle.Hint",
    scope: "client",
    config: true,
    type: String,
    choices: {
      [ACTOR_SHEET_BUTTON_STYLES.FULL]: "NPCLOG.ActorSheetButtonStyle.Full",
      [ACTOR_SHEET_BUTTON_STYLES.ICON]: "NPCLOG.ActorSheetButtonStyle.Icon"
    },
    default: ACTOR_SHEET_BUTTON_STYLES.FULL,
    requiresReload: true
  });

  game.settings.register(MODULE_ID, SETTINGS.SHOW_TOKEN_CONTROL, {
    name: "NPCLOG.Settings.ShowTokenControl.Name",
    hint: "NPCLOG.Settings.ShowTokenControl.Hint",
    scope: "client",
    config: true,
    type: Boolean,
    default: true,
    requiresReload: true
  });

  game.settings.register(MODULE_ID, SETTINGS.ADD_DIALOG_STATE, {
    name: "NPCLOG.Settings.AddDialogState.Name",
    scope: "client",
    config: false,
    type: Object,
    default: {}
  });

  game.settings.register(MODULE_ID, SETTINGS.DEFAULT_MACRO_UUID, {
    name: "NPCLOG.Settings.DefaultMacroUuid.Name",
    scope: "world",
    config: false,
    type: String,
    default: ""
  });

  game.settings.registerMenu(MODULE_ID, "configureNpcLog", {
    name: "NPCLOG.Settings.Menu.Name",
    hint: "NPCLOG.Settings.Menu.Hint",
    label: "NPCLOG.Settings.Menu.Label",
    icon: "fas fa-book",
    type: NpcLogSettingsApp,
    restricted: true
  });
}
