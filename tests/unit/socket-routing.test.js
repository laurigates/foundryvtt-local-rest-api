/**
 * Module-side socket routing (v14 server relays only `module.<id>`).
 * Doubles follow the public API: Users#getDesignatedUser, User#isSelf.
 */

import {
  SOCKET_NAME,
  isResponseMessage,
  shouldHandleRequest,
  responseEmitArgs
} from '../../scripts/socket-routing.js';

/** A Users double whose getDesignatedUser mirrors the documented contract. */
function usersOf(list) {
  return {
    getDesignatedUser(condition) {
      const qualifying = list.filter(condition);
      if (qualifying.length === 0) return null;
      return qualifying.reduce((best, u) =>
        u.role > best.role || (u.role === best.role && u.id < best.id) ? u : best
      );
    }
  };
}

describe('socket routing', () => {
  test('uses the single event name the Foundry server relays', () => {
    expect(SOCKET_NAME).toBe('module.foundryvtt-local-rest-api');
  });

  test('recognises responses only by the isResponse flag', () => {
    expect(isResponseMessage({ isResponse: true, requestId: 'r1' })).toBe(true);
    expect(isResponseMessage({ type: 'world.info', requestId: 'r1' })).toBe(false);
    expect(isResponseMessage(null)).toBe(false);
    expect(isResponseMessage('isResponse')).toBe(false);
  });

  describe('shouldHandleRequest', () => {
    const bridge = { id: 'aaaaBridgeUser01', role: 4, active: true, isGM: true, isSelf: false };
    const gmSelf = { id: 'zzzzGamemaster01', role: 4, active: true, isGM: true, isSelf: true };
    const gmOther = { id: 'bbbbGamemaster02', role: 4, active: true, isGM: true, isSelf: false };
    const player = { id: 'ccccPlayer000001', role: 1, active: true, isGM: false, isSelf: true };

    test('the only active GM answers, even when the bridge user is also a GM', () => {
      // The bridge sorts first by id; excluding the sender keeps it from being designated.
      expect(shouldHandleRequest(usersOf([bridge, gmSelf]), bridge.id)).toBe(true);
    });

    test('a second GM client stays silent when it is not designated', () => {
      const other = { ...gmOther };
      const self = { ...gmSelf, id: 'yyyyGamemaster03' };
      expect(shouldHandleRequest(usersOf([bridge, other, self]), bridge.id)).toBe(false);
    });

    test('a player client never answers', () => {
      expect(shouldHandleRequest(usersOf([bridge, player]), bridge.id)).toBe(false);
    });

    test('a browser logged in as the sending user answers on its own socket', () => {
      const bridgeBrowser = { ...bridge, isSelf: true };
      expect(shouldHandleRequest(usersOf([bridgeBrowser]), bridge.id)).toBe(true);
    });

    test('another GM client does not count the sending user as a candidate', () => {
      // In gmOther's view the bridge user (lower id) is excluded, so gmOther is designated.
      const otherSelf = { ...gmOther, isSelf: true };
      expect(shouldHandleRequest(usersOf([bridge, otherSelf]), bridge.id)).toBe(true);
    });

    test('an inactive GM is not designated', () => {
      const idle = { ...gmSelf, active: false };
      expect(shouldHandleRequest(usersOf([bridge, idle]), bridge.id)).toBe(false);
    });

    test('fails closed without a Users collection', () => {
      expect(shouldHandleRequest(undefined, 'x')).toBe(false);
      expect(shouldHandleRequest({}, 'x')).toBe(false);
    });
  });

  describe('responseEmitArgs', () => {
    test('answers on the request event, flagged, to the sender only', () => {
      const [event, payload, options] = responseEmitArgs(
        { requestId: 'r1', success: true },
        'aaaaBridgeUser01'
      );
      expect(event).toBe(SOCKET_NAME);
      expect(payload).toEqual({ requestId: 'r1', success: true, isResponse: true });
      expect(options).toEqual({ recipients: ['aaaaBridgeUser01'] });
    });

    test('broadcasts when the sender is unknown', () => {
      const [, , options] = responseEmitArgs({ requestId: 'r1' }, undefined);
      expect(options).toEqual({});
    });
  });
});
