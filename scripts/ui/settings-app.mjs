import { CUSTOM_FIELD_TYPES, DUPLICATE_MODES, MODULE_ID, RELATIONSHIP_DEFAULTS, SETTINGS, TEMPLATES } from "../constants.mjs";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;
const CUSTOM_FIELD_CHOICE = "__custom";

export class NpcLogSettingsApp extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS = {
    id: `${MODULE_ID}-settings`,
    classes: [MODULE_ID, `${MODULE_ID}-settings-app`],
    window: {
      title: "NPCLOG.Settings.App.Title",
      icon: "fas fa-book"
    },
    position: {
      width: 560
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
    const customFields = normalizeCustomFields(game.settings.get(MODULE_ID, SETTINGS.CUSTOM_FIELDS));
    return {
      ...context,
      settings: {
        targetJournalUuid: selectedJournalUuid,
        targetPageUuid: selectedPageUuid,
        advancedSettingsEnabled: game.settings.get(MODULE_ID, SETTINGS.ADVANCED_SETTINGS_ENABLED),
        duplicateMode: normalizeDuplicateMode(game.settings.get(MODULE_ID, SETTINGS.DUPLICATE_MODE)),
        includeMetaType: game.settings.get(MODULE_ID, SETTINGS.INCLUDE_META_TYPE),
        includeMetaLevel: game.settings.get(MODULE_ID, SETTINGS.INCLUDE_META_LEVEL),
        includeMetaCr: game.settings.get(MODULE_ID, SETTINGS.INCLUDE_META_CR),
        includeMetaRarity: game.settings.get(MODULE_ID, SETTINGS.INCLUDE_META_RARITY),
        includeMetaTraits: game.settings.get(MODULE_ID, SETTINGS.INCLUDE_META_TRAITS),
        includeMetaSize: game.settings.get(MODULE_ID, SETTINGS.INCLUDE_META_SIZE),
        includeMetaDisposition: game.settings.get(MODULE_ID, SETTINGS.INCLUDE_META_DISPOSITION),
        relationshipDefault: normalizeRelationshipDefault(game.settings.get(MODULE_ID, SETTINGS.RELATIONSHIP_DEFAULT))
      },
      duplicateModes: [
        { value: DUPLICATE_MODES.UPDATE, label: "NPCLOG.DuplicateMode.Update" },
        { value: DUPLICATE_MODES.COPY, label: "NPCLOG.DuplicateMode.Copy" }
      ],
      additionalFields: getAdditionalFieldRows(customFields),
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

    const additionalFieldsList = this.element.querySelector("[data-additional-fields]");
    additionalFieldsList?.addEventListener("click", (event) => {
      const button = event.target.closest("[data-delete-custom-field]");
      if (!button) return;
      button.closest("[data-custom-field]")?.remove();
      ensureAdditionalFieldPlaceholder(additionalFieldsList);
    });
    additionalFieldsList?.addEventListener("change", (event) => {
      if (event.target.matches('[name="additionalFieldChoice"]')) {
        addSelectedAdditionalField(event.target, additionalFieldsList);
        return;
      }
      if (event.target.matches('[name="customFieldEnabled"]')) {
        const row = event.target.closest("[data-custom-field]");
        toggleCustomFieldRow(row);
        if (event.target.checked) {
          row?.querySelector('[name="customFieldLabel"]')?.focus();
          ensureAdditionalFieldPlaceholder(additionalFieldsList);
        }
        return;
      }
      if (event.target.matches('[name="additionalFieldEnabled"]')) toggleAdditionalFieldRow(event.target.closest("[data-additional-field]"));
    });
    for (const row of additionalFieldsList?.querySelectorAll("[data-additional-field]") ?? []) toggleAdditionalFieldRow(row);
    for (const row of additionalFieldsList?.querySelectorAll("[data-custom-field]") ?? []) toggleCustomFieldRow(row);
    ensureAdditionalFieldPlaceholder(additionalFieldsList);
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
    await game.settings.set(MODULE_ID, SETTINGS.DUPLICATE_MODE, normalizeDuplicateMode(formData.get("duplicateMode")));
    const enabledAdditionalFields = new Set(formData.getAll("additionalFieldEnabled").map(String));
    await game.settings.set(MODULE_ID, SETTINGS.INCLUDE_META_DISPOSITION, enabledAdditionalFields.has(SETTINGS.INCLUDE_META_DISPOSITION));
    await game.settings.set(MODULE_ID, SETTINGS.RELATIONSHIP_DEFAULT, normalizeRelationshipDefault(formData.get("relationshipDefault")));
    await game.settings.set(MODULE_ID, SETTINGS.CUSTOM_FIELDS, parseCustomFields(form));
    for (const option of getSystemMetaSection().options) {
      await game.settings.set(MODULE_ID, option.name, enabledAdditionalFields.has(option.name));
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
        getMetaOption(SETTINGS.INCLUDE_META_CR, "NPCLOG.Settings.Advanced.MetaDnd5eCr.Name"),
        getMetaOption(SETTINGS.INCLUDE_META_SIZE, "NPCLOG.Settings.Advanced.MetaSize.Name")
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
        getMetaOption(SETTINGS.INCLUDE_META_TRAITS, "NPCLOG.Settings.Advanced.MetaPf2eTraits.Name"),
        getMetaOption(SETTINGS.INCLUDE_META_SIZE, "NPCLOG.Settings.Advanced.MetaSize.Name")
      ]
    };
  }

