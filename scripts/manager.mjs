import {
  CARD_FRAMES,
  CARD_IMAGE_SIZES,
  CARD_STYLES,
  DEFAULT_JOURNAL_NAME_KEY,
  DEFAULT_PAGE_NAME_KEY,
  DUPLICATE_MODES,
  IMAGE_MODES,
  MODULE_ID,
  NPC_ENTRY_ATTRIBUTE,
  NPC_ENTRY_CLASS,
  SETTINGS
} from "./constants.mjs";

const TEXT_PAGE_TYPE = "text";
const HTML_FORMAT = globalThis.CONST?.JOURNAL_ENTRY_PAGE_FORMATS?.HTML ?? 1;
const OBSERVER_OWNERSHIP = globalThis.CONST?.DOCUMENT_OWNERSHIP_LEVELS?.OBSERVER ?? 2;

export class NpcLogManager {
  canManage(user = game.user) {
    return Boolean(user?.isGM);
  }

  async addActorToNpcLog(actorOrId, options = {}) {
    if (!this.canManage()) {
      return this.#fail("NPCLOG.Notifications.PermissionDenied");
    }

    const actor = await this.#resolveActor(actorOrId);
    if (!actor) return this.#fail("NPCLOG.Notifications.ActorMissing");

    const imageMode = this.#normalizeImageMode(options.imageMode);
    const image = this.#getActorImage(actor, imageMode, options);
    if (!image.src) {
      return this.#fail("NPCLOG.Notifications.ImageMissing", { name: actor.name });
    }

    const target = await this.#resolveTarget(options);
    if (!target?.page) return null;
    await this.#ensurePlayerObserver(target.journal, target.page);

    if (!this.#canUpdatePage(target.page)) {
      return this.#fail("NPCLOG.Notifications.PagePermissionDenied", { name: target.page.name });
    }

    const currentContent = this.#getPageContent(target.page);
    const description = this.#normalizeDescription(options.description ?? this.getSuggestedDescription(actor));
    const cardStyle = this.#normalizeCardStyle(options.cardStyle);
    const cardImageSize = this.#normalizeCardImageSize(options.cardImageSize);
    const cardFrame = this.#normalizeCardFrame(options.cardFrame);
    const summary = this.#getActorSummary(actor);
    const block = this.#renderNpcBlock(actor, image.src, imageMode, description, cardStyle, cardImageSize, cardFrame, summary);
    const duplicate = this.#contentHasActor(currentContent, actor.uuid);
    const duplicateMode = this.#normalizeDuplicateMode(options.duplicateMode, options);
    if (duplicate && duplicateMode === DUPLICATE_MODES.SKIP) {
      ui.notifications?.warn(game.i18n.format("NPCLOG.Notifications.Duplicate", { name: actor.name }));
      return { actor, journal: target.journal, page: target.page, imageMode, cardStyle, duplicateMode, duplicate: true, skipped: true };
    }

    const shouldUpdate = duplicate && duplicateMode === DUPLICATE_MODES.UPDATE;
    const nextContent = shouldUpdate
      ? this.#replaceActorContent(currentContent, actor.uuid, block)
      : this.#appendContent(currentContent, block);
    await target.page.update({
      "text.content": nextContent,
      "text.format": HTML_FORMAT
    });

    const notificationKey = shouldUpdate
      ? "NPCLOG.Notifications.Updated"
      : duplicate
        ? "NPCLOG.Notifications.AddedCopy"
        : "NPCLOG.Notifications.Added";
    ui.notifications?.info(game.i18n.format(notificationKey, {
      name: actor.name,
      page: target.page.name
    }));
    if (options.openAfterSave) this.#openJournalPage(target.journal, target.page);

    return {
      actor,
      journal: target.journal,
      page: target.page,
      imageMode,
      cardStyle,
      cardImageSize,
      cardFrame,
      duplicateMode,
      image: image.src,
      description,
      summary,
      duplicate,
      opened: Boolean(options.openAfterSave),
      skipped: false,
      updated: shouldUpdate
    };
  }

  async getConfiguredTarget() {
    const journal = await this.#resolveJournal(game.settings.get(MODULE_ID, SETTINGS.TARGET_JOURNAL_UUID));
    const page = await this.#resolvePage(game.settings.get(MODULE_ID, SETTINGS.TARGET_PAGE_UUID), journal);
    return { journal, page };
  }

