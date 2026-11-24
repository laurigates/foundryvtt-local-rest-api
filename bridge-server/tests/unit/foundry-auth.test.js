/**
 * Bridge login flow against v14's /join contract.
 *
 * The fetch and socket doubles encode what the v14 server checks: a POST
 * without a same-origin Origin header gets HTTP 400, the body must carry
 * `action: "join"` plus the user's document id, and a session cookie is set
 * on GET /join.
 */

import { jest } from '@jest/globals';
import { EventEmitter } from 'events';
import {
  FoundryAuthenticator,
  extractSessionCookie,
  foundryOrigin,
  sessionSocketOptions
} from '../../lib/foundry-auth.js';

const FOUNDRY_URL = 'http://fvtt:30000';
const USER_ID = 'Abcdefghij012345';

function response({ status = 200, body = '', setCookie = null }) {
  const headers = new Map();
  if (setCookie) headers.set('set-cookie', setCookie);
  return {
    status,
    headers: {
      raw: () => ({ 'set-cookie': setCookie ? [setCookie] : undefined }),
      get: (name) => headers.get(name) ?? null
    },
    text: async () => (typeof body === 'string' ? body : JSON.stringify(body))
  };
}

/** A fetch double that behaves like the v14 server's /join view. */
function v14Fetch({ password = 'pw', userId = USER_ID } = {}) {
  return jest.fn(async (url, init = {}) => {
    const method = init.method || 'GET';
    const origin = init.headers?.Origin;
    if (method === 'POST' && origin !== foundryOrigin(FOUNDRY_URL)) {
      return response({ status: 400, body: { error: 'The request could not be processed.' } });
    }
    if (method === 'GET') {
      return response({ status: 200, body: '<html>join</html>', setCookie: 'session=sess123; Path=/; HttpOnly' });
    }
    const body = JSON.parse(init.body);
    if (body.action !== 'join') return response({ status: 200, body: {} });
    if ((body.userId ?? body.userid) !== userId) return response({ status: 401, body: 'JOIN.ErrorUserDoesNotExist' });
    if (body.password !== password) return response({ status: 401, body: 'JOIN.ErrorInvalidPassword' });
    return response({ status: 200, body: { request: 'join', status: 'success', redirect: '/game' } });
  });
}

/** A socket.io `io()` double that answers getJoinData with a user list. */
function joinDataIo(users) {
  const sockets = [];
  const io = jest.fn((url, opts) => {
    const socket = new EventEmitter();
    socket.url = url;
    socket.opts = opts;
    socket.disconnect = jest.fn();
    const emit = socket.emit.bind(socket);
    socket.emit = (event, ...args) => {
      if (event === 'getJoinData') return args[0]({ users });
      return emit(event, ...args);
    };
    sockets.push(socket);
    setImmediate(() => emit('session', { userId: null }));
    return socket;
  });
  io.sockets = sockets;
  return io;
}

describe('helpers', () => {
  test('foundryOrigin drops any route prefix', () => {
    expect(foundryOrigin('https://vtt.example.com/foundry/')).toBe('https://vtt.example.com');
    expect(foundryOrigin('http://fvtt:30000')).toBe('http://fvtt:30000');
  });

  test('extractSessionCookie reads the session value', () => {
    expect(extractSessionCookie(['other=1; Path=/', 'session=abc; HttpOnly'])).toBe('abc');
    expect(extractSessionCookie('session=xyz; Path=/')).toBe('xyz');
    expect(extractSessionCookie(undefined)).toBeNull();
  });

  test('sessionSocketOptions carries the session in query (v13) and Cookie (v14)', () => {
    const opts = sessionSocketOptions('abc');
    expect(opts.query).toEqual({ session: 'abc' });
    expect(opts.extraHeaders.Cookie).toBe('session=abc');
  });
});

