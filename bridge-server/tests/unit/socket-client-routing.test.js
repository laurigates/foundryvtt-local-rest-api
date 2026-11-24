/**
 * Response routing over the single relayed module event.
 *
 * Foundry's server relays only `module.<id>`; the module answers on that event
 * with `isResponse: true`. The socket double is a plain EventEmitter, so an
 * emitted request also reaches the client's own listener, as a broadcast from
 * another client would.
 */

import { jest } from '@jest/globals';
import { EventEmitter } from 'events';
import { FoundrySocketClient } from '../../lib/socket-client.js';

const NAMESPACE = 'module.foundryvtt-local-rest-api';

function connectedClient() {
  const client = new FoundrySocketClient({ foundryUrl: 'http://fvtt:30000', apiKey: 'k', requestTimeout: 500 });
  const socket = new EventEmitter();
  socket.connected = true;
  socket.disconnect = jest.fn();
  client.socket = socket;
  client.isConnected = true;
  client.setupEventHandlers();
  return { client, socket };
}

describe('FoundrySocketClient response routing', () => {
  beforeEach(() => {
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'warn').mockImplementation(() => {});
  });
  afterEach(() => jest.restoreAllMocks());

  test('resolves a request from an isResponse message on the module event', async () => {
    const { client, socket } = connectedClient();
    const sent = [];
    socket.on(NAMESPACE, (data) => { if (!data.isResponse) sent.push(data); });

    const pending = client.sendRequest('/api/world', { method: 'GET' });
    expect(sent).toHaveLength(1);
    socket.emit(NAMESPACE, { requestId: sent[0].requestId, success: true, data: { id: 'world' }, isResponse: true }, 'GmUser');

    await expect(pending).resolves.toEqual({ id: 'world' });
    expect(client.pendingRequests.size).toBe(0);
  });

  test('ignores requests broadcast on the same event', async () => {
    const { client, socket } = connectedClient();
    const pending = client.sendRequest('/api/world', { method: 'GET' });
    const [requestId] = client.pendingRequests.keys();

    // A request (no isResponse) with the same id must not settle the promise.
    socket.emit(NAMESPACE, { type: 'world.info', requestId });
    expect(client.pendingRequests.has(requestId)).toBe(true);

    socket.emit(NAMESPACE, { requestId, success: false, error: 'Unauthorized', message: 'Valid API key required', isResponse: true });
    await expect(pending).rejects.toThrow('Valid API key required');
  });
});
