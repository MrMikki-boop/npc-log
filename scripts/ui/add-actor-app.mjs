import {
  CARD_IMAGE_SIZES,
  CARD_STYLES,
  CUSTOM_FIELD_TYPES,
  IMAGE_MODES,
  MODULE_ID,
  RELATIONSHIP_DEFAULTS,
  RELATIONSHIP_FIELD_ID,
  SETTINGS,
  TEMPLATES
} from "../constants.mjs";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;
const CREATE_PAGE_VALUE = "__createPage";
const TOKEN_RELATIONSHIP_VALUE = "__token";
const SORT_MODES = {
  SELECTION: "selection",
  NAME: "name",
  TYPE: "type"
};

export class AddActorToNpcLogApp extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS = {
    id: `${MODULE_ID}-add-actor`,
    classes: [MODULE_ID, `${MODULE_ID}-add-actor-app`],
    window: {
      title: "NPCLOG.AddActor.Title",
      icon: "fas fa-book"
    },
    position: {
      width: 560
    },
    actions: {
      add: AddActorToNpcLogApp.#onAdd
    }
  };

  static PARTS = {
    form: {
      template: TEMPLATES.ADD_ACTOR,
      scrollable: [".npc-log-form-body"]
    }
  };

  constructor({ actor, manager, tokenDocument = null, entries = null }, options = {}) {
    super(options);
    this.manager = manager;
    this.entries = normalizeActorEntries({ actor, tokenDocument, entries });
    this.actor = this.entries[0]?.actor ?? actor;
    this.tokenDocument = this.entries[0]?.tokenDocument ?? tokenDocument;
    const savedState = getSavedAddDialogState();
    this.sortMode = this.entries.length > 1 ? savedState.sortMode : SORT_MODES.SELECTION;
    this.formState = getFormStateFromSavedFields(savedState.fields);
  }

  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    const configuredTarget = await this.manager.getConfiguredTarget();
    const imageSources = this.manager.getActorImageSources(this.actor, { tokenDocument: this.tokenDocument });
    const imageMode = this.formState.imageMode ?? game.settings.get(MODULE_ID, SETTINGS.IMAGE_MODE);
    const cardStyle = this.formState.cardStyle ?? game.settings.get(MODULE_ID, SETTINGS.CARD_STYLE);
    const cardImageSize = this.formState.cardImageSize ?? game.settings.get(MODULE_ID, SETTINGS.CARD_IMAGE_SIZE);
    const savedState = getSavedAddDialogState();
    const openAfterSave = Object.prototype.hasOwnProperty.call(this.formState, "openAfterSave")
      ? this.formState.openAfterSave
      : savedState.openAfterSave;
    const selectedImage = getImageForMode(imageSources, imageMode);
    const journals = getJournalChoices();
    const hasJournalState = Object.prototype.hasOwnProperty.call(this.formState, "journalUuid");
    const hasPageState = Object.prototype.hasOwnProperty.call(this.formState, "pageUuid");
    const targetJournalUuid = hasJournalState ? this.formState.journalUuid : configuredTarget.journal?.uuid ?? "";
    const targetPageUuid = hasPageState ? this.formState.pageUuid : configuredTarget.page?.uuid ?? "";
    const selectedJournal = targetJournalUuid
      ? game.journal.find((journal) => journal.uuid === targetJournalUuid) ?? game.journal.get(targetJournalUuid)
      : null;
    const selectedPage = getSelectedTextPage(targetPageUuid, selectedJournal, configuredTarget.page);
    const createPageSelected = targetPageUuid === CREATE_PAGE_VALUE;
    const newPageName = this.formState.pageName ?? this.actor.name;
    const sortedEntries = sortEntries(this.entries, this.sortMode);
    const customFieldDefinitions = getCustomFieldDefinitions();
    const existingCustomFields = this.entries.length === 1 && selectedPage
      ? this.manager.getActorCustomFields(this.actor, selectedPage)
      : [];
    const customFields = getCustomFieldControls(
      customFieldDefinitions,
      existingCustomFields,
      this.actor,
      this.entries.length > 1,
      this.tokenDocument,
      this.formState.persistedFields
    );
    return {
      ...context,
      actor: this.actor,
      actors: sortedEntries.map((entry) => entry.actor),
      actorCount: this.entries.length,
      isMultiple: this.entries.length > 1,
      multipleTitle: game.i18n.format("NPCLOG.AddActor.MultipleTitle", { count: this.entries.length }),
      sortMode: this.sortMode,
      sortModes: [
        { value: SORT_MODES.TYPE, label: "NPCLOG.AddActor.Sort.Type" },
        { value: SORT_MODES.NAME, label: "NPCLOG.AddActor.Sort.Name" },
        { value: SORT_MODES.SELECTION, label: "NPCLOG.AddActor.Sort.Selection" }
      ],
      batchSections: getBatchSections(sortedEntries, imageMode, this.sortMode),
      imageMode,
      imageModes: [
        { value: IMAGE_MODES.PORTRAIT, label: "NPCLOG.ImageMode.Portrait" },
        { value: IMAGE_MODES.TOKEN, label: "NPCLOG.ImageMode.Token" }
      ],
      cardStyle,
      cardStyles: [
        { value: CARD_STYLES.PORTRAIT, label: "NPCLOG.CardStyle.Portrait" },
        { value: CARD_STYLES.COMPACT, label: "NPCLOG.CardStyle.Compact" },
        { value: CARD_STYLES.GALLERY, label: "NPCLOG.CardStyle.Gallery" }
      ],
      cardImageSize,
      cardImageSizes: [
        { value: CARD_IMAGE_SIZES.SMALL, label: "NPCLOG.CardImageSize.Small" },
        { value: CARD_IMAGE_SIZES.MEDIUM, label: "NPCLOG.CardImageSize.Medium" },
        { value: CARD_IMAGE_SIZES.LARGE, label: "NPCLOG.CardImageSize.Large" }
      ],
      showImageSizeInAddDialog: game.settings.get(MODULE_ID, SETTINGS.SHOW_IMAGE_SIZE_IN_ADD_DIALOG),
      openAfterSave,
      imageSources,
      selectedImage,
      description: this.formState.description ?? this.manager.getSuggestedDescription(this.actor),
      targetLabel: createPageSelected
        ? getCreatePageTargetLabel(selectedJournal, newPageName)
        : getTargetLabel({ journal: selectedJournal, page: selectedPage }),
      hasTarget: Boolean(selectedJournal && (selectedPage || createPageSelected)),
      autoCreate: game.settings.get(MODULE_ID, SETTINGS.AUTO_CREATE),
      newPageName,
      target: {
        journalUuid: targetJournalUuid,
        pageUuid: targetPageUuid,
        createPageSelected
      },
      customFields,
      hasCustomFields: customFields.length > 0,
      journals,
      pages: getPageChoices(selectedJournal)
    };
  }

  _onRender(context, options) {
    super._onRender(context, options);

    const journalSelect = this.element.querySelector('[name="journalUuid"]');
    const pageSelect = this.element.querySelector('[name="pageUuid"]');
    const pageNameGroup = this.element.querySelector("[data-new-page-name]");
    const pageNameInput = this.element.querySelector('[name="pageName"]');
    const toggleCreatePage = () => {
      const createPage = pageSelect?.value === CREATE_PAGE_VALUE;
      if (pageNameGroup) pageNameGroup.hidden = !createPage;
      if (pageNameInput) pageNameInput.disabled = !createPage;
    };
    pageSelect?.addEventListener("change", () => {
      toggleCreatePage();
      this.formState = readFormState(pageSelect.closest("form"));
      this.render();
    });
    toggleCreatePage();

    journalSelect?.addEventListener("change", () => {
      const journal = game.journal.find((entry) => entry.uuid === journalSelect.value) ?? game.journal.get(journalSelect.value);
      renderPageOptions(pageSelect, getPageChoices(journal), "");
      toggleCreatePage();
      this.formState = readFormState(journalSelect.closest("form"));
      this.render();
    });

    const sortSelect = this.element.querySelector('[name="sortMode"]');
    sortSelect?.addEventListener("change", () => {
      this.formState = readFormState(sortSelect.closest("form"));
      this.sortMode = normalizeSortMode(sortSelect.value);
      this.render();
    });

    const imageSelect = this.element.querySelector('[name="imageMode"]');
    const preview = this.element.querySelector(`.${MODULE_ID}-actor-preview img`);
    imageSelect?.addEventListener("change", () => {
      const src = getImageForMode(context.imageSources, imageSelect.value);
      if (preview && src) preview.src = src;
      for (const image of this.element.querySelectorAll("[data-batch-image]")) {
        const nextSrc = imageSelect.value === IMAGE_MODES.TOKEN
          ? image.dataset.token || image.dataset.portrait
          : image.dataset.portrait || image.dataset.token;
        if (nextSrc) image.src = nextSrc;
      }
    });

    const customFieldsList = this.element.querySelector(".npc-log-add-custom-fields");
    customFieldsList?.addEventListener("change", (event) => {
      if (!event.target.matches('[name="customFieldEnabled"]')) return;
      const row = event.target.closest(".npc-log-add-custom-field");
      row?.classList.toggle("is-enabled", event.target.checked);
      for (const input of row?.querySelectorAll("[data-custom-field-value]") ?? []) input.disabled = !event.target.checked;
    });
  }

  static async #onAdd(event, target) {
    event.preventDefault();
    const form = target.closest("form");
    const formData = new FormData(form);
    const imageMode = normalizeChoice(formData.get("imageMode"), IMAGE_MODES, IMAGE_MODES.PORTRAIT);
    const cardStyle = normalizeChoice(formData.get("cardStyle"), CARD_STYLES, CARD_STYLES.PORTRAIT);
    const cardImageSize = formData.get("cardImageSize")
      ? normalizeChoice(formData.get("cardImageSize"), CARD_IMAGE_SIZES, CARD_IMAGE_SIZES.MEDIUM)
      : "";
    const journalUuid = String(formData.get("journalUuid") ?? "");
    const selectedPageUuid = String(formData.get("pageUuid") ?? "");
    const createPage = selectedPageUuid === CREATE_PAGE_VALUE;
    const pageUuid = createPage ? "" : selectedPageUuid;
    const pageName = String(formData.get("pageName") ?? "");

    await game.settings.set(MODULE_ID, SETTINGS.IMAGE_MODE, imageMode);
    await game.settings.set(MODULE_ID, SETTINGS.CARD_STYLE, cardStyle);
    await game.settings.set(MODULE_ID, SETTINGS.TARGET_JOURNAL_UUID, journalUuid);
    if (!createPage) await game.settings.set(MODULE_ID, SETTINGS.TARGET_PAGE_UUID, pageUuid);
    if (cardImageSize) await game.settings.set(MODULE_ID, SETTINGS.CARD_IMAGE_SIZE, cardImageSize);
    const savedState = getSavedAddDialogState();
    const sortMode = this.entries.length > 1 ? normalizeSortMode(formData.get("sortMode")) : savedState.sortMode;
    const customFieldDefinitions = getCustomFieldDefinitions();
    const customFieldDefinitionIds = this.entries.length === 1
      ? customFieldDefinitions.map((field) => field.id)
      : [];

    const baseOptions = {
      imageMode,
      cardStyle,
      cardImageSize,
      journalUuid,
      pageUuid,
      createPage,
      pageName,
      customFieldDefinitionIds,
      openAfterSave: formData.has("openAfterSave")
    };
    let currentJournalUuid = journalUuid;
    let currentPageUuid = pageUuid;
    let successCount = 0;
    const sortedEntries = sortEntries(this.entries, sortMode);
    const isBatch = sortedEntries.length > 1;

    if (isBatch) {
      const batchResult = await this.manager.addActorsToNpcLog(sortedEntries, {
        ...baseOptions,
        customFields: (actor, actorOptions) => {
          const selectedCustomFields = readSelectedCustomFields(form, customFieldDefinitions, actor, actorOptions.tokenDocument);
          return selectedCustomFields.length ? selectedCustomFields : undefined;
        }
      });
      if (!batchResult?.saved) return;
      successCount = batchResult.saved;
      currentJournalUuid = batchResult.journal.uuid;
      currentPageUuid = batchResult.page.uuid;
    } else {
      const [entry] = sortedEntries;
      const selectedCustomFields = readSelectedCustomFields(form, customFieldDefinitions, entry.actor, entry.tokenDocument);
      const result = await this.manager.addActorToNpcLog(entry.actor, {
        ...baseOptions,
        customFields: selectedCustomFields,
        journalUuid: currentJournalUuid,
        pageUuid: currentPageUuid,
        tokenDocument: entry.tokenDocument,
        description: formData.get("description")
      });
      if (!result) return;
      successCount = 1;
      currentJournalUuid = result.journal.uuid;
      currentPageUuid = result.page.uuid;
    }

    if (successCount) {
      await saveAddDialogState({
        openAfterSave: baseOptions.openAfterSave,
        sortMode,
        fields: readPersistentFormFields(form)
      });
      this.close();
    }
  }
}

