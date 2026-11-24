/**
 * Diagnostics responses against what foundryvtt-mcp validates (#6).
 *
 * The MCP parses these bodies with Zod (src/diagnostics/types.ts on its
 * feat/dual-transport branch): optional fields such as `stack`, `uptime` and
 * `memory` may be absent but not null, and it unwraps a `{success, data}`
 * envelope when one is present. The module runs in a browser, where `process`
 * does not exist. Query values arrive from HTTP as strings.
 */

import { DiagnosticsAPI } from '../../scripts/routes/diagnostics.js';

function call(api, method, query = {}) {
  let body;
  let status = 200;
  const res = {
    json: (data) => { body = data; return res; },
    status: (code) => { status = code; return res; }
  };
  api[method]({ query }, res);
  return { body, status };
}

function entry(level, message, stack) {
  const e = { timestamp: new Date().toISOString(), level, message, source: 'unknown' };
  if (stack !== undefined) e.stack = stack;
  return e;
}

describe('DiagnosticsAPI response shapes', () => {
  let api;

  beforeEach(() => {
    global.game = {
      version: '14.369',
      system: { version: '6.0.6' },
      world: { id: 'waterdeep' },
      users: Object.assign([{ active: true, isGM: true }], { size: 1 }),
      modules: new Map([['m', { active: true }]])
    };
    api = new DiagnosticsAPI();
    api.logBuffer = [];
  });

  test('captured entries carry no null stack', () => {
    api.captureLogEntry('log', ['plain message']);

    expect(api.logBuffer[0]).not.toHaveProperty('stack');
  });

  test('logs answer in the {success, data} envelope', () => {
    api.logBuffer = [entry('warn', 'w')];
    const { body } = call(api, 'getRecentLogs');

    expect(body.success).toBe(true);
    expect(body.data.logs).toHaveLength(1);
    expect(body.data.total).toBe(1);
  });

  test('includeStack=false given as a string drops stacks', () => {
    api.logBuffer = [entry('error', 'boom', 'Error: boom\n at x')];
    const { body } = call(api, 'getRecentLogs', { includeStack: 'false' });

    expect(body.data.logs[0]).not.toHaveProperty('stack');
  });

  test('includeStack=true keeps stacks without adding null ones', () => {
    api.logBuffer = [entry('error', 'boom', 'Error: boom'), entry('log', 'fine')];
    const { body } = call(api, 'getRecentLogs', { includeStack: 'true' });

    expect(body.data.logs[0].stack).toBe('Error: boom');
    expect(body.data.logs[1]).not.toHaveProperty('stack');
  });

  test('search finds every matching entry, not every other one', () => {
    api.logBuffer = [entry('log', 'match one'), entry('log', 'match two'), entry('log', 'match three')];
    const { body } = call(api, 'searchLogs', { pattern: 'match' });

    expect(body.success).toBe(true);
    expect(body.data.matches).toBe(3);
    expect(body.data.pattern).toBe('match');
    expect(body.data.searchTimeframe).toBe('all');
  });

  test('caseSensitive=false given as a string searches case-insensitively', () => {
    api.logBuffer = [entry('log', 'MATCH')];
    const { body } = call(api, 'searchLogs', { pattern: 'match', caseSensitive: 'false' });

    expect(body.data.matches).toBe(1);
  });

  test('health omits uptime and memory where process is undefined', () => {
    const realProcess = global.process;
    const { body } = (() => {
      // DiagnosticsAPI reads `typeof process`; hide it the way a browser does.
      global.process = undefined;
      try {
        return call(api, 'getSystemHealth');
      } finally {
        global.process = realProcess;
      }
    })();

    expect(body.success).toBe(true);
    expect(body.data.server).toEqual({ foundryVersion: '14.369', systemVersion: '6.0.6', worldId: 'waterdeep' });
    expect(body.data.performance).toEqual({ connectedClients: 0 });
    expect(body.data.status).toBe('healthy');
  });

  test('errors answer in the envelope with a string timeframe', () => {
    api.logBuffer = [entry('error', 'TypeError: x is undefined', 'stack')];
    const { body } = call(api, 'diagnoseErrors', { timeframe: '600' });

    expect(body.success).toBe(true);
    expect(body.data.timeframe).toBe('600 seconds');
    expect(body.data.summary.totalErrors).toBe(1);
  });
});
