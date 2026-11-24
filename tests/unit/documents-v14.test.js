/**
 * Actor, item and scene formatting against v14 core and dnd5e 6.x data.
 *
 * Document doubles are plain objects shaped after the public data models:
 * ActiveEffect (img, system.changes), Scene/Level (initialLevel,
 * Level#background, Level#textures, environment.darknessLevel) and dnd5e
 * 6.0.6 actor/item system data (source object, spell `prepared`/`method`/
 * `properties`, ability `save.value`, item `weight.value`).
 */

import { ActorsAPI, formatSource, hasSpellProperty } from '../../scripts/routes/actors.js';
import { ItemsAPI } from '../../scripts/routes/items.js';
import {
  sceneBackgroundSrc,
  sceneForegroundSrc,
  formatSceneBackground
} from '../../scripts/routes/scenes.js';

function collection(list) {
  return { values: () => list.values(), [Symbol.iterator]: () => list.values() };
}

function dnd5eNpc() {
  const spell = {
    id: 'spell00000000001',
    name: 'Fire Bolt',
    type: 'spell',
    img: 'x.webp',
    system: {
      level: 0,
      school: 'evo',
      method: 'spell',
      prepared: 1,
      activation: { type: 'action', value: 1 },
      range: { value: 120 },
      duration: { value: '' },
      properties: new Set(['vocal', 'somatic'])
    }
  };
  return {
    id: 'actor00000000001',
    name: 'Kobold',
    type: 'npc',
    img: 'k.webp',
    hasPlayerOwner: false,
    folder: null,
    ownership: {},
    flags: {},
    prototypeToken: { texture: { src: 't.webp', scaleX: 1 }, disposition: -1 },
    system: {
      attributes: { hp: { value: 0, max: 5 }, ac: { value: 12 } },
      details: { cr: 0, biography: { value: '' } },
      source: { book: 'MM', page: '195', label: 'MM pg. 195' },
      abilities: { str: { value: 7, mod: -2, proficient: 0, save: { value: -2, bonus: 0 } } },
      skills: {},
      spells: {}
    },
    items: collection([spell]),
    effects: [
      {
        id: 'effect0000000001',
        name: 'Poisoned',
        img: 'icons/poison.svg',
        disabled: false,
        duration: { value: null, units: 'seconds' }
      }
    ]
  };
}

describe('ActorsAPI with dnd5e 6.x data', () => {
  const api = new ActorsAPI();

  test('keeps zero HP and CR 0 instead of turning them into null', () => {
    const summary = api.formatActorSummary(dnd5eNpc());
    expect(summary.hp).toEqual({ current: 0, max: 5 });
    expect(summary.cr).toBe(0);
    expect(summary.ac).toBe(12);
  });

  test('reads the source label from the dnd5e source object', () => {
    expect(api.formatActorSummary(dnd5eNpc()).source).toBe('MM pg. 195');
    expect(formatSource('PHB')).toBe('PHB');
    expect(formatSource({ book: 'MM' })).toBe('MM');
    expect(formatSource(undefined)).toBeNull();
  });

  test('reports the ability save total, not the save object', () => {
    const detail = api.formatActorDetail(dnd5eNpc());
    expect(detail.abilities.str.save).toBe(-2);
  });

  test('reads spell preparation and components from dnd5e 5+ fields', () => {
    const spell = api.formatActorDetail(dnd5eNpc()).spells.spells[0][0];
    expect(spell.prepared).toBe(true);
    expect(spell.method).toBe('spell');
    expect(spell.castingTime).toBe(1);
    expect(spell.components).toEqual({
      verbal: true,
      somatic: true,
      material: false,
      concentration: false
    });
  });

  test('uses ActiveEffect#img for the effect icon', () => {
    const effect = api.formatActorDetail(dnd5eNpc()).effects[0];
    expect(effect).toMatchObject({ name: 'Poisoned', icon: 'icons/poison.svg' });
  });

  test('reports the prepared skill total beside the proficiency multiplier (#6)', () => {
    const skills = api.formatSkills({
      prc: { value: 1, total: 5, bonus: 0, passive: 15 },
      ste: { value: 0 }
    });
    expect(skills.prc).toMatchObject({ value: 1, total: 5, passive: 15 });
    expect(skills.ste.total).toBeNull();
  });

  test('hasSpellProperty still reads pre-3.0 component booleans', () => {
    expect(hasSpellProperty({ components: { vocal: true } }, 'vocal')).toBe(true);
    expect(hasSpellProperty({ properties: ['material'] }, 'material')).toBe(true);
    expect(hasSpellProperty({}, 'vocal')).toBe(false);
  });
});