function getTargetLabel({ journal, page }) {
  if (!journal || !page) return game.i18n.localize("NPCLOG.AddActor.TargetMissing");
  return game.i18n.format("NPCLOG.AddActor.TargetLabel", {
    journal: journal.name,
    page: page.name
  });
}

function getCreatePageTargetLabel(journal, pageName) {
  const journalName = journal?.name ?? game.i18n.localize("NPCLOG.Settings.App.NoJournal");
  return game.i18n.format("NPCLOG.AddActor.TargetLabel", {
    journal: journalName,
    page: pageName || game.i18n.localize("NPCLOG.AddActor.CreatePage")
  });
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

function getSelectedTextPage(pageUuid, journal, fallbackPage) {
  if (!pageUuid || pageUuid === CREATE_PAGE_VALUE) return null;
  if (fallbackPage?.uuid === pageUuid && fallbackPage.type === "text") return fallbackPage;
  const page = journal?.pages?.find?.((entry) => entry.uuid === pageUuid);
  return page?.type === "text" ? page : null;
}

function renderPageOptions(select, pages, selectedValue) {
  if (!select) return;
  select.replaceChildren();

  const empty = document.createElement("option");
  empty.value = "";
  empty.textContent = game.i18n.localize("NPCLOG.Settings.App.NoPage");
  select.append(empty);

  const create = document.createElement("option");
  create.value = CREATE_PAGE_VALUE;
  create.textContent = game.i18n.localize("NPCLOG.AddActor.CreatePage");
  create.selected = selectedValue === CREATE_PAGE_VALUE;
  select.append(create);

  for (const page of pages) {
    const option = document.createElement("option");
    option.value = page.value;
    option.textContent = page.label;
    option.selected = page.value === selectedValue;
    select.append(option);
  }
}

function getImageForMode(sources, imageMode) {
  if (imageMode === IMAGE_MODES.TOKEN) return sources.token || sources.portrait;
  return sources.portrait || sources.token;
}

function normalizeChoice(value, choices, fallback) {
  return Object.values(choices).includes(value) ? value : fallback;
}

function getCustomFieldDefinitions() {
  if (!game.settings.get(MODULE_ID, SETTINGS.ADVANCED_SETTINGS_ENABLED)) return [];
  const definitions = [];
  if (game.settings.get(MODULE_ID, SETTINGS.INCLUDE_META_DISPOSITION)) definitions.push(getRelationshipFieldDefinition());
  return [...definitions, ...normalizeCustomFieldDefinitions(game.settings.get(MODULE_ID, SETTINGS.CUSTOM_FIELDS))];
}

function normalizeCustomFieldDefinitions(value) {
  if (!Array.isArray(value)) return [];
  const seen = new Set();
  return value
    .map((field) => {
      const id = String(field?.id ?? "").replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 64);
      const label = String(field?.label ?? "").replace(/\s+/g, " ").trim().slice(0, 80);
      const options = normalizeCustomFieldOptions(field?.options);
      const type = options.length ? CUSTOM_FIELD_TYPES.SELECT : CUSTOM_FIELD_TYPES.CHECKBOX;
      return { id, label, type, options };
    })
    .filter((field) => {
      if (!field.id || !field.label || seen.has(field.id)) return false;
      seen.add(field.id);
      return true;
    });
}

