import { DUPLICATE_MODES, MODULE_ID, SETTINGS, TEMPLATES } from "../constants.mjs";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

export class NpcLogSettingsApp extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS = {
    id: `${MODULE_ID}-settings`,
    classes: [MODULE_ID, `${MODULE_ID}-settings-app`],
    window: {
      title: "NPCLOG.Settings.App.Title",
      icon: "fas fa-book"
    },
    position: {
      width: 540
    },
    actions: {
      save: NpcLogSettingsApp.#onSave
    }
  };

  static PARTS = {
    form: {
      template: TEMPLATES.SETTINGS,
      scrollable: [".npc-log-settings-body"]
    }
  };

  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    const selectedJournalUuid = game.settings.get(MODULE_ID, SETTINGS.TARGET_JOURNAL_UUID);
    const selectedPageUuid = game.settings.get(MODULE_ID, SETTINGS.TARGET_PAGE_UUID);
    const journals = getJournalChoices();
    const selectedJournal = game.journal.find((journal) => journal.uuid === selectedJournalUuid) ?? game.journal.get(selectedJournalUuid);
    return {
      ...context,
      settings: {
        targetJournalUuid: selectedJournalUuid,
        targetPageUuid: selectedPageUuid,
        advancedSettingsEnabled: game.settings.get(MODULE_ID, SETTINGS.ADVANCED_SETTINGS_ENABLED),
        showImageSizeInAddDialog: game.settings.get(MODULE_ID, SETTINGS.SHOW_IMAGE_SIZE_IN_ADD_DIALOG),
        duplicateMode: game.settings.get(MODULE_ID, SETTINGS.DUPLICATE_MODE),
        includeMetaType: game.settings.get(MODULE_ID, SETTINGS.INCLUDE_META_TYPE),
        includeMetaLevel: game.settings.get(MODULE_ID, SETTINGS.INCLUDE_META_LEVEL),
        includeMetaCr: game.settings.get(MODULE_ID, SETTINGS.INCLUDE_META_CR),
        includeMetaRarity: game.settings.get(MODULE_ID, SETTINGS.INCLUDE_META_RARITY),
        includeMetaTraits: game.settings.get(MODULE_ID, SETTINGS.INCLUDE_META_TRAITS)
      },
      metaSection: getSystemMetaSection(),
      duplicateModes: [
        { value: DUPLICATE_MODES.UPDATE, label: "NPCLOG.DuplicateMode.Update" },
        { value: DUPLICATE_MODES.SKIP, label: "NPCLOG.DuplicateMode.Skip" },
        { value: DUPLICATE_MODES.COPY, label: "NPCLOG.DuplicateMode.Copy" }
      ],
      journals,
      pages: getPageChoices(selectedJournal)
    };
  }

  _onRender(context, options) {
    super._onRender(context, options);
    const journalSelect = this.element.querySelector('[name="targetJournalUuid"]');
    const pageSelect = this.element.querySelector('[name="targetPageUuid"]');
    journalSelect?.addEventListener("change", () => {
      const journal = game.journal.find((entry) => entry.uuid === journalSelect.value) ?? game.journal.get(journalSelect.value);
      renderPageOptions(pageSelect, getPageChoices(journal), "");
    });

    const advancedCheckbox = this.element.querySelector('[name="advancedSettingsEnabled"]');
    const advancedBlock = this.element.querySelector("[data-advanced-settings]");
    const toggleAdvancedBlock = () => {
      if (advancedBlock) advancedBlock.hidden = !advancedCheckbox?.checked;
    };
    advancedCheckbox?.addEventListener("change", toggleAdvancedBlock);
    toggleAdvancedBlock();
  }

  static async #onSave(event, target) {
    event.preventDefault();
    const form = target.closest("form");
    const formData = new FormData(form);
    const journalUuid = String(formData.get("targetJournalUuid") ?? "");
    const pageUuid = String(formData.get("targetPageUuid") ?? "");
    const advancedSettingsEnabled = formData.has("advancedSettingsEnabled");

    await game.settings.set(MODULE_ID, SETTINGS.TARGET_JOURNAL_UUID, journalUuid);
    await game.settings.set(MODULE_ID, SETTINGS.TARGET_PAGE_UUID, pageUuid);
    await game.settings.set(MODULE_ID, SETTINGS.ADVANCED_SETTINGS_ENABLED, advancedSettingsEnabled);
    await game.settings.set(MODULE_ID, SETTINGS.SHOW_IMAGE_SIZE_IN_ADD_DIALOG, formData.has("showImageSizeInAddDialog"));
    await game.settings.set(MODULE_ID, SETTINGS.DUPLICATE_MODE, normalizeDuplicateMode(formData.get("duplicateMode")));
    for (const option of getSystemMetaSection().options) {
      await game.settings.set(MODULE_ID, option.name, formData.has(option.name));
    }

    ui.notifications?.info(game.i18n.localize("NPCLOG.Notifications.SettingsSaved"));
    this.close();
  }
}

