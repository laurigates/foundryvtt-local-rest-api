/**
 * HTTP request → bridge router → FoundrySocketClient → module SocketMessageHandler
 * and back (#8, #6).
 *
 * The other bridge suites answer with hand-written module doubles, which is how
 * #8 and #6 went unnoticed: those doubles read the request shape the bridge
 * sends, and the real module did not. Here the bridge routes and socket client
 * are the real ones, and the module side is the real SocketMessageHandler from
 * ../../../scripts, answering over the relayed `module.<id>` event the way
 * FoundryLocalRestAPI.onSocketMessage does (responseEmitArgs adds
 * `isResponse: true`). Only Foundry itself is doubled: the socket is an
 * EventEmitter, and `game` holds plain actor, pack and user objects.
 */

import { jest } from '@jest/globals';
import { EventEmitter } from 'events';
import express from 'express';
import request from 'supertest';
import { FoundrySocketClient } from '../../lib/socket-client.js';
import { createActorsRouter } from '../../routes/actors.js';
import { createDiagnosticsRouter } from '../../routes/diagnostics.js';
import { createCompendiumRouter } from '../../routes/compendium.js';
import { createDiceRouter } from '../../routes/dice.js';
import { createItemsRouter } from '../../routes/items.js';
import { createScenesRouter } from '../../routes/scenes.js';
import { createWorldRouter } from '../../routes/world.js';
import { SocketMessageHandler } from '../../../scripts/socket-handler.js';
import { SOCKET_NAME, isResponseMessage, responseEmitArgs } from '../../../scripts/socket-routing.js';
import { listenLoopback, close } from '../helpers/loopback.js';

const API_KEY = 'test-api-key-bridge-module';

function actor(id, name, type) {
  return { id, name, type, img: `${id}.webp`, ownership: {}, system: {}, hasPlayerOwner: false, folder: null, items: new Map(), effects: [] };
}

function pack(collection, documentName, entries) {
  return {
    collection,
    documentName,
    visible: true,
    metadata: { id: collection, label: collection, type: documentName },
    getIndex: async () => new Map(entries.map(e => [e._id, e]))
  };
}

function installGame() {
  globalThis.game = {
    version: '14.369',
    system: { version: '6.0.6' },
    world: { id: 'waterdeep' },
    user: { id: 'gm0000000000001', name: 'GM', role: 4, isGM: true },
    users: Object.assign([], { size: 0 }),
    modules: new Map(),
    settings: { get: () => false },
    actors: new Map([
      ['goblin0000000001', actor('goblin0000000001', 'Goblin', 'npc')],
      ['goblinboss000001', actor('goblinboss000001', 'Goblin Boss', 'npc')],
      ['orc0000000000001', actor('orc0000000000001', 'Orc', 'npc')]
    ]),
    items: new Map(),
    packs: new Map([
      ['dnd5e.spells', pack('dnd5e.spells', 'Item', [
        { _id: 'fireball00000001', name: 'Fireball', type: 'spell', img: 'fireball.webp', system: { level: 3, school: 'evo' } },
        { _id: 'shield0000000001', name: 'Shield', type: 'spell', img: 'shield.webp', system: { level: 1, school: 'abj' } }
      ])]
    ])
  };
}

/** A bridge app whose socket is wired straight to a module handler. */
function bridgeWithModule() {
  const moduleHandler = new SocketMessageHandler();
  moduleHandler.setApiKey(API_KEY);

  const socket = new EventEmitter();
  socket.connected = true;
  socket.disconnect = jest.fn();
  // The module's listener: answer requests, ignore responses (including its own).
  socket.on(SOCKET_NAME, async (data) => {
    if (isResponseMessage(data)) return;
    const response = await moduleHandler.handleMessage(data);
    const [event, payload] = responseEmitArgs(response);
    socket.emit(event, payload);
  });

  const client = new FoundrySocketClient({ foundryUrl: 'http://fvtt:30000', apiKey: API_KEY, requestTimeout: 1000 });
  client.socket = socket;
  client.isConnected = true;
  client.setupEventHandlers();

  const app = express();
  app.use(express.json());
  app.use('/api', (req, res, next) => { req.apiKey = API_KEY; next(); });
  app.use('/api/actors', createActorsRouter(client));
  app.use('/api/diagnostics', createDiagnosticsRouter(client));
  app.use('/api/compendium', createCompendiumRouter(client));
  app.use('/api/items', createItemsRouter(client));
  app.use('/api/dice', createDiceRouter(client));
  app.use('/api/scenes', createScenesRouter(client));
  app.use('/api/world', createWorldRouter(client));
  return { app, client, moduleHandler };
}

