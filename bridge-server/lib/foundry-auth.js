/**
 * FoundryVTT Authentication Handler
 * Manages login and session management for the bridge server to connect as an authenticated client
 *
 * Login flow (v13 and v14):
 * 1. GET /join to obtain a `session` cookie.
 * 2. Resolve the world user's document id: use FOUNDRY_USER_ID, or a username
 *    that is already a 16-character id, or look the name up with the
 *    `getJoinData` socket event on a socket carrying the session.
 * 3. POST /join with `action: "join"`, the user id and the password.
 *
 * v14 rejects a POST whose `Origin` header does not match the server's own
 * origin (HTTP 400 "The request could not be processed."), so every request
 * here sends `Origin`.
 */

import nodeFetch from 'node-fetch';
import { io as socketIo } from 'socket.io-client';
import { EventEmitter } from 'events';

const FOUNDRY_ID_PATTERN = /^[a-zA-Z0-9]{16}$/;
const USER_AGENT = 'FoundryVTT-Bridge-Server/1.0';

/**
 * The origin (scheme, host, port) of a Foundry base URL. A route prefix in the
 * path is not part of the origin and must not be sent in the Origin header.
 * @param {string} foundryUrl
 * @returns {string}
 */
export function foundryOrigin(foundryUrl) {
  return new URL(foundryUrl).origin;
}

/**
 * Extract the `session` cookie value from Set-Cookie header values.
 * @param {string[]|string|null|undefined} setCookie
 * @returns {string|null}
 */
export function extractSessionCookie(setCookie) {
  const values = Array.isArray(setCookie) ? setCookie : setCookie ? [setCookie] : [];
  for (const value of values) {
    const match = /(?:^|[;,\s])session=([^;]+)/.exec(value);
    if (match) return match[1];
  }
  return null;
}

/**
 * Socket.IO options carrying a Foundry session. v14 reads the session from the
 * handshake cookie; v13 reads `handshake.query.session`. Both are sent.
 * @param {string} session  The session cookie value
 * @returns {object}
 */
export function sessionSocketOptions(session) {
  return {
    query: { session },
    extraHeaders: { Cookie: `session=${session}`, 'User-Agent': USER_AGENT }
  };
}

export class FoundryAuthenticator extends EventEmitter {
  constructor(options = {}) {
    super();

    this.foundryUrl = options.foundryUrl || 'http://localhost:30000';
    this.username = options.username;
    this.password = options.password;
    this.userIdOverride = options.userId || null;
    this.worldId = options.worldId;
    this.fetch = options.fetch || nodeFetch;
    this.io = options.io || socketIo;
    this.resolveTimeout = options.resolveTimeout || 10000;

    this.session = null;
    this.sessionCookie = null;
    this.userId = null;
    this.isAuthenticated = false;
  }

  /**
   * Authenticate with FoundryVTT
   */
  async authenticate() {
    console.log('[FoundryAuth] Authenticating with FoundryVTT...');
    const origin = foundryOrigin(this.foundryUrl);

    try {
      // Step 1: GET /join for a session cookie
      const joinPage = await this.fetch(`${this.foundryUrl}/join`, {
        method: 'GET',
        headers: { 'User-Agent': USER_AGENT, Origin: origin },
        redirect: 'manual'
      });
      const session = extractSessionCookie(
        joinPage.headers.raw?.()['set-cookie'] ?? joinPage.headers.get('set-cookie')
      );
      if (!session) {
        throw new Error(`No session cookie returned from GET /join (HTTP ${joinPage.status})`);
      }

      // Step 2: resolve the user's document id
      const userId = await this.resolveUserId(session);

      // Step 3: POST /join. `userid` and `userId` are both sent: Foundry
      // builds have read either spelling, and the unread one is ignored.
      const loginResponse = await this.fetch(`${this.foundryUrl}/join`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Cookie: `session=${session}`,
          Origin: origin,
          'User-Agent': USER_AGENT
        },
        body: JSON.stringify({ action: 'join', userid: userId, userId, password: this.password }),
        redirect: 'manual'
      });

      const text = await loginResponse.text();
      let body = null;
      try {
        body = JSON.parse(text);
      } catch {
        /* plain-text error key */
      }

      if (loginResponse.status !== 200 || body?.status !== 'success') {
        const reason =
          (body && (body.message || body.error)) || text.trim().slice(0, 100) || 'no response body';
        throw new Error(`Login failed (HTTP ${loginResponse.status}): ${reason}`);
      }

