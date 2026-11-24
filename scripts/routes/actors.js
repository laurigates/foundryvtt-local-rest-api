/**
 * Actors API endpoints for the Foundry Local REST API
 */

/**
 * Flatten a dnd5e source field to a label. dnd5e 4+ stores `system.source`
 * as an object ({book, page, custom, ...}) with a prepared `label`; older data
 * used a plain string under `details.source`.
 * @param {string|object|undefined} source
 * @returns {string|null}
 */
export function formatSource(source) {
  if (!source) return null;
  if (typeof source === 'string') return source;
  return source.label || source.custom || source.book || null;
}

/**
 * Whether a spell has a component. dnd5e 3+ keeps components in the
 * `properties` Set; older data used `components.<name>` booleans.
 * @param {object} system  The spell's system data
 * @param {string} name    vocal | somatic | material | concentration
 * @returns {boolean}
 */
export function hasSpellProperty(system, name) {
  const props = system?.properties;
  if (props instanceof Set) return props.has(name);
  if (Array.isArray(props)) return props.includes(name);
  return Boolean(system?.components?.[name]);
}

export class ActorsAPI {

  /**
   * Search for actors based on query parameters
   * GET /api/actors?query=name&type=character&limit=10
   */
  searchActors(req, res) {
    try {
      const { query, type, limit = 50 } = req.query;

      let actors = Array.from(game.actors.values());

      // Filter by type if specified
      if (type) {
        actors = actors.filter(actor => actor.type === type);
      }

      // Filter by query if specified (search in name)
      if (query) {
        const searchQuery = query.toLowerCase();
        actors = actors.filter(actor =>
          actor.name.toLowerCase().includes(searchQuery)
        );
      }

      // Limit results
      actors = actors.slice(0, parseInt(limit));

      // Format response
      const results = actors.map(actor => this.formatActorSummary(actor));

      res.json({
        success: true,
        data: results,
        total: results.length,
        query: { query, type, limit }
      });

    } catch (error) {
      console.error('Foundry Local REST API | Error searching actors:', error);
      res.status(500).json({
        success: false,
        error: 'Internal server error',
        message: error.message
      });
    }
  }

  /**
   * Get detailed information about a specific actor
   * GET /api/actors/:id
   */
  getActor(req, res) {
    try {
      const { id } = req.params;
      const actor = game.actors.get(id);

      if (!actor) {
        return res.status(404).json({
          success: false,
          error: 'Actor not found',
          message: `Actor with ID ${id} does not exist`
        });
      }

      const actorData = this.formatActorDetail(actor);

      res.json({
        success: true,
        data: actorData
      });

    } catch (error) {
      console.error('Foundry Local REST API | Error getting actor:', error);
      res.status(500).json({
        success: false,
        error: 'Internal server error',
        message: error.message
      });
    }
  }

  /**
   * Format actor data for summary view (search results)
   */
  formatActorSummary(actor) {
    const system = actor.system || {};

    return {
      id: actor.id,
      name: actor.name,
      type: actor.type,
      img: actor.img,
      // `??`, not `||`: 0 HP and CR 0 are real values.
      level: system.details?.level ?? system.level ?? null,
      hp: {
        current: system.attributes?.hp?.value ?? system.hp?.value ?? null,
        max: system.attributes?.hp?.max ?? system.hp?.max ?? null
      },
      ac: system.attributes?.ac?.value ?? system.ac?.value ?? null,
      cr: system.details?.cr ?? system.cr ?? null,
      source: formatSource(system.source ?? system.details?.source),
      isPC: actor.hasPlayerOwner,
      folder: actor.folder?.name || null
    };
  }

