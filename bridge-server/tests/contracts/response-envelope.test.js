/**
 * Contract test for the HTTP response envelope in docs/adrs/0003-response-contract.md.
 *
 * Every bridge router is mounted with a stub socket client. The stub either
 * answers with a module payload or rejects the way FoundrySocketClient does,
 * and each HTTP body is validated against a JSON Schema for the envelope:
 *   success: { success: true, data: ... } (payload passed through unchanged)
 *   failure: { success: false, error: <string>, message: <string> }
 * Only the envelope is checked here. Field-level shapes (`id`, `hp.current`,
 * ...) come from the module and are covered by the integration suite.
 */

import { jest } from '@jest/globals';
import express from 'express';
import request from 'supertest';
import Ajv from 'ajv';
import { createActorsRouter } from '../../routes/actors.js';
import { createCompendiumRouter } from '../../routes/compendium.js';
import { createDiagnosticsRouter } from '../../routes/diagnostics.js';
import { createDiceRouter } from '../../routes/dice.js';
import { createItemsRouter } from '../../routes/items.js';
import { createScenesRouter } from '../../routes/scenes.js';
import { createWorldRouter } from '../../routes/world.js';

const ajv = new Ajv({ strict: true });

const validateSuccess = ajv.compile({
  type: 'object',
  required: ['success', 'data'],
  properties: {
    success: { const: true },
    data: {}
  }
});

const validateFailure = ajv.compile({
  type: 'object',
  required: ['success', 'error', 'message'],
  additionalProperties: false,
  properties: {
    success: { const: false },
    error: { type: 'string', minLength: 1 },
    message: { type: 'string' }
  }
});

// [mount path, router factory, method, request path under the mount]
const ROUTES = [
  ['/api/actors', createActorsRouter, 'get', '/'],
  ['/api/actors', createActorsRouter, 'get', '/abc123'],
  ['/api/items', createItemsRouter, 'get', '/'],
  ['/api/items', createItemsRouter, 'get', '/abc123'],
  ['/api/scenes', createScenesRouter, 'get', '/'],
  ['/api/scenes', createScenesRouter, 'get', '/current'],
  ['/api/scenes', createScenesRouter, 'get', '/abc123'],
  ['/api/world', createWorldRouter, 'get', '/'],
  ['/api/dice', createDiceRouter, 'post', '/roll'],
  ['/api/compendium', createCompendiumRouter, 'get', '/search'],
  ['/api/diagnostics', createDiagnosticsRouter, 'get', '/logs'],
  ['/api/diagnostics', createDiagnosticsRouter, 'get', '/search'],
  ['/api/diagnostics', createDiagnosticsRouter, 'get', '/health'],
  ['/api/diagnostics', createDiagnosticsRouter, 'get', '/errors']
  // GET /api/diagnostics/connection is not listed: the bridge answers it from
  // its own socket client without a module round trip, with no `data` field
  // and an extra `basicStatus` on failure. It departs from ADR-0003.
];

function rejection(message, code) {
  const error = new Error(message);
  if (code) error.code = code;
  return error;
}

async function call(factory, mount, method, path, sendRequest) {
  const app = express();
  app.use(express.json());
  app.use((req, res, next) => {
    req.apiKey = 'test-key';
    next();
  });
  app.use(mount, factory({ sendRequest, isConnected: () => true, getStatus: () => ({}) }));
  const req = request(app)[method](`${mount}${path}`);
  return method === 'post' ? req.send({ formula: '1d20' }) : req;
}

describe('HTTP response envelope (ADR-0003)', () => {
  let consoleError;
  beforeEach(() => {
    // Routers log every failure; the failures here are the test input.
    consoleError = jest.spyOn(console, 'error').mockImplementation(() => {});
  });
  afterEach(() => consoleError.mockRestore());

  describe.each(ROUTES.map(r => [`${r[2].toUpperCase()} ${r[0]}${r[3]}`, ...r]))('%s', (_name, mount, factory, method, path) => {
    test('passes a module success payload through as {success, data}', async () => {
      const payload = { success: true, data: { marker: 'from-module' }, total: 1 };
      const res = await call(factory, mount, method, path, async () => payload);

      expect(res.status).toBe(200);
      expect(validateSuccess(res.body)).toBe(true);
      expect(res.body).toEqual(payload);
    });

    test.each([
      ['an unreachable module', rejection('socket closed'), 500],
      ['a rejected API key', rejection('bad key', 'Unauthorized'), 401],
      ['a role or permission refusal', rejection('no access', 'Forbidden'), 403]
    ])('answers %s with the failure envelope', async (_label, error, status) => {
      const res = await call(factory, mount, method, path, async () => {
        throw error;
      });

      expect(res.status).toBe(status);
      expect(validateFailure(res.body)).toBe(true);
    });
  });
});