function getCustomFieldControls(definitions, existingFields, actor, isMultiple, tokenDocument = null, persistedFields = {}) {
  const existing = new Map(existingFields.map((field) => [field.id, field]));
  const hasPersistedCustomSelection = Object.prototype.hasOwnProperty.call(persistedFields ?? {}, "customFieldEnabled");
  const persistedEnabled = new Set(getPersistentFieldValues(persistedFields, "customFieldEnabled"));
  return definitions.map((field) => {
    const current = existing.get(field.id);
    const isSelect = field.type === CUSTOM_FIELD_TYPES.SELECT;
    const isRelationship = field.id === RELATIONSHIP_FIELD_ID;
    const persistedValue = getPersistentFieldValue(persistedFields, getCustomFieldValueName(field.id));
    const selectOptions = isSelect ? getSelectOptions(field.options, current?.value, isRelationship && isMultiple) : field.options;
    const value = isSelect
      ? getInitialSelectValue(field, current, actor, isMultiple, selectOptions, tokenDocument, persistedValue)
        : "";
    const enabled = hasPersistedCustomSelection
      ? persistedEnabled.has(field.id)
      : isRelationship
        ? true
        : Boolean(current);
    return {
      ...field,
      enabled,
      value,
      valueName: getCustomFieldValueName(field.id),
      isSelect,
      hasValueControl: isSelect,
      options: selectOptions.map((option) => ({
        value: option.value ?? option,
        label: option.label ?? option,
        selected: (option.value ?? option) === value
      }))
    };
  });
}

