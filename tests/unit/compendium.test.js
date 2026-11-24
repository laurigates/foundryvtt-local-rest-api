/**
 * Compendium search (#6): the module reads pack indexes inside the Foundry
 * client and answers in the convention of its other search routes,
 * `{success, data: [entries], total, query}`, which foundryvtt-mcp's
 * mapRestCompendiumSearch reads (entries `{compendiumId, itemId, name, type,
 * img?, system?}`).
 *
 * Pack doubles follow CompendiumCollection: `collection` (the pack id),
 * `documentName`, `visible` and `getIndex({fields})`, which resolves to a
 * collection of index entries `{_id, name, type, img, system}`.
 */

import { CompendiumAPI } from '../../scripts/routes/compendium.js';
import { SocketMessageHandler } from '../../scripts/socket-handler.js';

function pack(collection, documentName, entries, { visible = true } = {}) {
  return {
    collection,
    documentName,
    visible,
    metadata: { id: collection, label: collection, type: documentName },
    getIndex: jest.fn(async () => new Map(entries.map((e) => [e._id, e])))
  };
}

function packsFixture() {
  return new Map([
    [
      'dnd5e.spells',
      pack('dnd5e.spells', 'Item', [
        {
          _id: 'fireball00000001',
          name: 'Fireball',
          type: 'spell',
          img: 'fireball.webp',
          system: { level: 3, school: 'evo', source: { rules: '2014', book: "Player's Handbook" } }
        },
        {
          _id: 'firebolt00000001',
          name: 'Fire Bolt',
          type: 'spell',
          img: 'firebolt.webp',
          system: { level: 0, school: 'evo', source: { rules: '2014' } }
        },
        {
          _id: 'shield0000000001',
          name: 'Shield',
          type: 'spell',
          system: { level: 1, school: 'abj', source: { rules: '2024', custom: 'Homebrew' } }
        }
      ])
    ],
    [
      'dnd5e.items',
      pack('dnd5e.items', 'Item', [
        {
          _id: 'firesword0000001',
          name: 'Fire Sword',
          type: 'weapon',
          img: 'sword.webp',
          system: {}
        }
      ])
    ],
    [
      'dnd5e.monsters',
      pack('dnd5e.monsters', 'Actor', [
        { _id: 'firegiant0000001', name: 'Fire Giant', type: 'npc', img: 'giant.webp', system: {} }
      ])
    ],
    [
      'world.secret',
      pack(
        'world.secret',
        'Item',
        [{ _id: 'firesecret000001', name: 'Fire Secret', type: 'loot', system: {} }],
        { visible: false }
      )
    ],
    [
      'dnd5e.rules',
      pack('dnd5e.rules', 'JournalEntry', [{ _id: 'firerules0000001', name: 'Fire Rules' }])
    ]
  ]);
}

async function search(api, query) {
  let body;
  let status = 200;
  const res = {
    json: (data) => {
      body = data;
      return res;
    },
    status: (code) => {
      status = code;
      return res;
    }
  };
  await api.searchCompendium({ query }, res);
  return { body, status };
}