describe('bridge to module path', () => {
  let server;
  let client;
  let moduleHandler;

  beforeEach(async () => {
    installGame();
    let app;
    ({ app, client, moduleHandler } = bridgeWithModule());
    server = await listenLoopback(app);
  });

  afterEach(async () => {
    client.disconnect();
    delete globalThis.game;
    await close(server);
  });

  describe('actors (#8)', () => {
    test('GET /api/actors/:id returns that actor', async () => {
      const res = await request(server).get('/api/actors/orc0000000000001');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toMatchObject({ id: 'orc0000000000001', name: 'Orc', type: 'npc' });
    });

    test('GET /api/actors/:id answers 404 for an unknown actor', async () => {
      const res = await request(server).get('/api/actors/missing000000001');

      expect(res.status).toBe(404);
    });

    test('GET /api/actors applies query and limit', async () => {
      const byName = await request(server).get('/api/actors').query({ query: 'goblin' });
      expect(byName.status).toBe(200);
      expect(byName.body.data.map(a => a.name)).toEqual(['Goblin', 'Goblin Boss']);
      expect(byName.body.total).toBe(2);

      const limited = await request(server).get('/api/actors').query({ limit: 1 });
      expect(limited.body.data).toHaveLength(1);
    });

    test('GET /api/actors answers 400 for a limit the module rejects', async () => {
      const res = await request(server).get('/api/actors').query({ limit: 500 });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });
  });

  describe('diagnostics (#6)', () => {
    test('GET /api/diagnostics/logs returns captured log entries', async () => {
      moduleHandler.handlers.diagnostics.logBuffer = [
        { timestamp: new Date().toISOString(), level: 'warn', message: 'low disk', source: 'unknown' }
      ];

      // The module captures console output, the bridge's own included (one
      // process here), so filter on the level of the seeded entry.
      const res = await request(server).get('/api/diagnostics/logs').query({ lines: 10, level: 'warn' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.logs).toEqual([
        expect.objectContaining({ level: 'warn', message: 'low disk' })
      ]);
    });

    test('GET /api/diagnostics/search forwards the pattern', async () => {
      moduleHandler.handlers.diagnostics.logBuffer = [
        { timestamp: new Date().toISOString(), level: 'error', message: 'TypeError: x', source: 'unknown' },
        { timestamp: new Date().toISOString(), level: 'log', message: 'fine', source: 'unknown' }
      ];

      const res = await request(server).get('/api/diagnostics/search').query({ pattern: 'TypeError' });

      expect(res.status).toBe(200);
      expect(res.body.data).toMatchObject({ matches: 1, pattern: 'TypeError' });
    });

    test('GET /api/diagnostics/health returns the health report', async () => {
      const res = await request(server).get('/api/diagnostics/health');

      expect(res.status).toBe(200);
      expect(res.body.data).toMatchObject({
        server: { foundryVersion: '14.369', worldId: 'waterdeep' },
        status: expect.stringMatching(/healthy|warning|critical/)
      });
    });

    test('GET /api/diagnostics/errors returns the error diagnosis', async () => {
      const res = await request(server).get('/api/diagnostics/errors').query({ timeframe: 600 });

      expect(res.status).toBe(200);
      expect(res.body.data.timeframe).toBe('600 seconds');
    });
  });

  describe('refusals from the module (#16)', () => {
    beforeEach(() => {
      moduleHandler.handlers.diagnostics.logBuffer = [
        { timestamp: new Date().toISOString(), level: 'error', message: 'TypeError: x', source: 'unknown', stack: 'at y' }
      ];
    });

    // A Player answering the request: below Trusted (health) and Assistant
    // (logs, search, errors). The actor's ownership grants that user nothing.
    test.each([
      ['/api/diagnostics/logs', {}],
      ['/api/diagnostics/search', { pattern: '.' }],
      ['/api/diagnostics/errors', { timeframe: 3600 }],
      ['/api/diagnostics/health', {}],
      ['/api/actors/orc0000000000001', {}]
    ])('GET %s answers 403 to a Player', async (path, query) => {
      globalThis.game.user = { id: 'player000000001', name: 'Player', role: 1, isGM: false };

      const res = await request(server).get(path).query(query);

      expect(res.status).toBe(403);
      expect(res.body).toMatchObject({ success: false, error: 'Forbidden' });
      expect(JSON.stringify(res.body)).not.toContain('TypeError');
    });

    // Every forwarding route: the module checks the key before anything else.
    test.each([
      ['get', '/api/actors'],
      ['get', '/api/actors/orc0000000000001'],
      ['get', '/api/items'],
      ['get', '/api/items/item000000000001'],
      ['get', '/api/scenes'],
      ['get', '/api/scenes/current'],
      ['get', '/api/scenes/scene00000000001'],
      ['get', '/api/world'],
      ['post', '/api/dice/roll'],
      ['get', '/api/diagnostics/logs'],
      ['get', '/api/diagnostics/search'],
      ['get', '/api/diagnostics/health'],
      ['get', '/api/diagnostics/errors'],
      ['get', '/api/compendium/search']
    ])('%s %s answers 401 when the module rejects the API key', async (method, path) => {
      moduleHandler.setApiKey('a-different-key');

      const res = method === 'post'
        ? await request(server).post(path).send({ formula: '1d20' })
        : await request(server).get(path);

      expect(res.status).toBe(401);
      expect(res.body).toMatchObject({ success: false, error: 'Unauthorized' });
    });
  });

  describe('compendium (#6)', () => {
    test('GET /api/compendium/search returns matching index entries', async () => {
      const res = await request(server).get('/api/compendium/search')
        .query({ query: 'fire', limit: 20, offset: 0 });

      expect(res.status).toBe(200);
      expect(res.body).toEqual({
        success: true,
        data: [{
          compendiumId: 'dnd5e.spells', itemId: 'fireball00000001', name: 'Fireball',
          type: 'spell', img: 'fireball.webp', system: { level: 3, school: 'evo' }
        }],
        total: 1,
        query: { query: 'fire', limit: 20, offset: 0 }
      });
    });

    test('GET /api/compendium/search answers 400 for a limit the module rejects', async () => {
      const res = await request(server).get('/api/compendium/search').query({ limit: 1000 });

      expect(res.status).toBe(400);
    });
  });
});
