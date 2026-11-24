/**
 * Module entry point on v14: AppV2 settings menu and the module socket
 * listener. ApplicationV2 / HandlebarsApplicationMixin are doubles written
 * from the public API (static DEFAULT_OPTIONS, PARTS, _prepareContext,
 * actions called with `this` bound to the app).
 */

import { createApiConfigApp } from '../../scripts/api-config-app.js';
import { FoundryLocalRestAPI } from '../../scripts/rest-api.js';
import { SOCKET_NAME } from '../../scripts/socket-routing.js';

class FakeApplicationV2 {
  render() {
    return this;
  }
}
const FakeMixin = (Base) => class extends Base {};

describe('createApiConfigApp (AppV2)', () => {
  const App = createApiConfigApp({
    ApplicationV2: FakeApplicationV2,
    HandlebarsApplicationMixin: FakeMixin,
    DialogV2: { confirm: jest.fn(async () => false) }
  });

  test('extends the ApplicationV2 passed in, not AppV1 FormApplication', () => {
    expect(new App()).toBeInstanceOf(FakeApplicationV2);
    expect(Object.getPrototypeOf(App.prototype)).not.toBe(global.FormApplication?.prototype);
  });

  test('declares the template part and the three button actions', () => {
    expect(App.PARTS.form.template).toBe(
      'modules/foundryvtt-local-rest-api/templates/api-config.hbs'
    );
    expect(App.DEFAULT_OPTIONS.window.title).toBe('foundryvtt-local-rest-api.config.title');
    expect(Object.keys(App.DEFAULT_OPTIONS.actions).sort()).toEqual([
      'copyApiKey',
      'regenerateApiKey',
      'testConnection'
    ]);
    for (const handler of Object.values(App.DEFAULT_OPTIONS.actions)) {
      expect(typeof handler).toBe('function');
    }
  });

  test('prepares the template context from settings', async () => {
    game.settings.get.mockImplementation((_mod, key) => (key === 'api-key' ? 'k' : true));
    const context = await new App()._prepareContext({});
    expect(context).toMatchObject({
      apiKey: 'k',
      hasApiKey: true,
      isEnabled: true,
      socketNamespace: SOCKET_NAME
    });
  });
});

describe('FoundryLocalRestAPI socket listener', () => {
  const bridgeId = 'aaaaBridgeUser01';
  let api;
  let savedUsers;

  function usersWhereSelfIsDesignated(isSelf) {
    return {
      getDesignatedUser: jest.fn((condition) => {
        const gm = { id: 'zzzzGamemaster01', role: 4, active: true, isGM: true, isSelf };
        return condition(gm) ? gm : null;
      })
    };
  }

  beforeEach(() => {
    savedUsers = game.users;
    game.socket.emit.mockClear();
    game.socket.on.mockClear();
    api = new FoundryLocalRestAPI();
    api.socketHandler.handleMessage = jest.fn(async (data) => ({
      requestId: data.requestId,
      success: true,
      data: {}
    }));
  });

  afterEach(() => {
    game.users = savedUsers;
  });

  test('registers one listener on the module event', () => {
    api.setupSocketHandlers();
    const events = game.socket.on.mock.calls.map(([event]) => event);
    expect(events).toEqual([SOCKET_NAME]);
  });

  test('the designated GM answers on the same event, flagged, to the sender only', async () => {
    game.users = usersWhereSelfIsDesignated(true);
    await api.onSocketMessage({ type: 'world.info', requestId: 'r1' }, bridgeId);

    expect(api.socketHandler.handleMessage).toHaveBeenCalledTimes(1);
    expect(game.socket.emit).toHaveBeenCalledWith(
      SOCKET_NAME,
      expect.objectContaining({ requestId: 'r1', success: true, isResponse: true }),
      { recipients: [bridgeId] }
    );
    expect(game.socket.emit.mock.calls.some(([event]) => event.endsWith('.response'))).toBe(false);
  });

  test('a non-designated client neither handles nor answers', async () => {
    game.users = usersWhereSelfIsDesignated(false);
    await api.onSocketMessage({ type: 'world.info', requestId: 'r1' }, bridgeId);
    expect(api.socketHandler.handleMessage).not.toHaveBeenCalled();
    expect(game.socket.emit).not.toHaveBeenCalled();
  });

  test('responses from other clients are ignored', async () => {
    game.users = usersWhereSelfIsDesignated(true);
    await api.onSocketMessage({ requestId: 'r1', success: true, isResponse: true }, 'someone');
    expect(api.socketHandler.handleMessage).not.toHaveBeenCalled();
    expect(game.socket.emit).not.toHaveBeenCalled();
  });

  test('a handler exception still produces an error response', async () => {
    game.users = usersWhereSelfIsDesignated(true);
    api.socketHandler.handleMessage = jest.fn(async () => {
      throw new Error('boom');
    });
    await api.onSocketMessage({ type: 'world.info', requestId: 'r2' }, bridgeId);
    expect(game.socket.emit).toHaveBeenCalledWith(
      SOCKET_NAME,
      expect.objectContaining({
        requestId: 'r2',
        success: false,
        message: 'boom',
        isResponse: true
      }),
      { recipients: [bridgeId] }
    );
  });
});