describe('CompendiumAPI.searchCompendium', () => {
  let api;

  beforeEach(() => {
    global.game = { packs: packsFixture(), user: { id: 'gm', isGM: true, role: 4 } };
    api = new CompendiumAPI();
  });

  test('matches entry names case-insensitively across visible packs', async () => {
    const { body } = await search(api, { query: 'FIRE', limit: 50, offset: 0 });

    expect(body.success).toBe(true);
    expect(body.data.map((e) => e.itemId)).toEqual([
      'fireball00000001',
      'firebolt00000001',
      'firesword0000001',
      'firegiant0000001',
      'firerules0000001'
    ]);
    expect(body.total).toBe(5);
  });

  test('returns the entry shape the MCP mapper reads', async () => {
    const { body } = await search(api, { query: 'Fireball', limit: 20, offset: 0 });

    expect(body.data).toEqual([
      {
        compendiumId: 'dnd5e.spells',
        itemId: 'fireball00000001',
        name: 'Fireball',
        type: 'spell',
        img: 'fireball.webp',
        system: { level: 3, school: 'evo', source: { rules: '2014', book: "Player's Handbook" } }
      }
    ]);
    expect(body.query).toEqual({ query: 'Fireball', limit: 20, offset: 0 });
  });

  test('omits img and system when the index has none, and falls back to the document name for type', async () => {
    const { body } = await search(api, { query: 'Fire Rules', limit: 20, offset: 0 });

    expect(body.data).toEqual([
      {
        compendiumId: 'dnd5e.rules',
        itemId: 'firerules0000001',
        name: 'Fire Rules',
        type: 'JournalEntry'
      }
    ]);
  });

  test('requests the system fields it reports from each pack index', async () => {
    await search(api, { query: 'x', limit: 20, offset: 0 });

    const fields = game.packs.get('dnd5e.spells').getIndex.mock.calls[0][0].fields;
    expect(fields).toEqual(
      expect.arrayContaining(['system.level', 'system.school', 'system.source'])
    );
  });

  test('filters by packType, itemType, spellLevel, source and compendiumId', async () => {
    const byPackType = await search(api, {
      query: 'fire',
      packType: 'actor',
      limit: 20,
      offset: 0
    });
    expect(byPackType.body.data.map((e) => e.itemId)).toEqual(['firegiant0000001']);

    const byItemType = await search(api, { itemType: 'weapon', limit: 20, offset: 0 });
    expect(byItemType.body.data.map((e) => e.itemId)).toEqual(['firesword0000001']);

    const bySpellLevel = await search(api, { spellLevel: 0, limit: 20, offset: 0 });
    expect(bySpellLevel.body.data.map((e) => e.itemId)).toEqual(['firebolt00000001']);

    const bySource = await search(api, { source: 'homebrew', limit: 20, offset: 0 });
    expect(bySource.body.data.map((e) => e.itemId)).toEqual(['shield0000000001']);

    const byPack = await search(api, { compendiumId: 'dnd5e.items', limit: 20, offset: 0 });
    expect(byPack.body.data.map((e) => e.itemId)).toEqual(['firesword0000001']);
  });

  test('pages with limit and offset; total counts every match', async () => {
    const { body } = await search(api, { query: 'fire', limit: 2, offset: 2 });

    expect(body.data.map((e) => e.itemId)).toEqual(['firesword0000001', 'firegiant0000001']);
    expect(body.total).toBe(5);
  });

  test('skips packs the user cannot see', async () => {
    const { body } = await search(api, { query: 'secret', limit: 20, offset: 0 });

    expect(body.data).toEqual([]);
    expect(body.total).toBe(0);
  });
});

describe('compendium.search through SocketMessageHandler', () => {
  let handler;

  beforeEach(() => {
    global.game = {
      packs: packsFixture(),
      user: { id: 'gm', name: 'GM', isGM: true, role: 4 },
      actors: new Map(),
      settings: { get: jest.fn().mockReturnValue(false) }
    };
    handler = new SocketMessageHandler();
    handler.setApiKey('k');
  });

  function request(query) {
    return {
      type: 'compendium.search',
      requestId: 'r1',
      auth: { apiKey: 'k' },
      params: { query, params: {} },
      body: null
    };
  }

  test('validates the HTTP query and passes numbers to the route', async () => {
    const response = await handler.handleMessage(
      request({ query: 'fire', spellLevel: '3', limit: '1', offset: '0' })
    );

    expect(response.success).toBe(true);
    expect(response.data.data.map((e) => e.itemId)).toEqual(['fireball00000001']);
    expect(response.data.query).toEqual({ query: 'fire', spellLevel: 3, limit: 1, offset: 0 });
  });

  test('defaults limit to 20 and offset to 0', async () => {
    const response = await handler.handleMessage(request({ query: 'fire' }));

    expect(response.data.query).toEqual({ query: 'fire', limit: 20, offset: 0 });
  });

  test('rejects a limit above 100 and a malformed compendiumId', async () => {
    const tooMany = await handler.handleMessage(request({ limit: '101' }));
    expect(tooMany.error).toBe('Validation Error');

    const badPack = await handler.handleMessage(request({ compendiumId: '../x' }));
    expect(badPack.error).toBe('Validation Error');
  });
});