function readSelectedCustomFields(form, definitions, actor, tokenDocument = null) {
  const formData = new FormData(form);
  const enabled = new Set(formData.getAll("customFieldEnabled").map(String));
  return definitions
    .filter((field) => enabled.has(field.id))
    .map((field) => {
      const formValue = String(formData.get(getCustomFieldValueName(field.id)) ?? "").trim();
      if (field.type === CUSTOM_FIELD_TYPES.SELECT) {
        const value = field.id === RELATIONSHIP_FIELD_ID && formValue === TOKEN_RELATIONSHIP_VALUE
          ? getTokenRelationshipValue(actor, tokenDocument)
          : normalizeSelectValue(formValue, getSelectOptions(field.options, formValue));
        return value ? { id: field.id, label: field.label, type: field.type, value } : null;
      }
      return {
        id: field.id,
        label: field.label,
        type: CUSTOM_FIELD_TYPES.CHECKBOX,
        value: "true"
      };
    })
    .filter(Boolean);
}

function getCustomFieldValueName(id) {
  return `customFieldValue:${id}`;
}

function normalizeCustomFieldOptions(value) {
  if (!Array.isArray(value)) return [];
  return Array.from(new Set(value
    .map((option) => String(option ?? "").trim())
    .filter(Boolean)))
    .slice(0, 24);
}

