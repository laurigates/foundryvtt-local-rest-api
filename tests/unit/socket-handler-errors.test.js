/**
 * Error paths of SocketMessageHandler that route handlers reach through the
 * mock Express response: a route's res.status(...).json(...) must come back
 * as the route's own error, not as a TypeError from the mock.
 */

import { SocketMessageHandler } from '../../scripts/socket-handler.js';

describe('SocketMessageHandler route error paths', () => {
  let socketHandler;

  beforeEach(() => {
    global.game = {
      user: { id: 'gm123', name: 'GM', role: 4, isGM: true },
      items: new Map(),
      actors: new Map(),
      settings: { get: jest.fn().mockReturnValue(false) }
    };
    socketHandler = new SocketMessageHandler();
    socketHandler.setApiKey('test-api-key');
  });

  test('createMockResponse supports chained status().json()', () => {
    const res = socketHandler.createMockResponse();

    expect(res.status(404)).toBe(res);
    expect(res.json({ message: 'gone' })).toBe(res);
    expect(() => res.getData()).toThrow('gone');
  });

  test("a route's 404 reaches the caller with the route's message", async () => {
    const response = await socketHandler.handleMessage({
      type: 'items.get',
      requestId: 'req1',
      auth: { apiKey: 'test-api-key' },
      params: { id: 'missingItem00001' }
    });

    expect(response.success).toBe(false);
    expect(response.message).toBe('Item with ID missingItem00001 does not exist');
  });

  test('a null params field returns an error response instead of throwing', async () => {
    const response = await socketHandler.handleMessage({
      type: 'items.search',
      requestId: 'req2',
      auth: { apiKey: 'test-api-key' },
      params: null
    });

    expect(response.requestId).toBe('req2');
    expect(typeof response.success).toBe('boolean');
  });
});
