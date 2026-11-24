#!/usr/bin/env node

/**
 * Simple E2E test runner for debugging
 * Run a minimal version of the E2E test to check components work
 */

import { FoundrySocketClient } from './lib/socket-client.js';
import { AuthManager } from './lib/auth.js';
import express from 'express';
import { Server as SocketServer } from 'socket.io';
import { createServer as createHttpServer } from 'http';

console.log('Starting E2E Test Components Check...');

async function testComponents() {
  console.log('1. Testing AuthManager...');
  new AuthManager('test_key_123');
  console.log('AuthManager created successfully');

  console.log('2. Testing Express server...');
  const app = express();
  const server = app.listen(3032, () => {
    console.log('Express server started on port 3032');
  });

  console.log('3. Testing Socket.io server...');
  const httpServer = createHttpServer();
  const io = new SocketServer(httpServer, {
    cors: { origin: '*' }
  });

  httpServer.listen(3033, () => {
    console.log('Socket.io server started on port 3033');
  });

  console.log('4. Testing FoundrySocketClient...');
  new FoundrySocketClient({
    foundryUrl: 'http://localhost:3033',
    requestTimeout: 2000
  });

  console.log('All components created successfully!');

  // Cleanup
  server.close();
  httpServer.close();
  io.close();

  console.log('E2E Components Check PASSED!');
}

testComponents().catch((err) => {
  console.error('E2E Components Check FAILED:', err);
  process.exit(1);
});