function getRelationshipFieldDefinition() {
  return {
    id: RELATIONSHIP_FIELD_ID,
    label: game.i18n.localize("NPCLOG.CustomFields.Relationship"),
    type: CUSTOM_FIELD_TYPES.SELECT,
    options: [
      getRelationshipLabel(RELATIONSHIP_DEFAULTS.SECRET),
      getRelationshipLabel(RELATIONSHIP_DEFAULTS.NEUTRAL),
      getRelationshipLabel(RELATIONSHIP_DEFAULTS.FRIENDLY),
      getRelationshipLabel(RELATIONSHIP_DEFAULTS.HOSTILE)
    ]
  };
}

function normalizeSelectValue(value, options) {
  const text = String(value ?? "").trim();
  const values = options.map((option) => option.value ?? option);
  return values.includes(text) ? text : values[0] ?? "";
}

function getSelectOptions(options, currentValue, includeTokenOption = false) {
  const values = [...options];
  const current = String(currentValue ?? "").trim();
  if (current && !values.some((option) => (option.value ?? option) === current)) values.unshift(current);
  if (includeTokenOption) {
    values.unshift({
      value: TOKEN_RELATIONSHIP_VALUE,
      label: game.i18n.localize("NPCLOG.RelationshipDefault.Token")
    });
  }
  return values;
}

