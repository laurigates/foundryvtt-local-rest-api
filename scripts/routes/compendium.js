/**
 * Compendium API endpoints for the Foundry Local REST API
 *
 * Searches compendium pack indexes inside the Foundry client, which is the
 * only place pack contents are available to the bridge.
 */

/** System fields read from each pack index, reported in `system`. */
const INDEX_FIELDS = ['system.level', 'system.school', 'system.source'];

function lower(value) {
  return typeof value === 'string' ? value.toLowerCase() : '';
}

/**
 * Build the entry reported for one index entry. Absent fields are omitted,
 * not null: clients validate `img` and `system.*` as optional strings and
 * numbers.
 */
export function formatCompendiumEntry(pack, entry) {
  const result = {
    compendiumId: pack.collection,
    itemId: entry._id,
    name: entry.name,
    // Item and Actor entries have a type; JournalEntry and others do not
    type: entry.type ?? pack.documentName
  };
  if (typeof entry.img === 'string' && entry.img) {
    result.img = entry.img;
  }

  const system = {};
  if (typeof entry.system?.level === 'number') system.level = entry.system.level;
  if (typeof entry.system?.school === 'string') system.school = entry.system.school;
  const source = entry.system?.source;
  if (source && typeof source === 'object') {
    const picked = {};
    for (const key of ['rules', 'book', 'custom']) {
      if (typeof source[key] === 'string' && source[key]) picked[key] = source[key];
    }
    if (Object.keys(picked).length) system.source = picked;
  }
  if (Object.keys(system).length) {
    result.system = system;
  }
  return result;
}

/**
 * Whether an index entry passes the search filters.
 */
export function matchesCompendiumFilters(pack, entry, filters) {
  const { query, packType, itemType, spellLevel, source } = filters;
  if (query && !lower(entry.name).includes(lower(query))) return false;
  if (packType && lower(pack.documentName) !== lower(packType)) return false;
  if (itemType && lower(entry.type) !== lower(itemType)) return false;
  if (spellLevel !== undefined && entry.system?.level !== spellLevel) return false;
  if (source) {
    const s = entry.system?.source ?? {};
    const needle = lower(source);
    if (![s.rules, s.book, s.custom].some(value => lower(value).includes(needle))) return false;
  }
  return true;
}

export class CompendiumAPI {

  /**
   * Search compendium entries by name and metadata
   * GET /api/compendium/search?query=fire&packType=Item&itemType=spell&spellLevel=3&source=2014&compendiumId=dnd5e.spells&limit=20&offset=0
   *
   * Answers `{success, data: [entries], total, query}`, where `total` counts
   * every match and `data` is the page at `offset`. Each entry is
   * `{compendiumId, itemId, name, type, img?, system?: {level?, school?, source?: {rules?, book?, custom?}}}`.
   */
  async searchCompendium(req, res) {
    try {
      const { compendiumId, limit = 20, offset = 0 } = req.query;

      const matches = [];
      for (const pack of game.packs.values()) {
        if (pack.visible === false) continue;
        if (compendiumId && pack.collection !== compendiumId) continue;
        if (req.query.packType && lower(pack.documentName) !== lower(req.query.packType)) continue;

        const index = await pack.getIndex({ fields: INDEX_FIELDS });
        for (const entry of index.values()) {
          if (matchesCompendiumFilters(pack, entry, req.query)) {
            matches.push(formatCompendiumEntry(pack, entry));
          }
        }
      }

      const start = parseInt(offset);
      const data = matches.slice(start, start + parseInt(limit));

      res.json({
        success: true,
        data,
        total: matches.length,
        query: req.query
      });

    } catch (error) {
      console.error('Foundry Local REST API | Error searching compendiums:', error);
      res.status(500).json({
        success: false,
        error: 'Internal server error',
        message: error.message
      });
    }
  }
}
