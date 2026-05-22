import { CARD_IMAGE_SIZES, CARD_STYLES, IMAGE_MODES, MODULE_ID, SETTINGS, TEMPLATES } from "../constants.mjs";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

export class AddActorToNpcLogApp extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS = {
    id: `${MODULE_ID}-add-actor`,
    classes: [MODULE_ID, `${MODULE_ID}-add-actor-app`],
    window: {
      title: "NPCLOG.AddActor.Title",
      icon: "fas fa-book"
    },
    position: {
      width: 520
    },
    actions: {
      add: AddActorToNpcLogApp.#onAdd
    }
  };

  static PARTS = {
    form: {
      template: TEMPLATES.ADD_ACTOR
    }
  };

  constructor({ actor, manager, tokenDocument = null }, options = {}) {
    super(options);
    this.actor = actor;
    this.manager = manager;
    this.tokenDocument = tokenDocument;
  }

  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    const configuredTarget = await this.manager.getConfiguredTarget();
    const imageSources = this.manager.getActorImageSources(this.actor, { tokenDocument: this.tokenDocument });
    const imageMode = game.settings.get(MODULE_ID, SETTINGS.IMAGE_MODE);
    const cardStyle = game.settings.get(MODULE_ID, SETTINGS.CARD_STYLE);
    const cardImageSize = game.settings.get(MODULE_ID, SETTINGS.CARD_IMAGE_SIZE);
    const selectedImage = getImageForMode(imageSources, imageMode);
    const journals = getJournalChoices();
    const selectedJournal = configuredTarget.journal;
    return {
      ...context,
      actor: this.actor,
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
      imageSources,
      selectedImage,
      description: this.manager.getSuggestedDescription(this.actor),
      targetLabel: getTargetLabel(configuredTarget),
      hasTarget: Boolean(configuredTarget.journal && configuredTarget.page),
      autoCreate: game.settings.get(MODULE_ID, SETTINGS.AUTO_CREATE),
      target: {
        journalUuid: configuredTarget.journal?.uuid ?? "",
        pageUuid: configuredTarget.page?.uuid ?? ""
      },
      journals,
      pages: getPageChoices(selectedJournal)
    };
  }

  _onRender(context, options) {
    super._onRender(context, options);

    const journalSelect = this.element.querySelector('[name="journalUuid"]');
    const pageSelect = this.element.querySelector('[name="pageUuid"]');
    journalSelect?.addEventListener("change", () => {
      const journal = game.journal.find((entry) => entry.uuid === journalSelect.value) ?? game.journal.get(journalSelect.value);
      renderPageOptions(pageSelect, getPageChoices(journal), "");
    });

    const imageSelect = this.element.querySelector('[name="imageMode"]');
    const preview = this.element.querySelector(`.${MODULE_ID}-actor-preview img`);
    imageSelect?.addEventListener("change", () => {
      const src = getImageForMode(context.imageSources, imageSelect.value);
      if (preview && src) preview.src = src;
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
    const pageUuid = String(formData.get("pageUuid") ?? "");

    await game.settings.set(MODULE_ID, SETTINGS.IMAGE_MODE, imageMode);
    await game.settings.set(MODULE_ID, SETTINGS.CARD_STYLE, cardStyle);
    await game.settings.set(MODULE_ID, SETTINGS.TARGET_JOURNAL_UUID, journalUuid);
    await game.settings.set(MODULE_ID, SETTINGS.TARGET_PAGE_UUID, pageUuid);
    if (cardImageSize) await game.settings.set(MODULE_ID, SETTINGS.CARD_IMAGE_SIZE, cardImageSize);

    const result = await this.manager.addActorToNpcLog(this.actor, {
      imageMode,
      cardStyle,
      cardImageSize,
      journalUuid,
      pageUuid,
      tokenDocument: this.tokenDocument,
      description: formData.get("description"),
      openAfterSave: formData.has("openAfterSave")
    });
    if (result) this.close();
  }
}

function getTargetLabel({ journal, page }) {
  if (!journal || !page) return game.i18n.localize("NPCLOG.AddActor.TargetMissing");
  return game.i18n.format("NPCLOG.AddActor.TargetLabel", {
    journal: journal.name,
    page: page.name
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

function getImageForMode(sources, imageMode) {
  if (imageMode === IMAGE_MODES.TOKEN) return sources.token || sources.portrait;
  return sources.portrait || sources.token;
}

function normalizeChoice(value, choices, fallback) {
  return Object.values(choices).includes(value) ? value : fallback;
}
