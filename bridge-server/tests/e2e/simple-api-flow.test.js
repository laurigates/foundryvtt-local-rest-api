/**
 * Simplified E2E API Flow Tests
 * Tests the complete HTTP → Bridge Server → Mock FoundryVTT flow
 */

import request from 'supertest';
import express from 'express';
import { Server as SocketServer } from 'socket.io';
import { createServer as createHttpServer } from 'http';
import { FoundrySocketClient } from '../../lib/socket-client.js';
import { AuthManager } from '../../lib/auth.js';

const testApiKey = 'test_api_key_12345';
const testPort = 3034;
const mockFoundryPort = 30002;

// Mock FoundryVTT Server
class MockFoundryServer {
  constructor(port) {
    this.port = port;
    this.httpServer = createHttpServer();
    this.io = new SocketServer(this.httpServer, {
      path: '/socket.io',
      cors: { origin: '*', methods: ['GET', 'POST'] },
      transports: ['websocket', 'polling']
    });
  }

  async start() {
    this.io.on('connection', (socket) => {
      console.log(`Mock FoundryVTT: Client connected ${socket.id}`);
      
      socket.on('module.foundryvtt-local-rest-api', (data) => {
        const { type, requestId, auth } = data;
        
        // Simple auth check
        if (auth?.apiKey !== testApiKey) {
          socket.emit('module.foundryvtt-local-rest-api.response', {
            requestId,
            success: false,
            error: 'Unauthorized',
            message: 'Invalid or missing API key'
          });
          return;
        }

        // Mock responses based on type
        let mockData;
        switch (type) {
          case 'actors.search':
            mockData = [{ id: 'actor1', name: 'Test Actor' }];
            break;
          case 'status':
            mockData = { status: 'ok', foundryVTT: { version: '11.315' } };
            break;
          default:
            mockData = { message: 'Mock response' };
        }

        socket.emit('module.foundryvtt-local-rest-api.response', {
          requestId,
          success: true,
          data: mockData
        });
      });
    });

    return new Promise((resolve, reject) => {
      this.httpServer.listen(this.port, (err) => {
        if (err) reject(err);
        else {
          console.log(`Mock FoundryVTT started on port ${this.port}`);
          resolve();
        }
      });
    });
  }

  async stop() {
    this.io.close();
    return new Promise(resolve => {
      this.httpServer.close(resolve);
    });
  }
}

// Simple Bridge Server
class SimpleBridgeServer {
  constructor() {
    this.app = express();
    this.port = testPort;
    this.server = null;
    this.socketClient = null;
    this.authManager = new AuthManager(testApiKey);
  }

  async start() {
    // Setup middleware
    this.app.use(express.json());
    
    // Status endpoint (before auth middleware)
    this.app.get('/api/status', (req, res) => {
      res.json({
        success: true,
        status: 'ok',
        server: 'test-bridge-server'
      });
    });
    
    // Auth middleware for other endpoints
    this.app.use('/api', this.authManager.authenticate);

    // Actors endpoint
    this.app.get('/api/actors', async (req, res) => {
      try {
        const result = await this.socketClient.sendRequest('/api/actors', {
          method: 'GET',
          query: req.query,
          headers: { 'x-api-key': req.apiKey }
        });
        res.json({ success: true, data: result });
      } catch (error) {
        res.status(500).json({
          success: false,
          error: 'Internal Server Error',
          message: error.message
        });
      }
    });

    // Create socket client
    this.socketClient = new FoundrySocketClient({
      foundryUrl: `http://localhost:${mockFoundryPort}`,
      requestTimeout: 3000,
      namespace: 'module.foundryvtt-local-rest-api'
    });

    // Connect to mock FoundryVTT
    await this.socketClient.connect();

    // Start HTTP server
    return new Promise((resolve, reject) => {
      this.server = this.app.listen(this.port, (err) => {
        if (err) reject(err);
        else {
          console.log(`Bridge server started on port ${this.port}`);
          resolve();
        }
      });
    });
  }

  async stop() {
    if (this.socketClient) {
      this.socketClient.disconnect();
    }
    if (this.server) {
      return new Promise(resolve => {
        this.server.close(resolve);
      });
    }
  }
}

describe('Simplified E2E API Flow Tests', () => {
  let mockFoundryServer;
  let bridgeServer;

  beforeAll(async () => {
    console.log('Starting test servers...');
    
    // Start mock FoundryVTT
    mockFoundryServer = new MockFoundryServer(mockFoundryPort);
    await mockFoundryServer.start();

    // Start bridge server
    bridgeServer = new SimpleBridgeServer();
    await bridgeServer.start();
    
    // Wait for connections to stabilize
    await new Promise(resolve => setTimeout(resolve, 1000));
  }, 30000);

  afterAll(async () => {
    console.log('Stopping test servers...');
    if (bridgeServer) await bridgeServer.stop();
    if (mockFoundryServer) await mockFoundryServer.stop();
  }, 10000);

  test('should return status without authentication', async () => {
    const response = await request(`http://localhost:${testPort}`)
      .get('/api/status')
      .expect(200);

    expect(response.body).toMatchObject({
      success: true,
      status: 'ok',
      server: 'test-bridge-server'
    });
  });

  test('should require authentication for actors endpoint', async () => {
    const response = await request(`http://localhost:${testPort}`)
      .get('/api/actors')
      .expect(401);

    expect(response.body).toMatchObject({
      success: false,
      error: 'Unauthorized'
    });
  });

  test('should complete full request flow with authentication', async () => {
    const response = await request(`http://localhost:${testPort}`)
      .get('/api/actors')
      .set('x-api-key', testApiKey)
      .expect(200);

    expect(response.body).toMatchObject({
      success: true,
      data: [{ id: 'actor1', name: 'Test Actor' }]
    });
  });
});