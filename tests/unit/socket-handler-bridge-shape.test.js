/**
 * SocketMessageHandler with requests in the shape the bridge sends (#8, #6).
 *
 * FoundrySocketClient.sendRequest (bridge-server/lib/socket-client.js) emits
 * `{type, requestId, auth, params: {query: <HTTP query>, params: <route params>}, body}`.
 * The bridge-server integration suite drives the same path over HTTP; these
 * tests pin the module side with that exact shape.
 */

import { SocketMessageHandler } from '../../scripts/socket-handler.js';

const API_KEY = 'test-api-key';

function actor(id, name, type, ownership = {}) {
  return {
    id,
    name,
    type,
    img: `${id}.webp`,
    ownership,
    system: {},
    hasPlayerOwner: false,
    folder: null,
    items: new Map(),
    effects: []
  };
}

function bridgeRequest(type, { query = {}, params = {}, body = null } = {}) {
  return {
    type,
    requestId: `req_${type}`,
    auth: { apiKey: API_KEY },
    params: { query, params },
    body
  };
}

describe('SocketMessageHandler with bridge-shaped requests', () => {
  let handler;
  let actors;

  beforeEach(() => {
    actors = new Map([
      ['goblin0000000001', actor('goblin0000000001', 'Goblin', 'npc')],
      ['goblinboss000001', actor('goblinboss000001', 'Goblin Boss', 'npc')],
      ['orc0000000000001', actor('orc0000000000001', 'Orc', 'npc')],
      ['hero000000000001', actor('hero000000000001', 'Gobbo the Hero', 'character')]
    ]);
    global.game = {
      user: { id: 'gm123', name: 'GM', role: 4, isGM: true },
      actors,
      items: new Map(),
      settings: { get: jest.fn().mockReturnValue(false) }
    };
    handler = new SocketMessageHandler();
    handler.setApiKey(API_KEY);
  });

  describe('GET /api/actors/:id (actors.get)', () => {
    test('reads the id from the route params', async () => {
      const response = await handler.handleMessage(
        bridgeRequest('actors.get', { params: { id: 'orc0000000000001' } })
      );

      expect(response.success).toBe(true);
      expect(response.data.data.id).toBe('orc0000000000001');
      expect(response.data.data.name).toBe('Orc');
    });

    test('answers Not Found for an unknown id rather than a validation error', async () => {
      const response = await handler.handleMessage(
        bridgeRequest('actors.get', { params: { id: 'missing000000001' } })
      );

      expect(response.success).toBe(false);
      expect(response.error).toBe('Not Found');
    });

    test('still rejects an invalid id', async () => {
      const response = await handler.handleMessage(
        bridgeRequest('actors.get', { params: { id: '../etc/passwd' } })
      );

      expect(response.success).toBe(false);
      expect(response.error).toBe('Validation Error');
    });
  });

  describe('GET /api/actors (actors.search)', () => {
    test('filters by query', async () => {
      const response = await handler.handleMessage(
        bridgeRequest('actors.search', { query: { query: 'goblin' } })
      );

      expect(response.success).toBe(true);
      expect(response.data.data.map((a) => a.name)).toEqual(['Goblin', 'Goblin Boss']);
      expect(response.data.total).toBe(2);
    });

    test('filters by type', async () => {
      const response = await handler.handleMessage(
        bridgeRequest('actors.search', { query: { query: 'gob', type: 'character' } })
      );

      expect(response.data.data.map((a) => a.name)).toEqual(['Gobbo the Hero']);
    });

    test('applies limit, given as an HTTP query string', async () => {
      const response = await handler.handleMessage(
        bridgeRequest('actors.search', { query: { limit: '2' } })
      );

      expect(response.data.data).toHaveLength(2);
      expect(response.data.query.limit).toBe(2);
    });

    test('rejects a limit above the maximum', async () => {
      const response = await handler.handleMessage(
        bridgeRequest('actors.search', { query: { limit: '500' } })
      );

      expect(response.success).toBe(false);
      expect(response.error).toBe('Validation Error');
    });
  });

  describe('actor permission filtering', () => {
    beforeEach(() => {
      actors.get('goblin0000000001').ownership = { player1: 2 };
      game.user = { id: 'player1', name: 'Player', role: 1, isGM: false };
    });

    test('search returns only actors the answering user may read', async () => {
      const response = await handler.handleMessage(bridgeRequest('actors.search', { query: {} }));

      expect(response.success).toBe(true);
      expect(response.data.data.map((a) => a.id)).toEqual(['goblin0000000001']);
      expect(response.data.total).toBe(1);
    });

    test('a GM still sees every actor', async () => {
      game.user = { id: 'gm123', name: 'GM', role: 4, isGM: true };
      const response = await handler.handleMessage(bridgeRequest('actors.search', { query: {} }));

      expect(response.data.data).toHaveLength(4);
    });
  });

  describe('POST /api/dice/roll (dice.roll)', () => {
    test('passes the validated body to the route, not the raw one', async () => {
      const rollDice = jest
        .spyOn(handler.handlers.dice, 'rollDice')
        .mockImplementation((req, res) => res.json({ success: true, data: req.body }));

      const response = await handler.handleMessage(
        bridgeRequest('dice.roll', {
          body: { formula: '1d20', reason: 'Tom\'s "attack"', advantage: 'yes', extra: 'dropped' }
        })
      );

      expect(response.success).toBe(true);
      const seen = rollDice.mock.calls[0][0].body;
      expect(seen.reason).toBe('Tom&#x27;s &quot;attack&quot;');
      expect(seen.advantage).toBe(true);
      expect(seen).not.toHaveProperty('extra');
    });
  });

  describe('GET /api/diagnostics/* (diagnostics.*)', () => {
    test.each(['logs', 'health', 'errors'])('diagnostics.%s answers', async (action) => {
      const response = await handler.handleMessage(bridgeRequest(`diagnostics.${action}`));

      expect(response.success).toBe(true);
    });

    test('diagnostics.search reads pattern from the query', async () => {
      console.warn('bridge-shape probe marker');
      const response = await handler.handleMessage(
        bridgeRequest('diagnostics.search', { query: { pattern: 'probe marker' } })
      );

      expect(response.success).toBe(true);
      expect(response.data.data.matches).toBeGreaterThanOrEqual(1);
    });
  });
});
