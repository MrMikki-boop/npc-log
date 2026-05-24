import {
  CARD_FRAMES,
  CARD_IMAGE_SIZES,
  CARD_STYLES,
  CUSTOM_FIELD_TYPES,
  DEFAULT_JOURNAL_NAME_KEY,
  DEFAULT_PAGE_NAME_KEY,
  DUPLICATE_MODES,
  IMAGE_MODES,
  MODULE_ID,
  NPC_CUSTOM_FIELD_ATTRIBUTE,
  NPC_ENTRY_ATTRIBUTE,
  NPC_ENTRY_ID_ATTRIBUTE,
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
    const notify = options.notify !== false;
    if (!this.canManage()) {
      return this.#fail("NPCLOG.Notifications.PermissionDenied", {}, { notify });
    }

    const actor = await this.#resolveActor(actorOrId);
    if (!actor) return this.#fail("NPCLOG.Notifications.ActorMissing", {}, { notify });

    const target = await this.#resolveTarget(options);
    if (!target?.page) return null;
    await this.#ensurePlayerObserver(target.journal, target.page);

    if (!this.#canUpdatePage(target.page)) {
      return this.#fail("NPCLOG.Notifications.PagePermissionDenied", { name: target.page.name }, { notify });
    }

    const currentContent = this.#getPageContent(target.page);
    const prepared = this.#prepareActorEntry(actor, options, target, currentContent, { notify });
    if (!prepared) return null;

    await target.page.update({
      "text.content": prepared.nextContent,
      "text.format": HTML_FORMAT
    });

    const notificationKey = prepared.result.updated
      ? "NPCLOG.Notifications.Updated"
      : prepared.result.duplicate
        ? "NPCLOG.Notifications.AddedCopy"
        : "NPCLOG.Notifications.Added";
    if (notify) ui.notifications?.info(game.i18n.format(notificationKey, {
      name: actor.name,
      page: target.page.name
    }));
    if (options.openAfterSave) this.#openJournalPage(target.journal, target.page);

    return prepared.result;
  }

  async addActorsToNpcLog(entries, options = {}) {
    const notify = options.notify !== false;
    if (!this.canManage()) {
      return this.#fail("NPCLOG.Notifications.PermissionDenied", {}, { notify });
    }

    const actorEntries = await this.#resolveActorEntries(entries);
    if (!actorEntries.length) return this.#fail("NPCLOG.Notifications.ActorMissing", {}, { notify });

    const target = await this.#resolveTarget(options);
    if (!target?.page) return null;
    await this.#ensurePlayerObserver(target.journal, target.page);

    if (!this.#canUpdatePage(target.page)) {
      return this.#fail("NPCLOG.Notifications.PagePermissionDenied", { name: target.page.name }, { notify });
    }

    let nextContent = this.#getPageContent(target.page);
    const results = [];
    for (const entry of actorEntries) {
      const prepared = this.#prepareActorEntry(entry.actor, {
        ...options,
        token: entry.token,
        tokenDocument: entry.tokenDocument,
        openAfterSave: false
      }, target, nextContent, { notify: false });
      if (!prepared) {
        results.push({
          actor: entry.actor,
          journal: target.journal,
          page: target.page,
          failed: true,
          skipped: true,
          updated: false
        });
        continue;
      }
      nextContent = prepared.nextContent;
      results.push(prepared.result);
    }

    const saved = results.filter((result) => !result.skipped && !result.failed).length;
    if (saved) {
      await target.page.update({
        "text.content": nextContent,
        "text.format": HTML_FORMAT
      });
    }

    const skipped = results.length - saved;
    if (notify) {
      ui.notifications?.info(game.i18n.format("NPCLOG.Notifications.BatchSaved", {
        saved,
        skipped,
        page: target.page.name
      }));
    }
    if (saved && options.openAfterSave) this.#openJournalPage(target.journal, target.page);

    return {
      journal: target.journal,
      page: target.page,
      results,
      saved,
      skipped,
      opened: Boolean(saved && options.openAfterSave)
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

  getActorCustomFields(actor, page) {
    if (!(actor instanceof Actor) || !page) return [];
    return this.#getActorCustomFieldsFromContent(this.#getPageContent(page), actor.uuid);
  }

  async #resolveTarget(options) {
    const notify = options.notify !== false;
    const createPage = options.createPage === true;
    let journal = await this.#resolveJournal(options.journal ?? options.journalUuid ?? game.settings.get(MODULE_ID, SETTINGS.TARGET_JOURNAL_UUID));
    let page = createPage ? null : await this.#resolvePage(options.page ?? options.pageUuid ?? game.settings.get(MODULE_ID, SETTINGS.TARGET_PAGE_UUID), journal);
    if (!journal && page?.parent instanceof JournalEntry) journal = page.parent;
    if (journal && page?.parent?.uuid !== journal.uuid) page = null;

    if (journal && page) return { journal, page };

    const autoCreate = options.autoCreate ?? game.settings.get(MODULE_ID, SETTINGS.AUTO_CREATE);
    if (!journal && !autoCreate) {
      return this.#fail("NPCLOG.Notifications.TargetMissing", {}, { notify });
    }

    if (!journal) {
      journal = this.#findDefaultJournal() ?? await JournalEntry.create({
        name: game.i18n.localize(DEFAULT_JOURNAL_NAME_KEY),
        ...this.#getDefaultOwnershipCreateData(),
        pages: []
      });
      if (journal) await game.settings.set(MODULE_ID, SETTINGS.TARGET_JOURNAL_UUID, journal.uuid);
    }

    if (createPage) {
      const pageName = this.#normalizePageName(options.pageName);
      if (!pageName) return this.#fail("NPCLOG.Notifications.PageNameMissing", {}, { notify });
      page = await this.#createPage(journal, pageName);
      await game.settings.set(MODULE_ID, SETTINGS.TARGET_PAGE_UUID, page.uuid);
      return { journal, page };
    }

    if (!autoCreate) {
      return this.#fail("NPCLOG.Notifications.TargetMissing", {}, { notify });
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

    return this.#createPage(journal, game.i18n.localize(DEFAULT_PAGE_NAME_KEY));
  }

  async #createPage(journal, name) {
    const [page] = await journal.createEmbeddedDocuments("JournalEntryPage", [{
      name,
      type: TEXT_PAGE_TYPE,
      text: {
        format: HTML_FORMAT,
        content: ""
      }
    }]);
    return page;
  }

  #normalizePageName(value) {
    return String(value ?? "").replace(/\s+/g, " ").trim().slice(0, 120);
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

  async #resolveActorEntries(entries) {
    const candidates = Array.isArray(entries) ? entries : [entries];
    const resolved = [];
    const seen = new Set();
    for (const candidate of candidates) {
      const actor = await this.#resolveActor(candidate?.actor ?? candidate);
      if (!actor) continue;
      const token = candidate?.token ?? null;
      const tokenDocument = candidate?.tokenDocument ?? token?.document ?? null;
      const key = tokenDocument?.uuid ?? actor.uuid;
      if (seen.has(key)) continue;
      seen.add(key);
      resolved.push({ actor, token, tokenDocument });
    }
    return resolved;
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
    return [DUPLICATE_MODES.UPDATE, DUPLICATE_MODES.COPY].includes(configured) ? configured : DUPLICATE_MODES.UPDATE;
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
      this.#isMetaFieldEnabled(SETTINGS.INCLUDE_META_TRAITS) ? this.#getActorTraitLabel(actor) : "",
      this.#isMetaFieldEnabled(SETTINGS.INCLUDE_META_SIZE) ? this.#getActorSizeLabel(system) : ""
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
      return [SETTINGS.INCLUDE_META_TYPE, SETTINGS.INCLUDE_META_LEVEL, SETTINGS.INCLUDE_META_CR, SETTINGS.INCLUDE_META_SIZE];
    }
    if (systemId === "pf2e") {
      return [SETTINGS.INCLUDE_META_LEVEL, SETTINGS.INCLUDE_META_RARITY, SETTINGS.INCLUDE_META_TRAITS, SETTINGS.INCLUDE_META_SIZE];
    }
    return [SETTINGS.INCLUDE_META_TYPE, SETTINGS.INCLUDE_META_LEVEL, SETTINGS.INCLUDE_META_SIZE];
  }

  #getActorTypeLabel(actor) {
    const system = actor?.system ?? {};
    const detailsType = system.details?.type;
    const dndType = this.#localizeMaybe(detailsType?.label)
      ?? this.#localizeMaybe(detailsType?.custom)
      ?? this.#localizeConfigLabel(detailsType?.value, globalThis.CONFIG?.DND5E?.creatureTypes);
    if (dndType) return dndType;

    const ancestry = system.details?.race
      ?? system.details?.species
      ?? system.details?.ancestry
      ?? system.traits?.ancestry;
    const ancestryLabel = this.#localizeMaybe(ancestry?.label)
      ?? this.#localizeMaybe(ancestry?.name)
      ?? this.#localizeMaybe(ancestry?.value)
      ?? this.#localizeMaybe(ancestry);
    if (ancestryLabel) return ancestryLabel;

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

  #getActorSizeLabel(system) {
    const size = system.traits?.size
      ?? system.details?.size
      ?? system.size;
    const label = this.#localizeConfigLabel(size, globalThis.CONFIG?.DND5E?.actorSizes)
      ?? this.#localizeConfigLabel(size, globalThis.CONFIG?.DND5E?.tokenSizes)
      ?? this.#localizeConfigLabel(size, globalThis.CONFIG?.PF2E?.actorSizes)
      ?? this.#localizeMaybe(size)
      ?? this.#humanizeSlug(size);
    return label ? game.i18n.format("NPCLOG.ActorMeta.Size", { size: label }) : "";
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
    return Boolean(this.#findActorEntryElement(content, actorUuid));
  }

  #getActorDescriptionFromContent(content, actorUuid) {
    return this.#getActorDescriptionFromEntry(this.#findActorEntryElement(content, actorUuid));
  }

  #getActorDescriptionFromEntry(entry) {
    const description = entry?.querySelector?.(`.${MODULE_ID}-npc-entry__description`);
    if (!description || description.classList.contains(`${MODULE_ID}-npc-entry__description--empty`)) return null;
    const text = description.textContent?.replace(/\s+/g, " ").trim() ?? "";
    return text || null;
  }

  #getActorCustomFieldsFromContent(content, actorUuid) {
    return this.#getActorCustomFieldsFromEntry(this.#findActorEntryElement(content, actorUuid));
  }

  #getActorCustomFieldsFromEntry(entry) {
    if (!entry) return [];

    return Array.from(entry.querySelectorAll(`[${NPC_CUSTOM_FIELD_ATTRIBUTE}]`))
      .map((element) => ({
        id: element.getAttribute(NPC_CUSTOM_FIELD_ATTRIBUTE),
        label: element.dataset.label ?? "",
        type: element.dataset.type ?? CUSTOM_FIELD_TYPES.CHECKBOX,
        value: element.dataset.value ?? "true",
        path: element.dataset.path ?? ""
      }))
      .filter((field) => field.id && field.label);
  }

  #prepareActorEntry(actor, options, target, currentContent, { notify = true } = {}) {
    const imageMode = this.#normalizeImageMode(options.imageMode);
    const image = this.#getActorImage(actor, imageMode, options);
    if (!image.src) {
      return this.#fail("NPCLOG.Notifications.ImageMissing", { name: actor.name }, { notify });
    }

    const existingEntry = this.#findActorEntryElement(currentContent, actor.uuid);
    const duplicate = Boolean(existingEntry);
    const duplicateMode = this.#normalizeDuplicateMode(options.duplicateMode, options);
    const cardStyle = this.#normalizeCardStyle(options.cardStyle);
    const cardImageSize = this.#normalizeCardImageSize(options.cardImageSize);
    const cardFrame = this.#normalizeCardFrame(options.cardFrame);
    const resultBase = {
      actor,
      journal: target.journal,
      page: target.page,
      imageMode,
      cardStyle,
      cardImageSize,
      cardFrame,
      duplicateMode,
      duplicate
    };

    if (duplicate && duplicateMode === DUPLICATE_MODES.SKIP) {
      if (notify) ui.notifications?.warn(game.i18n.format("NPCLOG.Notifications.Duplicate", { name: actor.name }));
      return {
        nextContent: currentContent,
        result: {
          ...resultBase,
          skipped: true,
          updated: false
        }
      };
    }

    const shouldUpdate = duplicate && duplicateMode === DUPLICATE_MODES.UPDATE;
    const entryId = shouldUpdate
      ? this.#getEntryId(existingEntry, actor.uuid)
      : duplicate
        ? this.#createEntryId(actor.uuid)
        : actor.uuid;
    const existingDescription = duplicate ? this.#getActorDescriptionFromEntry(existingEntry) : null;
    const description = this.#normalizeDescription(options.description ?? existingDescription ?? this.getSuggestedDescription(actor));
    const summary = this.#getActorSummary(actor);
    const existingCustomFields = duplicate ? this.#getActorCustomFieldsFromEntry(existingEntry) : [];
    const customFieldInput = typeof options.customFields === "function"
      ? options.customFields(actor, options)
      : options.customFields;
    const customFields = this.#normalizeCustomFields(customFieldInput, existingCustomFields, options.customFieldDefinitionIds, actor);
    const block = this.#renderNpcBlock(actor, image.src, imageMode, description, cardStyle, cardImageSize, cardFrame, summary, customFields, entryId);
    const nextContent = shouldUpdate
      ? this.#replaceActorContent(currentContent, actor.uuid, block, entryId)
      : this.#appendContent(currentContent, block);

    return {
      nextContent,
      result: {
        ...resultBase,
        entryId,
        image: image.src,
        description,
        summary,
        customFields,
        opened: Boolean(options.openAfterSave),
        skipped: false,
        updated: shouldUpdate
      }
    };
  }

  #findActorEntryElement(content, actorUuid, entryId = actorUuid) {
    const document = new DOMParser().parseFromString(`<main>${content}</main>`, "text/html");
    return this.#findActorEntryInDocument(document, actorUuid, entryId);
  }

  #findActorEntryInDocument(document, actorUuid, entryId = actorUuid) {
    const entries = Array.from(document.querySelectorAll(`[${NPC_ENTRY_ATTRIBUTE}]`))
      .filter((entry) => entry.getAttribute(NPC_ENTRY_ATTRIBUTE) === actorUuid);
    return entries.find((entry) => entry.getAttribute(NPC_ENTRY_ID_ATTRIBUTE) === entryId)
      ?? entries.find((entry) => !entry.hasAttribute(NPC_ENTRY_ID_ATTRIBUTE))
      ?? entries[0]
      ?? null;
  }

  #getEntryId(entry, fallback) {
    return entry?.getAttribute?.(NPC_ENTRY_ID_ATTRIBUTE) || fallback;
  }

  #createEntryId(actorUuid) {
    const suffix = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    return `${actorUuid}:${suffix}`;
  }

  #normalizeCustomFields(fields, existingFields = [], definitionIds = [], actor = null) {
    if (fields === undefined) return existingFields;

    const activeIds = new Set(Array.isArray(definitionIds) ? definitionIds.map(String) : []);
    const normalized = Array.isArray(fields)
      ? fields.map((field) => this.#normalizeCustomField(field, actor)).filter(Boolean)
      : [];
    const normalizedIds = new Set(normalized.map((field) => field.id));
    const preservedOrphans = existingFields
      .map((field) => this.#normalizeCustomField(field, actor))
      .filter((field) => field && !activeIds.has(field.id) && !normalizedIds.has(field.id));
    return [...normalized, ...preservedOrphans];
  }

  #normalizeCustomField(field, actor = null) {
    const id = String(field?.id ?? "").replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 64);
    const label = String(field?.label ?? "").replace(/\s+/g, " ").trim().slice(0, 80);
    const type = Object.values(CUSTOM_FIELD_TYPES).includes(field?.type) ? field.type : CUSTOM_FIELD_TYPES.CHECKBOX;
    const path = String(field?.path ?? "").replace(/\s+/g, " ").trim().slice(0, 240);
    const value = this.#normalizeCustomFieldValue(field?.value);
    if (!id || !label) return null;
    if (type === CUSTOM_FIELD_TYPES.CHECKBOX) return { id, label, type, value: "true" };
    if (!value) return null;
    return { id, label, type, value, path };
  }

  #normalizeCustomFieldValue(value) {
    if (value === null || value === undefined || value === "") return "";
    if (Array.isArray(value)) return value.map((entry) => this.#normalizeCustomFieldValue(entry)).filter(Boolean).join(", ");
    if (typeof value === "object") {
      if ("label" in value) return this.#normalizeCustomFieldValue(value.label);
      if ("value" in value) return this.#normalizeCustomFieldValue(value.value);
      return "";
    }
    return String(value).replace(/\s+/g, " ").trim().slice(0, 160);
  }

  #replaceActorContent(content, actorUuid, block, entryId = actorUuid) {
    const document = new DOMParser().parseFromString(`<main>${content}</main>`, "text/html");
    const entry = this.#findActorEntryInDocument(document, actorUuid, entryId);
    if (!entry) return this.#appendContent(content, block);

    const replacement = new DOMParser().parseFromString(block, "text/html").body.firstElementChild;
    if (!replacement) return content;
    entry.replaceWith(replacement);
    return document.body.firstElementChild?.innerHTML ?? content;
  }

  #renderNpcBlock(actor, imageSrc, imageMode, description, cardStyle, cardImageSize, cardFrame, summary, customFields = [], entryId = actor.uuid) {
    const escape = foundry.utils.escapeHTML;
    const descriptionHtml = description
      ? `<p class="${MODULE_ID}-npc-entry__description">${escape(description)}</p>`
      : `<p class="${MODULE_ID}-npc-entry__description ${MODULE_ID}-npc-entry__description--empty">${escape(game.i18n.localize("NPCLOG.Journal.NoDescription"))}</p>`;
    const metaHtml = this.#renderMetaList(summary, customFields);
    const summaryHtml = metaHtml
      ? `<ul class="${MODULE_ID}-npc-entry__meta">${metaHtml}</ul>`
      : "";
    const classes = [
      NPC_ENTRY_CLASS,
      `${NPC_ENTRY_CLASS}--${cardStyle}`,
      `${NPC_ENTRY_CLASS}--image-${cardImageSize}`,
      `${NPC_ENTRY_CLASS}--frame-${cardFrame}`
    ].join(" ");
    return [
      `<section class="${classes}" ${NPC_ENTRY_ATTRIBUTE}="${escape(actor.uuid)}" ${NPC_ENTRY_ID_ATTRIBUTE}="${escape(entryId)}" data-image-mode="${escape(imageMode)}" data-card-style="${escape(cardStyle)}" data-image-size="${escape(cardImageSize)}" data-card-frame="${escape(cardFrame)}">`,
      `<img class="${MODULE_ID}-npc-entry__image" src="${escape(imageSrc)}" alt="${escape(actor.name)}" loading="lazy">`,
      `<div class="${MODULE_ID}-npc-entry__body">`,
      `<h3 class="${MODULE_ID}-npc-entry__name">${this.#renderActorLink(actor)}</h3>`,
      summaryHtml,
      descriptionHtml,
      "</div>",
      "</section>"
    ].join("");
  }

  #renderMetaList(summary, customFields) {
    const escape = foundry.utils.escapeHTML;
    const systemItems = summary.map((part) => `<li>${escape(part)}</li>`);
    const customItems = customFields.map((field) => {
      const hasValue = field.type !== CUSTOM_FIELD_TYPES.CHECKBOX && field.value && field.value !== "true";
      const content = hasValue
        ? `<strong>${escape(field.label)}:</strong> ${escape(field.value)}`
        : `<strong>${escape(field.label)}</strong>`;
      return [
        `<li ${NPC_CUSTOM_FIELD_ATTRIBUTE}="${escape(field.id)}"`,
        ` data-label="${escape(field.label)}"`,
        ` data-type="${escape(field.type)}"`,
        field.path ? ` data-path="${escape(field.path)}"` : "",
        ` data-value="${escape(hasValue ? field.value : "true")}">`,
        content,
        "</li>"
      ].join("");
    });
    return [...systemItems, ...customItems].join("");
  }

  #renderActorLink(actor) {
    const escape = foundry.utils.escapeHTML;
    const label = this.#getActorDisplayName(actor);
    return [
      `<a class="content-link ${MODULE_ID}-npc-entry__actor-link" draggable="true" data-link data-uuid="${escape(actor.uuid)}" data-id="${escape(actor.id)}" data-type="Actor" title="${escape(actor.name)}">`,
      `<i class="fas fa-user" inert></i>`,
      escape(label),
      "</a>"
    ].join("");
  }

  #getActorDisplayName(actor) {
    const name = actor?.name ?? "";
    const [localized] = name.split(/\s+\/\s+/);
    return localized?.trim() || name;
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

  #fail(key, data = {}, { notify = true } = {}) {
    if (notify) ui.notifications?.warn(game.i18n.format(key, data));
    return null;
  }
}