function getInitialSelectValue(field, current, actor, isMultiple, options, tokenDocument = null, persistedValue = undefined) {
  if (persistedValue !== undefined) return normalizeSelectValue(persistedValue, options);
  if (current?.value) return normalizeSelectValue(current.value, options);
  if (field.id !== RELATIONSHIP_FIELD_ID) return normalizeSelectValue("", options);
  const configured = normalizeRelationshipDefault(game.settings.get(MODULE_ID, SETTINGS.RELATIONSHIP_DEFAULT));
  if (configured === RELATIONSHIP_DEFAULTS.TOKEN) {
    return isMultiple ? TOKEN_RELATIONSHIP_VALUE : getTokenRelationshipValue(actor, tokenDocument);
  }
  return getRelationshipLabel(configured);
}

function normalizeRelationshipDefault(value) {
  return Object.values(RELATIONSHIP_DEFAULTS).includes(value) ? value : RELATIONSHIP_DEFAULTS.TOKEN;
}

function getTokenRelationshipValue(actor, tokenDocument = null) {
  return getRelationshipLabel(getDispositionKey(tokenDocument?.disposition ?? actor?.prototypeToken?.disposition));
}

function getDispositionKey(value) {
  const dispositions = globalThis.CONST?.TOKEN_DISPOSITIONS ?? {};
  if (value === dispositions.FRIENDLY || value === 1) return RELATIONSHIP_DEFAULTS.FRIENDLY;
  if (value === dispositions.HOSTILE || value === -1) return RELATIONSHIP_DEFAULTS.HOSTILE;
  if (value === dispositions.SECRET || value === -2) return RELATIONSHIP_DEFAULTS.SECRET;
  return RELATIONSHIP_DEFAULTS.NEUTRAL;
}

function getRelationshipLabel(value) {
  const key = normalizeRelationshipDefault(value);
  const localizationKeys = {
    [RELATIONSHIP_DEFAULTS.NEUTRAL]: "NPCLOG.Relationship.Neutral",
    [RELATIONSHIP_DEFAULTS.FRIENDLY]: "NPCLOG.Relationship.Friendly",
    [RELATIONSHIP_DEFAULTS.SECRET]: "NPCLOG.Relationship.Secret",
    [RELATIONSHIP_DEFAULTS.HOSTILE]: "NPCLOG.Relationship.Hostile"
  };
  return game.i18n.localize(localizationKeys[key] ?? localizationKeys[RELATIONSHIP_DEFAULTS.NEUTRAL]);
}