function getSystemMetaSection() {
  const systemId = game.system?.id ?? "";
  const systemTitle = game.system?.title ?? systemId;
  if (systemId === "dnd5e") {
    return {
      title: game.i18n.localize("NPCLOG.Settings.Advanced.MetaDnd5eTitle"),
      hint: "NPCLOG.Settings.Advanced.MetaDnd5eHint",
      options: [
        getMetaOption(SETTINGS.INCLUDE_META_TYPE, "NPCLOG.Settings.Advanced.MetaDnd5eType.Name"),
        getMetaOption(SETTINGS.INCLUDE_META_LEVEL, "NPCLOG.Settings.Advanced.MetaDnd5eLevel.Name"),
        getMetaOption(SETTINGS.INCLUDE_META_CR, "NPCLOG.Settings.Advanced.MetaDnd5eCr.Name")
      ]
    };
  }

  if (systemId === "pf2e") {
    return {
      title: game.i18n.localize("NPCLOG.Settings.Advanced.MetaPf2eTitle"),
      hint: "NPCLOG.Settings.Advanced.MetaPf2eHint",
      options: [
        getMetaOption(SETTINGS.INCLUDE_META_LEVEL, "NPCLOG.Settings.Advanced.MetaPf2eLevel.Name"),
        getMetaOption(SETTINGS.INCLUDE_META_RARITY, "NPCLOG.Settings.Advanced.MetaPf2eRarity.Name"),
        getMetaOption(SETTINGS.INCLUDE_META_TRAITS, "NPCLOG.Settings.Advanced.MetaPf2eTraits.Name")
      ]
    };
  }

  return {
    title: game.i18n.format("NPCLOG.Settings.Advanced.MetaGenericTitle", { system: systemTitle }),
    hint: "NPCLOG.Settings.Advanced.MetaGenericHint",
    options: [
      getMetaOption(SETTINGS.INCLUDE_META_TYPE, "NPCLOG.Settings.Advanced.MetaGenericType.Name"),
      getMetaOption(SETTINGS.INCLUDE_META_LEVEL, "NPCLOG.Settings.Advanced.MetaGenericLevel.Name")
    ]
  };
}

function getMetaOption(setting, label) {
  return {
    name: setting,
    label,
    checked: game.settings.get(MODULE_ID, setting)
  };
}

function normalizeDuplicateMode(value) {
  return Object.values(DUPLICATE_MODES).includes(value) ? value : DUPLICATE_MODES.UPDATE;
}

function getJournalChoices() {
  return game.journal.map((journal) => ({
    value: journal.uuid,
    label: journal.name
  })).sort((a, b) => a.label.localeCompare(b.label, game.i18n.lang));
}

function getPageChoices(journal) {
  if (!journal) return [];
  return journal.pages
    .filter((page) => page.type === "text")
    .map((page) => ({
      value: page.uuid,
      label: page.name
    }))
    .sort((a, b) => a.label.localeCompare(b.label, game.i18n.lang));
}

function renderPageOptions(select, pages, selectedValue) {
  if (!select) return;
  select.replaceChildren();

  const empty = document.createElement("option");
  empty.value = "";
  empty.textContent = game.i18n.localize("NPCLOG.Settings.App.NoPage");
  select.append(empty);

  for (const page of pages) {
    const option = document.createElement("option");
    option.value = page.value;
    option.textContent = page.label;
    option.selected = page.value === selectedValue;
    select.append(option);
  }
}