describe('FoundryAuthenticator.authenticate', () => {
  beforeEach(() => {
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => jest.restoreAllMocks());

  test('logs in with Origin, action "join" and the resolved user id', async () => {
    const fetch = v14Fetch();
    const io = joinDataIo([{ _id: 'Gm00000000000001', name: 'Gamemaster' }, { _id: USER_ID, name: 'bridge-server' }]);
    const auth = new FoundryAuthenticator({ foundryUrl: FOUNDRY_URL, username: 'bridge-server', password: 'pw', fetch, io });

    const result = await auth.authenticate();

    expect(result).toEqual({ success: true, sessionCookie: 'session=sess123', userId: USER_ID });
    expect(auth.isAuthenticated).toBe(true);
    const [, post] = fetch.mock.calls.find(([, init]) => init.method === 'POST');
    expect(post.headers.Origin).toBe('http://fvtt:30000');
    expect(post.headers.Cookie).toBe('session=sess123');
    expect(JSON.parse(post.body)).toMatchObject({ action: 'join', userId: USER_ID, userid: USER_ID, password: 'pw' });
    // the lookup socket carried the unauthenticated session and was closed
    expect(io.sockets[0].opts.extraHeaders.Cookie).toBe('session=sess123');
    expect(io.sockets[0].disconnect).toHaveBeenCalled();
  });

  test('skips the lookup when FOUNDRY_USER_ID is given', async () => {
    const fetch = v14Fetch();
    const io = jest.fn();
    const auth = new FoundryAuthenticator({ foundryUrl: FOUNDRY_URL, username: 'bridge-server', userId: USER_ID, password: 'pw', fetch, io });
    await auth.authenticate();
    expect(io).not.toHaveBeenCalled();
    expect(auth.userId).toBe(USER_ID);
  });

  test('treats a 16-character username as the document id', async () => {
    const io = jest.fn();
    const auth = new FoundryAuthenticator({ foundryUrl: FOUNDRY_URL, username: USER_ID, password: 'pw', fetch: v14Fetch(), io });
    await auth.authenticate();
    expect(io).not.toHaveBeenCalled();
  });

  test('a wrong password fails with the server reason', async () => {
    const auth = new FoundryAuthenticator({ foundryUrl: FOUNDRY_URL, userId: USER_ID, username: 'x', password: 'nope', fetch: v14Fetch() });
    await expect(auth.authenticate()).rejects.toThrow('Login failed (HTTP 401): JOIN.ErrorInvalidPassword');
    expect(auth.isAuthenticated).toBe(false);
  });

  test('an unknown username fails before any POST', async () => {
    const fetch = v14Fetch();
    const io = joinDataIo([{ _id: 'Gm00000000000001', name: 'Gamemaster' }]);
    const auth = new FoundryAuthenticator({ foundryUrl: FOUNDRY_URL, username: 'bridge-server', password: 'pw', fetch, io });
    await expect(auth.authenticate()).rejects.toThrow('User "bridge-server" not found');
    expect(fetch.mock.calls.some(([, init]) => init.method === 'POST')).toBe(false);
  });

  test('an empty {} reply is not success (POST /join without action answers {})', async () => {
    const fetch = jest.fn(async (url, init = {}) => (init.method === 'POST'
      ? response({ status: 200, body: {} })
      : response({ status: 200, setCookie: 'session=s; Path=/' })));
    const auth = new FoundryAuthenticator({ foundryUrl: FOUNDRY_URL, userId: USER_ID, username: 'x', password: 'pw', fetch });
    await expect(auth.authenticate()).rejects.toThrow('Login failed (HTTP 200)');
  });

  test('getSocketAuthOptions returns the session options after login', async () => {
    const auth = new FoundryAuthenticator({ foundryUrl: FOUNDRY_URL, userId: USER_ID, username: 'x', password: 'pw', fetch: v14Fetch() });
    expect(() => auth.getSocketAuthOptions()).toThrow('Not authenticated');
    await auth.authenticate();
    expect(auth.getSocketAuthOptions()).toEqual(sessionSocketOptions('sess123'));
  });
});