  async ensureConfiguredTargetVisibility() {
    if (!this.canManage()) return;
    const target = await this.getConfiguredTarget();
    if (target.journal) await this.#ensurePlayerObserver(target.journal, target.page);
  }

  getActorImageSources(actor, options = {}) {
    return {
      portrait: actor?.img ?? "",
      token: options.token?.texture?.src
        ?? options.tokenDocument?.texture?.src
        ?? actor?.prototypeToken?.texture?.src
        ?? ""
    };
  }

  getSuggestedDescription(actor) {
    const system = actor?.system ?? {};
    const candidateHtml = [
      system.description,
      system.description?.value,
      system.description?.public,
      system.biography,
      system.biography?.value,
      system.biography?.public,
      system.details?.description,
      system.details?.description?.value,
      system.details?.description?.public,
      system.details?.biography?.public,
      system.details?.biography?.value,
      system.details?.notes
    ];
    const candidateText = [
      system.details?.summary,
      system.details?.notes,
      system.details?.appearance,
      system.details?.trait,
      system.details?.ideal,
      system.details?.bond,
      system.details?.flaw,
      system.traits?.description,
      system.publicNotes,
      system.notes
    ];

    for (const value of candidateHtml) {
      const text = this.#htmlToText(value);
      if (text) return this.#truncateDescription(text);
    }

    const combined = candidateText.map((value) => this.#htmlToText(value)).filter(Boolean).join(" ");
    return this.#truncateDescription(combined);
  }

  async #resolveTarget(options) {
    let journal = await this.#resolveJournal(options.journal ?? options.journalUuid ?? game.settings.get(MODULE_ID, SETTINGS.TARGET_JOURNAL_UUID));
    let page = await this.#resolvePage(options.page ?? options.pageUuid ?? game.settings.get(MODULE_ID, SETTINGS.TARGET_PAGE_UUID), journal);
    if (!journal && page?.parent instanceof JournalEntry) journal = page.parent;
    if (journal && page?.parent?.uuid !== journal.uuid) page = null;

    if (journal && page) return { journal, page };

    const autoCreate = options.autoCreate ?? game.settings.get(MODULE_ID, SETTINGS.AUTO_CREATE);
    if (!autoCreate) {
      return this.#fail("NPCLOG.Notifications.TargetMissing");
    }

    if (!journal) {
      journal = this.#findDefaultJournal() ?? await JournalEntry.create({
        name: game.i18n.localize(DEFAULT_JOURNAL_NAME_KEY),
        ...this.#getDefaultOwnershipCreateData(),
        pages: []
      });
      if (journal) await game.settings.set(MODULE_ID, SETTINGS.TARGET_JOURNAL_UUID, journal.uuid);
    }

    page = await this.#getOrCreatePage(journal);
    await game.settings.set(MODULE_ID, SETTINGS.TARGET_PAGE_UUID, page.uuid);
    return { journal, page };
  }

  async #getOrCreatePage(journal) {
    const defaultPageName = game.i18n.localize(DEFAULT_PAGE_NAME_KEY);
    const existing = journal.pages.find((page) => page.type === TEXT_PAGE_TYPE && page.name === defaultPageName)
      ?? journal.pages.find((page) => page.type === TEXT_PAGE_TYPE);
    if (existing) return existing;

    const [page] = await journal.createEmbeddedDocuments("JournalEntryPage", [{
      name: game.i18n.localize(DEFAULT_PAGE_NAME_KEY),
      type: TEXT_PAGE_TYPE,
      text: {
        format: HTML_FORMAT,
        content: ""
      }
    }]);
    return page;
  }

  #getDefaultOwnershipCreateData() {
    if (!game.settings.get(MODULE_ID, SETTINGS.SHARE_WITH_PLAYERS)) return {};
    return { ownership: { default: OBSERVER_OWNERSHIP } };
  }

  async #ensurePlayerObserver(journal, page) {
    if (!game.settings.get(MODULE_ID, SETTINGS.SHARE_WITH_PLAYERS)) return;
    await this.#ensureDefaultOwnership(journal, OBSERVER_OWNERSHIP);
    await this.#ensureDefaultOwnership(page, OBSERVER_OWNERSHIP);
  }

  async #ensureDefaultOwnership(document, minimumLevel) {
    if (!document?.ownership || typeof document.update !== "function") return;
    const current = Number(document.ownership.default ?? 0);
    if (current >= minimumLevel) return;
    try {
      await document.update({ "ownership.default": minimumLevel });
    } catch (error) {
      console.warn(`${MODULE_ID} | Failed to update journal ownership`, error);
    }
  }

  #findDefaultJournal() {
    const defaultJournalName = game.i18n.localize(DEFAULT_JOURNAL_NAME_KEY);
    return game.journal.find((journal) => journal.name === defaultJournalName) ?? null;
  }

  async #resolveActor(actorOrId) {
    if (!actorOrId) return null;
    if (actorOrId instanceof Actor) return actorOrId;
    if (typeof actorOrId !== "string") return null;
    const actor = game.actors?.get(actorOrId) ?? await this.#safeFromUuid(actorOrId);
    return actor instanceof Actor ? actor : null;
  }

  async #resolveJournal(value) {
    if (!value) return null;
    if (value instanceof JournalEntry) return value;
    if (typeof value !== "string") return null;
    const direct = game.journal?.get(value);
    if (direct) return direct;
    const document = await this.#safeFromUuid(value);
    return document instanceof JournalEntry ? document : null;
  }

  async #resolvePage(value, journal) {
    if (!value) return null;
    if (value instanceof JournalEntryPage) return value;
    if (typeof value !== "string") return null;
    const embedded = journal?.pages?.get(value);
    if (embedded?.type === TEXT_PAGE_TYPE) return embedded;
    const document = await this.#safeFromUuid(value);
    return document instanceof JournalEntryPage && document.type === TEXT_PAGE_TYPE ? document : null;
  }

  async #safeFromUuid(uuid) {
    try {
      return await fromUuid(uuid);
    } catch {
      return null;
    }
  }

  #openJournalPage(journal, page) {
    if (journal?.sheet?.render) {
      journal.sheet.render(true, { pageId: page.id, mode: "view" });
      return;
    }

    ui.sidebar?.activateTab?.("journal");
  }

  #normalizeImageMode(value) {
    if (Object.values(IMAGE_MODES).includes(value)) return value;
    const configured = game.settings.get(MODULE_ID, SETTINGS.IMAGE_MODE);
    return Object.values(IMAGE_MODES).includes(configured) ? configured : IMAGE_MODES.PORTRAIT;
  }

  #normalizeCardStyle(value) {
    if (Object.values(CARD_STYLES).includes(value)) return value;
    const configured = game.settings.get(MODULE_ID, SETTINGS.CARD_STYLE);
    return Object.values(CARD_STYLES).includes(configured) ? configured : CARD_STYLES.PORTRAIT;
  }

  #normalizeCardImageSize(value) {
    if (Object.values(CARD_IMAGE_SIZES).includes(value)) return value;
    const configured = game.settings.get(MODULE_ID, SETTINGS.CARD_IMAGE_SIZE);
    return Object.values(CARD_IMAGE_SIZES).includes(configured) ? configured : CARD_IMAGE_SIZES.MEDIUM;
  }

  #normalizeCardFrame(value) {
    if (Object.values(CARD_FRAMES).includes(value)) return value;
    const configured = game.settings.get(MODULE_ID, SETTINGS.CARD_FRAME);
    return Object.values(CARD_FRAMES).includes(configured) ? configured : CARD_FRAMES.STANDARD;
  }

  #normalizeDuplicateMode(value, options) {
    if (options.replaceExisting === true) return DUPLICATE_MODES.UPDATE;
    if (options.preventDuplicates === true) return DUPLICATE_MODES.SKIP;
    if (options.preventDuplicates === false) return DUPLICATE_MODES.COPY;
    if (Object.values(DUPLICATE_MODES).includes(value)) return value;
    if (!game.settings.get(MODULE_ID, SETTINGS.ADVANCED_SETTINGS_ENABLED)) return DUPLICATE_MODES.UPDATE;
    const configured = game.settings.get(MODULE_ID, SETTINGS.DUPLICATE_MODE);
    return Object.values(DUPLICATE_MODES).includes(configured) ? configured : DUPLICATE_MODES.UPDATE;
  }

  #getActorImage(actor, imageMode, options) {
    const tokenImage = options.token?.texture?.src
      ?? options.tokenDocument?.texture?.src
      ?? actor.prototypeToken?.texture?.src
      ?? "";
    const portraitImage = actor.img ?? "";
    const src = imageMode === IMAGE_MODES.TOKEN ? tokenImage || portraitImage : portraitImage || tokenImage;
    return { src, tokenImage, portraitImage };
  }

  #getActorSummary(actor) {
    if (!game.settings.get(MODULE_ID, SETTINGS.ADVANCED_SETTINGS_ENABLED)) return [];
    const system = actor?.system ?? {};
    const parts = [
      this.#isMetaFieldEnabled(SETTINGS.INCLUDE_META_TYPE) ? this.#getActorTypeLabel(actor) : "",
      this.#isMetaFieldEnabled(SETTINGS.INCLUDE_META_LEVEL) ? this.#getActorLevelLabel(actor) : "",
      this.#isMetaFieldEnabled(SETTINGS.INCLUDE_META_CR) ? this.#getActorChallengeLabel(system) : "",
      this.#isMetaFieldEnabled(SETTINGS.INCLUDE_META_RARITY) ? this.#getActorRarityLabel(system) : "",
      this.#isMetaFieldEnabled(SETTINGS.INCLUDE_META_TRAITS) ? this.#getActorTraitLabel(actor) : ""
    ].filter(Boolean);
    return Array.from(new Set(parts)).slice(0, 4);
  }

  #isMetaFieldEnabled(setting) {
    if (!this.#getSystemMetaSettings().includes(setting)) return false;
    return game.settings.get(MODULE_ID, setting);
  }

  #getSystemMetaSettings() {
    const systemId = game.system?.id ?? "";
    if (systemId === "dnd5e") {
      return [SETTINGS.INCLUDE_META_TYPE, SETTINGS.INCLUDE_META_LEVEL, SETTINGS.INCLUDE_META_CR];
    }
    if (systemId === "pf2e") {
      return [SETTINGS.INCLUDE_META_LEVEL, SETTINGS.INCLUDE_META_RARITY, SETTINGS.INCLUDE_META_TRAITS];
    }
    return [SETTINGS.INCLUDE_META_TYPE, SETTINGS.INCLUDE_META_LEVEL];
  }

  #getActorTypeLabel(actor) {
    const system = actor?.system ?? {};
    const detailsType = system.details?.type;
    const dndType = this.#localizeMaybe(detailsType?.label)
      ?? this.#localizeMaybe(detailsType?.custom)
      ?? this.#localizeConfigLabel(detailsType?.value, globalThis.CONFIG?.DND5E?.creatureTypes);
    if (dndType) return dndType;

    return this.#humanizeSlug(actor?.type);
  }

  #getActorTraitLabel(actor) {
    const system = actor?.system ?? {};
    const pf2eTraits = Array.isArray(system.traits?.value) ? system.traits.value : [];
    const pf2eCreatureTraits = pf2eTraits
      .map((trait) => this.#localizeConfigLabel(trait, globalThis.CONFIG?.PF2E?.creatureTraits))
      .filter(Boolean);
    if (pf2eCreatureTraits.length) return pf2eCreatureTraits.slice(0, 2).join(", ");
    return "";
  }

  #getActorLevelLabel(actor) {
    const level = actor?.system?.details?.level?.value
      ?? actor?.system?.details?.level
      ?? actor?.level;
    if (!Number.isFinite(Number(level)) || Number(level) <= 0) return "";
    return game.i18n.format("NPCLOG.ActorMeta.Level", { level: Number(level) });
  }

  #getActorChallengeLabel(system) {
    const cr = system.details?.cr;
    if (cr === null || cr === undefined || cr === "") return "";
    return game.i18n.format("NPCLOG.ActorMeta.CR", { cr: this.#formatChallengeRating(cr) });
  }

  #getActorRarityLabel(system) {
    const rarity = system.traits?.rarity;
    if (!rarity || rarity === "common") return "";
    return this.#localizeConfigLabel(rarity, globalThis.CONFIG?.PF2E?.rarityTraits) ?? this.#humanizeSlug(rarity);
  }

  #getPageContent(page) {
    return page.text?.content ?? "";
  }

  #canUpdatePage(page) {
    return page.testUserPermission?.(game.user, CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER) ?? game.user.isGM;
  }

  #contentHasActor(content, actorUuid) {
    const document = new DOMParser().parseFromString(`<main>${content}</main>`, "text/html");
    return Array.from(document.querySelectorAll(`[${NPC_ENTRY_ATTRIBUTE}]`))
      .some((entry) => entry.getAttribute(NPC_ENTRY_ATTRIBUTE) === actorUuid);
  }

  #replaceActorContent(content, actorUuid, block) {
    const document = new DOMParser().parseFromString(`<main>${content}</main>`, "text/html");
    const entry = Array.from(document.querySelectorAll(`[${NPC_ENTRY_ATTRIBUTE}]`))
      .find((element) => element.getAttribute(NPC_ENTRY_ATTRIBUTE) === actorUuid);
    if (!entry) return this.#appendContent(content, block);

    const replacement = new DOMParser().parseFromString(block, "text/html").body.firstElementChild;
    if (!replacement) return content;
    entry.replaceWith(replacement);
    return document.body.firstElementChild?.innerHTML ?? content;
  }

  #renderNpcBlock(actor, imageSrc, imageMode, description, cardStyle, cardImageSize, cardFrame, summary) {
    const escape = foundry.utils.escapeHTML;
    const descriptionHtml = description
      ? `<p class="${MODULE_ID}-npc-entry__description">${escape(description)}</p>`
      : `<p class="${MODULE_ID}-npc-entry__description ${MODULE_ID}-npc-entry__description--empty">${escape(game.i18n.localize("NPCLOG.Journal.NoDescription"))}</p>`;
    const summaryHtml = summary.length
      ? `<ul class="${MODULE_ID}-npc-entry__meta">${summary.map((part) => `<li>${escape(part)}</li>`).join("")}</ul>`
      : "";
    const classes = [
      NPC_ENTRY_CLASS,
      `${NPC_ENTRY_CLASS}--${cardStyle}`,
      `${NPC_ENTRY_CLASS}--image-${cardImageSize}`,
      `${NPC_ENTRY_CLASS}--frame-${cardFrame}`
    ].join(" ");
    return [
      `<section class="${classes}" ${NPC_ENTRY_ATTRIBUTE}="${escape(actor.uuid)}" data-image-mode="${escape(imageMode)}" data-card-style="${escape(cardStyle)}" data-image-size="${escape(cardImageSize)}" data-card-frame="${escape(cardFrame)}">`,
      `<img class="${MODULE_ID}-npc-entry__image" src="${escape(imageSrc)}" alt="${escape(actor.name)}" loading="lazy">`,
      `<div class="${MODULE_ID}-npc-entry__body">`,
      `<h3 class="${MODULE_ID}-npc-entry__name">${escape(actor.name)}</h3>`,
      summaryHtml,
      descriptionHtml,
      "</div>",
      "</section>"
    ].join("");
  }

  #normalizeDescription(value) {
    return this.#truncateDescription(this.#htmlToText(value));
  }

  #htmlToText(value) {
    if (typeof value !== "string") return "";
    const trimmed = value.trim();
    if (!trimmed) return "";
    const document = new DOMParser().parseFromString(`<main>${trimmed}</main>`, "text/html");
    return document.body.textContent?.replace(/\s+/g, " ").trim() ?? "";
  }

  #truncateDescription(value) {
    const text = String(value ?? "").replace(/\s+/g, " ").trim();
    if (text.length <= 700) return text;
    return `${text.slice(0, 697).trimEnd()}...`;
  }

  #localizeConfigLabel(value, choices) {
    if (!value || !choices) return "";
    const choice = choices[value];
    const label = typeof choice === "string" ? choice : choice?.label;
    return this.#localizeMaybe(label) ?? this.#humanizeSlug(value);
  }

  #localizeMaybe(value) {
    if (typeof value !== "string") return "";
    const trimmed = value.trim();
    if (!trimmed) return "";
    return game.i18n.has(trimmed) ? game.i18n.localize(trimmed) : trimmed;
  }

  #humanizeSlug(value) {
    if (typeof value !== "string" || !value.trim()) return "";
    return value.replace(/[-_]+/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
  }

  #formatChallengeRating(value) {
    const number = Number(value);
    if (!Number.isFinite(number)) return String(value);
    if (number === 0.125) return "1/8";
    if (number === 0.25) return "1/4";
    if (number === 0.5) return "1/2";
    return Number.isInteger(number) ? String(number) : String(value);
  }

  #appendContent(currentContent, block) {
    const content = String(currentContent ?? "").trimEnd();
    return content ? `${content}\n${block}` : block;
  }

  #fail(key, data = {}) {
    ui.notifications?.warn(game.i18n.format(key, data));
    return null;
  }
}