  return {
    title: game.i18n.format("NPCLOG.Settings.Advanced.MetaGenericTitle", { system: systemTitle }),
    hint: "NPCLOG.Settings.Advanced.MetaGenericHint",
    options: [
      getMetaOption(SETTINGS.INCLUDE_META_TYPE, "NPCLOG.Settings.Advanced.MetaGenericType.Name"),
      getMetaOption(SETTINGS.INCLUDE_META_LEVEL, "NPCLOG.Settings.Advanced.MetaGenericLevel.Name"),
      getMetaOption(SETTINGS.INCLUDE_META_SIZE, "NPCLOG.Settings.Advanced.MetaSize.Name")
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

function getAdditionalFieldDefinitions() {
  return [
    ...getSystemMetaSection().options.map((option) => ({
      id: option.name,
      kind: "setting",
      setting: option.name,
      label: game.i18n.localize(option.label),
      enabled: option.checked
    })),
    {
      id: SETTINGS.INCLUDE_META_DISPOSITION,
      kind: "relationship",
      setting: SETTINGS.INCLUDE_META_DISPOSITION,
      label: game.i18n.localize("NPCLOG.Settings.Advanced.MetaDisposition.Name"),
      enabled: game.settings.get(MODULE_ID, SETTINGS.INCLUDE_META_DISPOSITION),
      relationshipDefault: normalizeRelationshipDefault(game.settings.get(MODULE_ID, SETTINGS.RELATIONSHIP_DEFAULT)),
      relationshipDefaults: getRelationshipDefaultChoices()
    }
  ];
}

function getAdditionalFieldRows(customFields) {
  const definitions = getAdditionalFieldDefinitions();
  const rows = [
    ...definitions.filter((field) => field.enabled).map((field) => getAdditionalFieldRow(field)),
    ...customFields.map((field) => ({
      ...field,
      kind: "custom",
      isCustom: true,
      enabled: true
    }))
  ];
  return [...rows, getAdditionalFieldPlaceholderRows(definitions)];
}

function getAdditionalFieldRow(field) {
  return {
    ...field,
    isSetting: field.kind === "setting",
    isRelationship: field.kind === "relationship",
    enabled: field.enabled === true
  };
}

function getAdditionalFieldPlaceholderRows(definitions = getAdditionalFieldDefinitions()) {
  const hasAvailableDefinitions = definitions.some((field) => !field.enabled);
  if (!hasAvailableDefinitions) {
    return {
      ...createCustomField(),
      kind: "custom",
      isCustom: true
    };
  }

  return {
    kind: "placeholder",
    isPlaceholder: true,
    enabled: false,
    choices: getAdditionalFieldChoices(definitions)
  };
}

function getAdditionalFieldChoices(definitions = getAdditionalFieldDefinitions()) {
  return [
    { value: "", label: game.i18n.localize("NPCLOG.Settings.CustomFields.AddPlaceholder") },
    ...definitions
      .filter((field) => !field.enabled)
      .map((field) => ({ value: field.id, label: field.label })),
    { value: CUSTOM_FIELD_CHOICE, label: game.i18n.localize("NPCLOG.Settings.CustomFields.LabelPlaceholder") }
  ];
}

function normalizeDuplicateMode(value) {
  return [DUPLICATE_MODES.UPDATE, DUPLICATE_MODES.COPY].includes(value) ? value : DUPLICATE_MODES.UPDATE;
}

function normalizeRelationshipDefault(value) {
  return Object.values(RELATIONSHIP_DEFAULTS).includes(value) ? value : RELATIONSHIP_DEFAULTS.TOKEN;
}

function normalizeCustomFields(value) {
  if (!Array.isArray(value)) return [];
  const seen = new Set();
  return value
    .map((field) => normalizeCustomField(field))
    .filter((field) => {
      if (!field.label || seen.has(field.id)) return false;
      seen.add(field.id);
      return true;
    });
}

function normalizeCustomField(field) {
  const id = normalizeCustomFieldId(field?.id);
  const label = String(field?.label ?? "").replace(/\s+/g, " ").trim().slice(0, 80);
  const options = normalizeCustomFieldOptions(field?.options ?? field?.optionsText);
  const type = options.length ? CUSTOM_FIELD_TYPES.SELECT : CUSTOM_FIELD_TYPES.CHECKBOX;
  return { id, label, type, options, optionsText: options.join(", ") };
}

function normalizeCustomFieldId(value) {
  const id = String(value ?? "").replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 64);
  return id || createCustomFieldId();
}

function parseCustomFields(form) {
  return Array.from(form.querySelectorAll("[data-custom-field]"))
    .filter((row) => row.querySelector('[name="customFieldEnabled"]')?.checked)
    .map((row) => normalizeCustomField({
      id: row.querySelector('[name="customFieldId"]')?.value,
      label: row.querySelector('[name="customFieldLabel"]')?.value,
      optionsText: row.querySelector('[name="customFieldOptions"]')?.value
    }))
    .filter((field) => field.label);
}

function getCustomFieldRows(fields) {
  return [...fields.map((field) => ({ ...field, enabled: true })), createCustomField()];
}

function createCustomField() {
  return {
    id: createCustomFieldId(),
    label: "",
    type: CUSTOM_FIELD_TYPES.CHECKBOX,
    options: [],
    optionsText: "",
    enabled: false
  };
}

function createCustomFieldId() {
  return globalThis.crypto?.randomUUID?.() ?? `field-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function renderCustomFieldRow(field) {
  const template = document.createElement("template");
  const escape = foundry.utils.escapeHTML;
  template.innerHTML = `
    <div class="npc-log-additional-field-row npc-log-custom-field-row" data-custom-field>
      <input type="hidden" name="customFieldId" value="${escape(field.id)}">
      <label class="checkbox">
        <input type="checkbox" name="customFieldEnabled">
        <input type="text" name="customFieldLabel" value="${escape(field.label)}" placeholder="${escape(game.i18n.localize("NPCLOG.Settings.CustomFields.LabelPlaceholder"))}" maxlength="80">
      </label>
      <input type="text" name="customFieldOptions" value="${escape(field.optionsText ?? "")}" placeholder="${escape(game.i18n.localize("NPCLOG.Settings.CustomFields.OptionsPlaceholder"))}" maxlength="240">
      <button type="button" data-delete-custom-field data-tooltip="${escape(game.i18n.localize("NPCLOG.Settings.CustomFields.Delete"))}" aria-label="${escape(game.i18n.localize("NPCLOG.Settings.CustomFields.Delete"))}">
        <i class="fas fa-trash" aria-hidden="true"></i>
      </button>
    </div>`;
  const row = template.content.firstElementChild;
  row.querySelector('[name="customFieldEnabled"]').checked = field.enabled === true;
  toggleCustomFieldRow(row);
  return row;
}

function renderAdditionalFieldRow(field) {
  const template = document.createElement("template");
  const escape = foundry.utils.escapeHTML;
  if (field.kind === "custom") return renderCustomFieldRow(field);

  template.innerHTML = `
    <div class="npc-log-additional-field-row" data-additional-field data-setting="${escape(field.setting)}">
      <label class="checkbox">
        <input type="checkbox" name="additionalFieldEnabled" value="${escape(field.setting)}" checked>
        <span>${escape(field.label)}</span>
      </label>
      ${field.kind === "relationship" ? renderRelationshipDefaultSelect(field) : ""}
    </div>`;
  const row = template.content.firstElementChild;
  toggleAdditionalFieldRow(row);
  return row;
}

function renderRelationshipDefaultSelect(field) {
  const escape = foundry.utils.escapeHTML;
  const selected = normalizeRelationshipDefault(field.relationshipDefault);
  return [
    `<select name="relationshipDefault" data-relationship-default>`,
    ...getRelationshipDefaultChoices().map((choice) => {
      const choiceValue = String(choice.value);
      const selectedAttribute = choiceValue === selected ? " selected" : "";
      return `<option value="${escape(choiceValue)}"${selectedAttribute}>${escape(game.i18n.localize(choice.label))}</option>`;
    }),
    "</select>"
  ].join("");
}

function renderAdditionalFieldPlaceholder(definitions = getAdditionalFieldDefinitions()) {
  if (!definitions.some((field) => !field.enabled)) return renderCustomFieldRow(createCustomField());

  const template = document.createElement("template");
  const escape = foundry.utils.escapeHTML;
  template.innerHTML = `
    <div class="npc-log-additional-field-row npc-log-additional-field-row--placeholder" data-additional-field-placeholder>
      <select name="additionalFieldChoice">
        ${getAdditionalFieldChoices(definitions).map((choice) => `<option value="${escape(choice.value)}">${escape(choice.label)}</option>`).join("")}
      </select>
    </div>`;
  return template.content.firstElementChild;
}

function toggleCustomFieldRow(row) {
  const enabled = row?.querySelector('[name="customFieldEnabled"]')?.checked === true;
  const input = row?.querySelector('[name="customFieldLabel"]');
  const options = row?.querySelector('[name="customFieldOptions"]');
  const deleteButton = row?.querySelector("[data-delete-custom-field]");
  row?.classList.toggle("is-enabled", enabled);
  if (input) input.disabled = !enabled;
  if (options) options.disabled = !enabled;
  if (deleteButton) deleteButton.hidden = !enabled;
}

function toggleAdditionalFieldRow(row) {
  const enabled = row?.querySelector('[name="additionalFieldEnabled"]')?.checked === true;
  row?.classList.toggle("is-enabled", enabled);
  row?.classList.toggle("is-disabled", !enabled);
}

function addSelectedAdditionalField(select, list) {
  const choice = String(select?.value ?? "");
  if (!choice) return;
  const row = select.closest("[data-additional-field-placeholder]");
  const field = choice === CUSTOM_FIELD_CHOICE
    ? { ...createCustomField(), kind: "custom", enabled: true }
    : getAdditionalFieldDefinitions().find((definition) => definition.id === choice);
  if (!row || !field) return;
  row.replaceWith(renderAdditionalFieldRow({ ...field, enabled: true }));
  ensureAdditionalFieldPlaceholder(list);
  list.querySelector("[data-custom-field].is-enabled input[name='customFieldLabel']:not(:disabled)")?.focus();
}

function ensureAdditionalFieldPlaceholder(list) {
  if (!list) return;
  const placeholders = Array.from(list.querySelectorAll("[data-additional-field-placeholder]"));
  for (const row of placeholders.slice(1)) row.remove();
  const definitions = getCurrentAdditionalFieldDefinitions(list);
  if (!placeholders.length && definitions.some((field) => !field.enabled)) list.append(renderAdditionalFieldPlaceholder(definitions));
  const placeholder = list.querySelector("[data-additional-field-placeholder]");
  const replacement = renderAdditionalFieldPlaceholder(definitions);
  placeholder?.replaceWith(replacement);

  const rows = Array.from(list.querySelectorAll("[data-custom-field]"));
  const blankRows = rows.filter((row) => {
    const enabled = row.querySelector('[name="customFieldEnabled"]')?.checked === true;
    const label = row.querySelector('[name="customFieldLabel"]')?.value.trim();
    const options = row.querySelector('[name="customFieldOptions"]')?.value.trim();
    return !enabled && !label && !options;
  });
  for (const row of blankRows.slice(1)) row.remove();
  if (!list.querySelector("[data-additional-field-placeholder]") && !blankRows.length) list.append(renderCustomFieldRow(createCustomField()));
}

function normalizeCustomFieldOptions(value) {
  const options = Array.isArray(value)
    ? value
    : String(value ?? "").split(/[;,]/);
  return Array.from(new Set(options
    .map((option) => String(option ?? "").replace(/^["']|["']$/g, "").trim())
    .filter(Boolean)))
    .slice(0, 24);
}

function getCurrentAdditionalFieldDefinitions(list) {
  const selected = new Set(Array.from(list.querySelectorAll("[data-setting]")).map((row) => row.dataset.setting));
  return getAdditionalFieldDefinitions().map((field) => ({
    ...field,
    enabled: selected.has(field.id)
  }));
}

function getRelationshipDefaultChoices() {
  return [
    { value: RELATIONSHIP_DEFAULTS.TOKEN, label: "NPCLOG.RelationshipDefault.Token" },
    { value: RELATIONSHIP_DEFAULTS.SECRET, label: "NPCLOG.Relationship.Secret" },
    { value: RELATIONSHIP_DEFAULTS.NEUTRAL, label: "NPCLOG.Relationship.Neutral" },
    { value: RELATIONSHIP_DEFAULTS.FRIENDLY, label: "NPCLOG.Relationship.Friendly" },
    { value: RELATIONSHIP_DEFAULTS.HOSTILE, label: "NPCLOG.Relationship.Hostile" }
  ];
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