function readFormState(form) {
  if (!form) return {};
  const formData = new FormData(form);
  const persistedFields = readPersistentFormFields(form);
  return {
    persistedFields,
    imageMode: normalizeChoice(formData.get("imageMode"), IMAGE_MODES, IMAGE_MODES.PORTRAIT),
    cardStyle: normalizeChoice(formData.get("cardStyle"), CARD_STYLES, CARD_STYLES.PORTRAIT),
    sortMode: normalizeSortMode(formData.get("sortMode")),
    openAfterSave: formData.has("openAfterSave"),
    cardImageSize: formData.get("cardImageSize")
      ? normalizeChoice(formData.get("cardImageSize"), CARD_IMAGE_SIZES, CARD_IMAGE_SIZES.MEDIUM)
      : undefined,
    journalUuid: String(formData.get("journalUuid") ?? ""),
    pageUuid: String(formData.get("pageUuid") ?? ""),
    pageName: formData.has("pageName") ? String(formData.get("pageName") ?? "") : undefined,
    description: formData.has("description") ? String(formData.get("description") ?? "") : undefined
  };
}

function readPersistentFormFields(form) {
  const excluded = new Set(["description", "pageName"]);
  const fields = {};
  for (const element of form?.elements ?? []) {
    const name = element.name;
    if (!name || excluded.has(name)) continue;
    if (element.type === "checkbox") {
      if (!Object.prototype.hasOwnProperty.call(fields, name)) fields[name] = [];
      if (element.checked) fields[name].push(element.value || "on");
      continue;
    }
    if (element.type === "radio" && !element.checked) continue;
    if (element.disabled && !String(name).startsWith("customFieldValue:")) continue;
    fields[name] = [String(element.value ?? "")];
  }
  return fields;
}

function getFormStateFromSavedFields(fields = {}) {
  const state = { persistedFields: fields };
  if (Object.prototype.hasOwnProperty.call(fields, "imageMode")) state.imageMode = normalizeChoice(getPersistentFieldValue(fields, "imageMode"), IMAGE_MODES, IMAGE_MODES.PORTRAIT);
  if (Object.prototype.hasOwnProperty.call(fields, "cardStyle")) state.cardStyle = normalizeChoice(getPersistentFieldValue(fields, "cardStyle"), CARD_STYLES, CARD_STYLES.PORTRAIT);
  if (Object.prototype.hasOwnProperty.call(fields, "cardImageSize")) state.cardImageSize = normalizeChoice(getPersistentFieldValue(fields, "cardImageSize"), CARD_IMAGE_SIZES, CARD_IMAGE_SIZES.MEDIUM);
  if (Object.prototype.hasOwnProperty.call(fields, "journalUuid")) state.journalUuid = getPersistentFieldValue(fields, "journalUuid");
  if (Object.prototype.hasOwnProperty.call(fields, "pageUuid")) state.pageUuid = getPersistentFieldValue(fields, "pageUuid");
  if (Object.prototype.hasOwnProperty.call(fields, "openAfterSave")) state.openAfterSave = getPersistentFieldValues(fields, "openAfterSave").length > 0;
  return state;
}

function getPersistentFieldValues(fields, name) {
  const values = fields?.[name];
  return Array.isArray(values) ? values.map(String) : [];
}

function getPersistentFieldValue(fields, name) {
  return getPersistentFieldValues(fields, name)[0];
}

function normalizeSortMode(value) {
  return Object.values(SORT_MODES).includes(value) ? value : SORT_MODES.TYPE;
}

function getSavedAddDialogState() {
  const state = game.settings.get(MODULE_ID, SETTINGS.ADD_DIALOG_STATE);
  if (!state || typeof state !== "object") {
    return {
      openAfterSave: false,
      sortMode: SORT_MODES.TYPE,
      fields: {}
    };
  }

  return {
    openAfterSave: state.openAfterSave === true,
    sortMode: normalizeSortMode(state.sortMode),
    fields: state.fields && typeof state.fields === "object" ? state.fields : {}
  };
}

