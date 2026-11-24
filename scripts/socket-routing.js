/**
 * Socket routing helpers for the module side of the bridge protocol.
 *
 * Foundry's server relays exactly one custom event per package,
 * `module.<id>`, and nothing else: an event named `module.<id>.response` is
 * dropped. The server broadcasts each message to every other connected client
 * and passes the sender's user id as the second listener argument; a
 * `{recipients: [userId]}` options argument narrows delivery to those users.
 * Requests and responses therefore share the one event, and responses carry
 * `isResponse: true` so neither side mistakes one for the other.
 */

export const MODULE_ID = 'foundryvtt-local-rest-api';
export const SOCKET_NAME = `module.${MODULE_ID}`;

/**
 * @param {unknown} data  A message received on SOCKET_NAME
 * @returns {boolean} Whether the message is a response rather than a request
 */
export function isResponseMessage(data) {
  return Boolean(data && typeof data === 'object' && data.isResponse === true);
}

/**
 * Decide whether this client answers a request.
 *
 * Every client running the module receives every request, so exactly one of
 * them must answer: the designated active Gamemaster, not counting the sender.
 * The sender is excluded because the bridge server may itself log in as a
 * Gamemaster-role user, and it does not run module code.
 *
 * @param {object} users      The world's Users collection (`game.users`)
 * @param {string} [senderId] The id of the user that sent the request
 * @returns {boolean}
 */
export function shouldHandleRequest(users, senderId) {
  if (!users || typeof users.getDesignatedUser !== 'function') return false;
  const designated = users.getDesignatedUser(
    (user) => user.active && user.isGM && user.id !== senderId
  );
  return designated?.isSelf === true;
}

/**
 * Build the arguments for `game.socket.emit` that answer a request.
 *
 * @param {object} response   The response produced by SocketMessageHandler
 * @param {string} [senderId] The requesting user; when known, only it receives the answer
 * @returns {[string, object, object]}
 */
export function responseEmitArgs(response, senderId) {
  const payload = { ...response, isResponse: true };
  const options = senderId ? { recipients: [senderId] } : {};
  return [SOCKET_NAME, payload, options];
}