  /**
   * Format actor data for detailed view
   */
  formatActorDetail(actor) {
    const system = actor.system || {};
    const summary = this.formatActorSummary(actor);

    return {
      ...summary,
      // Additional detailed information
      abilities: this.formatAbilities(system.abilities || {}),
      skills: this.formatSkills(system.skills || {}),
      items: Array.from(actor.items.values()).map(item => ({
        id: item.id,
        name: item.name,
        type: item.type,
        img: item.img,
        quantity: item.system?.quantity || 1
      })),
      spells: this.formatSpells(actor),
      biography: system.details?.biography?.value || '',
      notes: system.details?.notes || '',
      token: {
        img: actor.prototypeToken?.texture?.src || actor.img,
        scale: actor.prototypeToken?.texture?.scaleX || 1,
        disposition: actor.prototypeToken?.disposition || 0
      },
      ownership: actor.ownership,
      flags: actor.flags,
      effects: Array.from(actor.effects || []).map(effect => ({
        id: effect.id,
        name: effect.name,
        icon: effect.img,
        disabled: effect.disabled,
        duration: effect.duration
      }))
    };
  }

  /**
   * Format ability scores
   */
  formatAbilities(abilities) {
    const formatted = {};

    for (const [key, ability] of Object.entries(abilities)) {
      if (ability && typeof ability === 'object') {
        formatted[key] = {
          value: ability.value || 10,
          modifier: ability.mod || Math.floor((ability.value - 10) / 2),
          // dnd5e 4+ prepares `save` as an object; its total is `save.value`.
          save: (typeof ability.save === 'object' ? ability.save?.value : ability.save) ?? null,
          proficient: ability.proficient || false
        };
      }
    }

    return formatted;
  }

  /**
   * Format skills
   */
  formatSkills(skills) {
    const formatted = {};

    for (const [key, skill] of Object.entries(skills)) {
      if (skill && typeof skill === 'object') {
        formatted[key] = {
          // dnd5e: `value` is the proficiency multiplier, `total` the prepared modifier
          value: skill.value || 0,
          total: skill.total ?? null,
          proficient: skill.proficient || false,
          bonus: skill.bonus || 0,
          passive: skill.passive || 10
        };
      }
    }

    return formatted;
  }

  /**
   * Format spells for spellcasters
   */
  formatSpells(actor) {
    const spells = Array.from(actor.items.values())
      .filter(item => item.type === 'spell');

    if (spells.length === 0) {
      return null;
    }

    // Group spells by level
    const spellsByLevel = {};
    spells.forEach(spell => {
      const level = spell.system?.level || 0;
      if (!spellsByLevel[level]) {
        spellsByLevel[level] = [];
      }

      spellsByLevel[level].push({
        id: spell.id,
        name: spell.name,
        level: level,
        school: spell.system?.school || '',
        // dnd5e 5+: `prepared` is a number (0 no, 1 prepared, 2 always) and
        // `method` replaces `preparation.mode`; components are `properties`.
        prepared: (spell.system?.prepared ?? spell.system?.preparation?.prepared ?? 0) > 0,
        method: spell.system?.method ?? spell.system?.preparation?.mode ?? null,
        castingTime: spell.system?.activation?.value ?? spell.system?.activation?.cost ?? '',
        range: spell.system?.range?.value || '',
        duration: spell.system?.duration?.value || '',
        components: {
          verbal: hasSpellProperty(spell.system, 'vocal'),
          somatic: hasSpellProperty(spell.system, 'somatic'),
          material: hasSpellProperty(spell.system, 'material'),
          concentration: hasSpellProperty(spell.system, 'concentration')
        }
      });
    });

    // Get spell slots if available
    const spellcasting = actor.system?.spells || {};
    const slots = {};
    for (let i = 1; i <= 9; i++) {
      const levelData = spellcasting[`spell${i}`];
      if (levelData) {
        slots[i] = {
          max: levelData.max || 0,
          value: levelData.value || 0
        };
      }
    }

    return {
      spells: spellsByLevel,
      slots: slots,
      dc: spellcasting.dc || null,
      ability: spellcasting.ability || null
    };
  }
}