async function saveAddDialogState({ openAfterSave, sortMode, fields = {} }) {
  await game.settings.set(MODULE_ID, SETTINGS.ADD_DIALOG_STATE, {
    openAfterSave: openAfterSave === true,
    sortMode: normalizeSortMode(sortMode),
    fields
  });
}

function sortEntries(entries, sortMode) {
  const withIndex = entries.map((entry, index) => ({ ...entry, originalIndex: index }));
  if (sortMode === SORT_MODES.SELECTION) return withIndex;

  const compareName = (a, b) => a.actor.name.localeCompare(b.actor.name, game.i18n.lang);
  return withIndex.sort((a, b) => {
    if (sortMode === SORT_MODES.TYPE) {
      const type = getActorSectionLabel(a.actor).localeCompare(getActorSectionLabel(b.actor), game.i18n.lang);
      if (type) return type;
    }
    return compareName(a, b) || a.originalIndex - b.originalIndex;
  });
}

function getBatchSections(entries, imageMode, sortMode) {
  if (sortMode !== SORT_MODES.TYPE) {
    return [{
      label: game.i18n.localize("NPCLOG.AddActor.BatchSection"),
      count: entries.length,
      entries: entries.map((entry) => getBatchEntryData(entry, imageMode))
    }];
  }

  const sections = new Map();
  for (const entry of entries) {
    const sectionLabel = getActorSectionLabel(entry.actor);
    if (!sections.has(sectionLabel)) sections.set(sectionLabel, []);
    sections.get(sectionLabel).push(getBatchEntryData(entry, imageMode));
  }

  return Array.from(sections, ([label, entries]) => ({
    label,
    count: entries.length,
    entries
  }));
}

function getBatchEntryData(entry, imageMode) {
  const imageSources = getActorImageSources(entry);
  return {
    actor: entry.actor,
    portrait: imageSources.portrait,
    token: imageSources.token,
    image: getImageForMode(imageSources, imageMode),
    description: getActorDescriptionPreview(entry.actor)
  };
}

function getActorImageSources(entry) {
  return {
    portrait: entry.actor?.img ?? "",
    token: entry.tokenDocument?.texture?.src
      ?? entry.actor?.prototypeToken?.texture?.src
      ?? ""
  };
}

function getActorSectionLabel(actor) {
  const type = actor?.type ?? "";
  const labelKey = globalThis.CONFIG?.Actor?.typeLabels?.[type];
  const localized = localizeMaybe(labelKey);
  if (localized) return localized;
  return humanizeSlug(type) || game.i18n.localize("NPCLOG.AddActor.Section.Other");
}

function getActorDescriptionPreview(actor) {
  const system = actor?.system ?? {};
  const level = system.details?.level?.value ?? system.details?.level ?? actor?.level;
  const parts = [
    Number.isFinite(Number(level)) && Number(level) > 0
      ? game.i18n.format("NPCLOG.ActorMeta.Level", { level: Number(level) })
      : "",
    humanizeSlug(actor?.type)
  ].filter(Boolean);
  return Array.from(new Set(parts)).join(" - ");
}

function localizeMaybe(value) {
  if (typeof value !== "string" || !value) return "";
  const localized = game.i18n.localize(value);
  if (localized && localized !== value) return localized;
  return value.includes(".") ? "" : value;
}

function humanizeSlug(value) {
  if (typeof value !== "string" || !value.trim()) return "";
  return value
    .replace(/[-_]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (character) => character.toLocaleUpperCase(game.i18n.lang));
}

function normalizeActorEntries({ actor, tokenDocument, entries }) {
  const candidates = Array.isArray(entries) && entries.length
    ? entries
    : [{ actor, tokenDocument }];
  const seen = new Set();
  return candidates
    .map((entry) => ({
      actor: entry.actor,
      tokenDocument: entry.tokenDocument ?? null
    }))
    .filter((entry) => {
      if (!(entry.actor instanceof Actor)) return false;
      const key = entry.tokenDocument?.uuid ?? entry.actor.uuid;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}