describe('ItemsAPI with v14 effects and dnd5e 6.x items', () => {
  const api = new ItemsAPI();

  test('reads weight.value and the source label', () => {
    const summary = api.formatItemSummary({
      id: 'item000000000001',
      name: 'Rope',
      type: 'loot',
      img: 'r.webp',
      system: {
        weight: { value: 10, units: 'lb' },
        price: { value: 1, denomination: 'gp' },
        source: { label: 'PHB' }
      }
    });
    expect(summary.weight).toBe(10);
    expect(summary.source).toBe('PHB');
  });

  test('search keeps the id of actor-owned items, whose id is a getter (#6)', () => {
    // Document#id is a prototype getter over _id; an object spread drops it.
    class FakeItem {
      constructor(data) {
        Object.assign(this, data);
      }
      get id() {
        return this._id;
      }
    }
    const owned = new FakeItem({
      _id: 'owned00000000001',
      name: 'Dagger',
      type: 'weapon',
      system: {}
    });
    global.game = {
      items: new Map(),
      actors: new Map([['a1', { id: 'a1', name: 'Kobold', items: new Map([[owned.id, owned]]) }]])
    };
    let body;
    const res = {
      json: (data) => {
        body = data;
        return res;
      },
      status: () => res
    };

    api.searchItems({ query: {} }, res);

    expect(body.data[0]).toMatchObject({
      id: 'owned00000000001',
      name: 'Dagger',
      owner: { id: 'a1', name: 'Kobold' }
    });
  });

  test('reads effect changes from system.changes and the icon from img', () => {
    const changes = [{ key: 'system.attributes.ac.bonus', type: 'add', value: '1' }];
    const detail = api.formatItemDetail({
      id: 'item000000000002',
      name: 'Ring',
      type: 'equipment',
      img: 'ring.webp',
      flags: {},
      system: {},
      effects: [
        {
          id: 'e1',
          name: 'Protection',
          img: 'p.svg',
          disabled: false,
          transfer: true,
          system: { changes }
        }
      ]
    });
    expect(detail.effects[0]).toMatchObject({ name: 'Protection', icon: 'p.svg', changes });
  });
});

describe('scene images on v14 Levels and v13 scenes', () => {
  const v14Scene = {
    shiftX: 10,
    shiftY: -5,
    initialLevel: {
      background: { src: 'maps/level0.webp' },
      foreground: { src: 'maps/roof.webp' },
      textures: { scaleX: 2, scaleY: 3 }
    },
    // v14 keeps a deprecated getter that logs a warning; reaching it is a failure here.
    get background() {
      throw new Error('Scene#background is deprecated');
    },
    get foreground() {
      throw new Error('Scene#foreground is deprecated');
    }
  };

  test('v14: reads images from the initial Level without touching deprecated getters', () => {
    expect(sceneBackgroundSrc(v14Scene)).toBe('maps/level0.webp');
    expect(sceneForegroundSrc(v14Scene)).toBe('maps/roof.webp');
    expect(formatSceneBackground(v14Scene)).toEqual({
      src: 'maps/level0.webp',
      offsetX: 10,
      offsetY: -5,
      scaleX: 2,
      scaleY: 3
    });
  });

  test('v13: falls back to Scene#background and Scene#foreground', () => {
    const v13Scene = {
      background: { src: 'maps/old.webp', scaleX: 1, scaleY: 1 },
      foreground: 'maps/fg.webp'
    };
    expect(sceneBackgroundSrc(v13Scene)).toBe('maps/old.webp');
    expect(sceneForegroundSrc(v13Scene)).toBe('maps/fg.webp');
  });
});
