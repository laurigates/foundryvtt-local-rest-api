/**
 * Listen on 127.0.0.1 for supertest.
 *
 * `request(app)` makes supertest call `app.listen(0)`, which binds `::`, and
 * then send the request to `127.0.0.1:<port>`. On macOS another process may
 * hold a listener on `127.0.0.1` at that same port number; the more specific
 * IPv4 binding wins, so the request reaches that process instead. Observed: a
 * Claude Code process on 127.0.0.1:52166 answered `404 not found` to this
 * suite's request. Binding 127.0.0.1 explicitly makes the kernel pick a port
 * free on that address, so the request reaches the test's own server.
 *
 * Pass the returned server to `request(server)`; close it with `close(server)`.
 */

export function listenLoopback(app) {
  return new Promise((resolve, reject) => {
    const server = app.listen(0, '127.0.0.1');
    server.once('listening', () => resolve(server));
    server.once('error', reject);
  });
}

export function close(server) {
  return new Promise((resolve) => server.close(() => resolve()));
}