      this.session = session;
      this.sessionCookie = `session=${session}`;
      this.userId = userId;
      this.isAuthenticated = true;
      console.log(`[FoundryAuth] Authentication successful as user ${userId}`);

      return {
        success: true,
        sessionCookie: this.sessionCookie,
        userId: this.userId
      };
    } catch (error) {
      console.error('[FoundryAuth] Authentication error:', error.message);
      this.isAuthenticated = false;
      throw error;
    }
  }

  /**
   * Resolve the configured user to a Foundry document id.
   * @param {string} session  The unauthenticated session cookie value
   * @returns {Promise<string>}
   */
  async resolveUserId(session) {
    if (this.userIdOverride) return this.userIdOverride;
    if (!this.username) throw new Error('FOUNDRY_USERNAME or FOUNDRY_USER_ID is required');
    if (FOUNDRY_ID_PATTERN.test(this.username)) return this.username;

    return new Promise((resolve, reject) => {
      const socket = this.io(foundryOrigin(this.foundryUrl), {
        path: '/socket.io',
        transports: ['websocket'],
        reconnection: false,
        forceNew: true,
        ...sessionSocketOptions(session)
      });

      const finish = (fn, value) => {
        clearTimeout(timer);
        socket.disconnect();
        fn(value);
      };
      const timer = setTimeout(
        () => finish(reject, new Error('Timeout resolving user id via getJoinData')),
        this.resolveTimeout
      );

      socket.once('connect_error', (err) =>
        finish(
          reject,
          new Error(`Socket connection failed while resolving user id: ${err.message}`)
        )
      );

      // The server emits `session` once it has read the handshake session.
      socket.once('session', () => {
        socket.emit('getJoinData', (data) => {
          const users = Array.isArray(data?.users) ? data.users : null;
          if (!users) return finish(reject, new Error('getJoinData returned no users'));
          const wanted = this.username.toLowerCase();
          const found = users.find(
            (u) => typeof u?.name === 'string' && u.name.toLowerCase() === wanted
          );
          if (!found)
            return finish(reject, new Error(`User "${this.username}" not found in this world`));
          finish(resolve, found._id);
        });
      });
    });
  }

  /**
   * Get user information after authentication
   */
  async getUserInfo() {
    if (!this.sessionCookie) {
      throw new Error('Not authenticated');
    }

    try {
      // Try to get user info from the game page
      const response = await this.fetch(`${this.foundryUrl}/game`, {
        headers: {
          Cookie: this.sessionCookie,
          'User-Agent': 'FoundryVTT-Bridge-Server/1.0'
        }
      });

      if (response.ok) {
        const html = await response.text();

        // Extract user ID from the HTML/JavaScript
        const userIdMatch = html.match(/userId['"]\s*[:=]\s*['"]([^'"]+)['"]/);
        if (userIdMatch) {
          this.userId = userIdMatch[1];
          console.log('[FoundryAuth] User ID:', this.userId);
        }

        // Extract world info
        const worldMatch = html.match(/worldId['"]\s*[:=]\s*['"]([^'"]+)['"]/);
        if (worldMatch) {
          this.worldId = worldMatch[1];
          console.log('[FoundryAuth] World ID:', this.worldId);
        }
      }
    } catch (error) {
      console.warn('[FoundryAuth] Could not get user info:', error.message);
    }
  }

  /**
   * Get authentication headers for Socket.io connection
   */
  getSocketAuthOptions() {
    if (!this.isAuthenticated || !this.session) {
      throw new Error('Not authenticated');
    }

    return sessionSocketOptions(this.session);
  }

  /**
   * Check if authentication is still valid
   */
  async validateSession() {
    if (!this.sessionCookie) {
      return false;
    }

    try {
      const response = await this.fetch(`${this.foundryUrl}/api/status`, {
        headers: {
          Cookie: this.sessionCookie
        }
      });

      return response.ok;
    } catch (error) {
      console.error('[FoundryAuth] Session validation error:', error.message);
      return false;
    }
  }

  /**
   * Logout from FoundryVTT
   */
  async logout() {
    if (!this.sessionCookie) {
      return;
    }

    try {
      await this.fetch(`${this.foundryUrl}/logout`, {
        method: 'POST',
        headers: {
          Cookie: this.sessionCookie,
          Origin: foundryOrigin(this.foundryUrl)
        }
      });

      this.sessionCookie = null;
      this.userId = null;
      this.isAuthenticated = false;

      console.log('[FoundryAuth] Logged out successfully');
    } catch (error) {
      console.error('[FoundryAuth] Logout error:', error.message);
    }
  }
}
