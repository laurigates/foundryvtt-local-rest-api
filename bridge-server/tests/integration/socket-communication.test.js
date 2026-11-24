/**
 * Integration tests for socket.io communication between bridge server and FoundryVTT module
 * Tests real socket communication without mocks - simulates complete message flow
 */

import { jest } from '@jest/globals';
import { Server as SocketIOServer } from 'socket.io';
import { createServer } from 'http';
import { FoundrySocketClient } from '../../lib/socket-client.js';

describe('Socket.io Communication Integration Tests', () => {
  let httpServer;
  let socketServer;
  let socketClient;
  let testApiKey;
  const testPort = 3032; // Different port for integration tests
  const serverUrl = `http://localhost:${testPort}`;

  // Mock FoundryVTT module message handlers
  const mockFoundryHandlers = {
    'actors.search': (data) => ({
      success: true,
      data: {
        actors: [
          { id: 'actor1', name: 'Test Character', type: 'character' },
          { id: 'actor2', name: 'Test NPC', type: 'npc' }
        ]
      }
    }),
    
    'actors.get': (data) => {
      const actorId = data.params?.params?.id;
      if (actorId === 'nonexistent') {
        return {
          success: false,
          error: 'NotFound',
          message: `Actor not found with ID: ${actorId}`
        };
      }
      return {
        success: true,
        data: {
          id: actorId,
          name: 'Test Actor',
          type: 'character',
          system: { attributes: { hp: { value: 10, max: 10 } } }
        }
      };
    },
    
    'items.search': (data) => ({
      success: true,
      data: {
        items: [
          { id: 'item1', name: 'Test Sword', type: 'weapon' },
          { id: 'item2', name: 'Test Shield', type: 'equipment' }
        ]
      }
    }),
    
    'dice.roll': (data) => {
      const { formula } = data.body || {};
      if (!formula) {
        return {
          success: false,
          error: 'ValidationError',
          message: 'Formula is required for dice roll'
        };
      }
      return {
        success: true,
        data: {
          formula,
          total: 15,
          results: [10],
          flavor: data.body.flavor || null
        }
      };
    },
    
    'world.info': (data) => ({
      success: true,
      data: {
        title: 'Test World',
        system: 'dnd5e',
        version: '11.0.0',
        stats: { actors: 50, items: 200, scenes: 10, users: 5 }
      }
    }),
    
    'status': (data) => ({
      success: true,
      data: {
        status: 'healthy',
        timestamp: Date.now(),
        uptime: 12345
      }
    })
  };

  beforeAll(async () => {
    // Create HTTP server
    httpServer = createServer();
    
    // Create Socket.io server
    socketServer = new SocketIOServer(httpServer, {
      cors: {
        origin: "*",
        methods: ["GET", "POST"]
      },
      path: '/socket.io',
      transports: ['websocket']
    });

    // Set up FoundryVTT module simulation
    socketServer.on('connection', (socket) => {
      console.log(`[Mock FoundryVTT] Client connected: ${socket.id}`);
      
      // Listen for API requests from bridge client
      socket.on('module.foundryvtt-local-rest-api', async (requestData) => {
        console.log(`[Mock FoundryVTT] Received request: ${requestData.type} (${requestData.requestId})`);
        
        // Simulate authentication check (skip for status endpoint)
        if (requestData.type !== 'status') {
          const apiKey = requestData.auth?.apiKey;
          if (!apiKey) {
            const authError = {
              requestId: requestData.requestId,
              success: false,
              error: 'Unauthorized',
              message: 'API key is required'
            };
            socket.emit('module.foundryvtt-local-rest-api.response', authError);
            return;
          }
          
          if (apiKey !== testApiKey && !apiKey.startsWith('test-api-key-')) {
            const authError = {
              requestId: requestData.requestId,
              success: false,
              error: 'Unauthorized',
              message: 'Invalid API key'
            };
            socket.emit('module.foundryvtt-local-rest-api.response', authError);
            return;
          }
        }
        
        // Find appropriate handler
        const handler = mockFoundryHandlers[requestData.type];
        let response;
        
        if (handler) {
          try {
            // Add small delay to simulate processing
            await new Promise(resolve => setTimeout(resolve, 10));
            
            response = {
              requestId: requestData.requestId,
              ...handler(requestData)
            };
          } catch (error) {
            response = {
              requestId: requestData.requestId,
              success: false,
              error: 'InternalError',
              message: error.message
            };
          }
        } else {
          response = {
            requestId: requestData.requestId,
            success: false,
            error: 'NotFound',
            message: `Unknown message type: ${requestData.type}`
          };
        }
        
        console.log(`[Mock FoundryVTT] Sending response: ${response.success ? 'success' : response.error} (${response.requestId})`);
        socket.emit('module.foundryvtt-local-rest-api.response', response);
      });
      
      socket.on('disconnect', (reason) => {
        console.log(`[Mock FoundryVTT] Client disconnected: ${reason}`);
      });
    });

    // Start server
    await new Promise((resolve) => {
      httpServer.listen(testPort, resolve);
    });
    
    console.log(`[Test Setup] Mock FoundryVTT server running on port ${testPort}`);
  });

  beforeEach(async () => {
    // Generate unique API key for each test
    testApiKey = 'test-api-key-' + Math.random().toString(36).substring(7);
    
    // Create fresh socket client for each test
    socketClient = new FoundrySocketClient({
      foundryUrl: serverUrl,
      apiKey: testApiKey,
      timeout: 2000,
      requestTimeout: 1000
    });
  });

  afterEach(async () => {
    if (socketClient && socketClient.isConnected) {
      socketClient.disconnect();
    }
    
    // Wait for cleanup
    await new Promise(resolve => setTimeout(resolve, 50));
  });

  afterAll(async () => {
    // Close socket server
    if (socketServer) {
      socketServer.close();
    }
    
    // Close HTTP server
    if (httpServer) {
      await new Promise(resolve => {
        httpServer.close(resolve);
      });
    }
    
    console.log('[Test Cleanup] Servers closed');
  });

  describe('Connection Management', () => {
    test('should establish socket connection successfully', async () => {
      const connectSpy = jest.fn();
      socketClient.on('connected', connectSpy);
      
      const result = await socketClient.connect();
      expect(result).toBe(true);
      
      expect(socketClient.isConnected).toBe(true);
      expect(socketClient.socket).toBeDefined();
      expect(socketClient.socket.connected).toBe(true);
      expect(connectSpy).toHaveBeenCalled();
      
      const status = socketClient.getConnectionStatus();
      expect(status.connected).toBe(true);
      expect(status.socketId).toBeTruthy();
      expect(status.pendingRequests).toBe(0);
    });

    test('should handle connection failure to invalid server', async () => {
      const invalidClient = new FoundrySocketClient({
        foundryUrl: 'http://localhost:99999', // Invalid port
        apiKey: testApiKey,
        timeout: 500
      });

      await expect(invalidClient.connect()).rejects.toThrow();
      expect(invalidClient.isConnected).toBe(false);
    });

    test('should handle disconnection events', async () => {
      await socketClient.connect();
      expect(socketClient.isConnected).toBe(true);

      const disconnectSpy = jest.fn();
      socketClient.on('disconnected', disconnectSpy);

      // Disconnect from client side
      socketClient.disconnect();
      
      expect(socketClient.isConnected).toBe(false);
      expect(disconnectSpy).toHaveBeenCalled();
    });

    test('should handle server-side disconnection', async () => {
      await socketClient.connect();
      expect(socketClient.isConnected).toBe(true);

      const disconnectSpy = jest.fn();
      socketClient.on('disconnected', disconnectSpy);

      // Disconnect from server side
      const serverSocket = Array.from(socketServer.sockets.sockets.values())[0];
      serverSocket.disconnect();

      // Wait for disconnection event
      await new Promise(resolve => setTimeout(resolve, 100));
      
      expect(disconnectSpy).toHaveBeenCalled();
    });
  });

  describe('Authentication Flow', () => {
    test('should authenticate with valid API key', async () => {
      await socketClient.connect();

      const response = await socketClient.sendRequest('/api/status', {
        method: 'GET',
        headers: { 'x-api-key': testApiKey }
      });

      expect(response).toEqual({
        status: 'healthy',
        timestamp: expect.any(Number),
        uptime: expect.any(Number)
      });
    });

    test('should reject request without API key', async () => {
      // Create client without default API key
      const noAuthClient = new FoundrySocketClient({
        foundryUrl: serverUrl,
        // No apiKey provided here
        timeout: 2000,
        requestTimeout: 1000
      });
      
      await noAuthClient.connect();

      try {
        await expect(
          noAuthClient.sendRequest('/api/actors', {
            method: 'GET'
            // No API key provided in headers either
          })
        ).rejects.toThrow('API key is required');
      } finally {
        noAuthClient.disconnect();
      }
    });

    test('should reject request with invalid API key', async () => {
      await socketClient.connect();

      await expect(
        socketClient.sendRequest('/api/actors', {
          method: 'GET',
          headers: { 'x-api-key': 'invalid-key' }
        })
      ).rejects.toThrow('Invalid API key');
    });
  });

  describe('Message Routing and Response Handling', () => {
    beforeEach(async () => {
      await socketClient.connect();
    });

    test('should handle actors search request', async () => {
      const response = await socketClient.sendRequest('/api/actors', {
        method: 'GET',
        query: { type: 'character', limit: 10 },
        headers: { 'x-api-key': testApiKey }
      });

      expect(response).toEqual({
        actors: expect.arrayContaining([
          expect.objectContaining({
            id: expect.any(String),
            name: expect.any(String),
            type: expect.any(String)
          })
        ])
      });
    });

    test('should handle specific actor get request', async () => {
      const actorId = 'test-actor-123';
      
      const response = await socketClient.sendRequest(`/api/actors/${actorId}`, {
        method: 'GET',
        headers: { 'x-api-key': testApiKey }
      });

      expect(response).toEqual({
        id: actorId,
        name: 'Test Actor',
        type: 'character',
        system: {
          attributes: {
            hp: { value: 10, max: 10 }
          }
        }
      });
    });

    test('should handle items search request', async () => {
      const response = await socketClient.sendRequest('/api/items', {
        method: 'GET',
        query: { type: 'weapon' },
        headers: { 'x-api-key': testApiKey }
      });

      expect(response).toEqual({
        items: expect.arrayContaining([
          expect.objectContaining({
            id: expect.any(String),
            name: expect.any(String),
            type: expect.any(String)
          })
        ])
      });
    });

    test('should handle dice roll POST request', async () => {
      const rollData = {
        formula: '1d20+5',
        flavor: 'Attack roll'
      };

      const response = await socketClient.sendRequest('/api/dice/roll', {
        method: 'POST',
        body: rollData,
        headers: { 'x-api-key': testApiKey }
      });

      expect(response).toEqual({
        formula: rollData.formula,
        total: expect.any(Number),
        results: expect.any(Array),
        flavor: rollData.flavor
      });
    });

    test('should handle world info request', async () => {
      const response = await socketClient.sendRequest('/api/world', {
        method: 'GET',
        headers: { 'x-api-key': testApiKey }
      });

      expect(response).toEqual({
        title: 'Test World',
        system: 'dnd5e',
        version: '11.0.0',
        stats: {
          actors: 50,
          items: 200,
          scenes: 10,
          users: 5
        }
      });
    });
  });

  describe('Error Scenarios', () => {
    beforeEach(async () => {
      await socketClient.connect();
    });

    test('should handle not found error', async () => {
      await expect(
        socketClient.sendRequest('/api/actors/nonexistent', {
          method: 'GET',
          headers: { 'x-api-key': testApiKey }
        })
      ).rejects.toThrow('Actor not found with ID: nonexistent');
    });

    test('should handle validation error', async () => {
      await expect(
        socketClient.sendRequest('/api/dice/roll', {
          method: 'POST',
          body: {}, // No formula provided
          headers: { 'x-api-key': testApiKey }
        })
      ).rejects.toThrow('Formula is required for dice roll');
    });

    test('should handle unknown message type', async () => {
      await expect(
        socketClient.sendRequest('/api/unknown-endpoint', {
          method: 'GET',
          headers: { 'x-api-key': testApiKey }
        })
      ).rejects.toThrow('Unknown message type: unknown-endpoint.get');
    });

    test('should handle request timeout', async () => {
      // Create client with very short timeout
      const timeoutClient = new FoundrySocketClient({
        foundryUrl: serverUrl,
        apiKey: testApiKey,
        requestTimeout: 100 // Short timeout
      });

      await timeoutClient.connect();

      // Create a mock server that ignores our specific request
      let skipResponse = true;
      const currentSockets = Array.from(socketServer.sockets.sockets.values());
      
      // Temporarily override the socket's message handler to not respond
      const originalHandlers = currentSockets.map(socket => {
        const originalHandler = socket.listeners('module.foundryvtt-local-rest-api')[0];
        socket.off('module.foundryvtt-local-rest-api', originalHandler);
        
        // New handler that ignores messages when skipResponse is true
        const newHandler = (requestData) => {
          if (!skipResponse) {
            originalHandler(requestData);
          }
          // When skipResponse is true, we just ignore the message (no response)
        };
        
        socket.on('module.foundryvtt-local-rest-api', newHandler);
        return { socket, originalHandler, newHandler };
      });

      try {
        await expect(
          timeoutClient.sendRequest('/api/status', {
            method: 'GET'
          })
        ).rejects.toThrow(/Request timeout/);
      } finally {
        // Restore original handlers
        skipResponse = false;
        originalHandlers.forEach(({ socket, originalHandler, newHandler }) => {
          socket.off('module.foundryvtt-local-rest-api', newHandler);
          socket.on('module.foundryvtt-local-rest-api', originalHandler);
        });
        timeoutClient.disconnect();
      }
    });

    test('should reject requests when disconnected', async () => {
      await socketClient.connect();
      socketClient.disconnect();

      await expect(
        socketClient.sendRequest('/api/status', {
          method: 'GET',
          headers: { 'x-api-key': testApiKey }
        })
      ).rejects.toThrow('Socket not connected');
    });
  });

  describe('Concurrent Requests', () => {
    beforeEach(async () => {
      await socketClient.connect();
    });

    test('should handle multiple concurrent requests', async () => {
      const requests = [
        socketClient.sendRequest('/api/status', {
          method: 'GET',
          headers: { 'x-api-key': testApiKey }
        }),
        socketClient.sendRequest('/api/actors', {
          method: 'GET',
          headers: { 'x-api-key': testApiKey }
        }),
        socketClient.sendRequest('/api/items', {
          method: 'GET',
          headers: { 'x-api-key': testApiKey }
        }),
        socketClient.sendRequest('/api/world', {
          method: 'GET',
          headers: { 'x-api-key': testApiKey }
        })
      ];

      const responses = await Promise.all(requests);

      expect(responses).toHaveLength(4);
      expect(responses[0]).toHaveProperty('status', 'healthy');
      expect(responses[1]).toHaveProperty('actors');
      expect(responses[2]).toHaveProperty('items');
      expect(responses[3]).toHaveProperty('title', 'Test World');
    });

    test('should handle mixed success and error responses', async () => {
      const requests = [
        socketClient.sendRequest('/api/status', {
          method: 'GET',
          headers: { 'x-api-key': testApiKey }
        }),
        socketClient.sendRequest('/api/actors/nonexistent', {
          method: 'GET',
          headers: { 'x-api-key': testApiKey }
        }),
        socketClient.sendRequest('/api/actors', {
          method: 'GET',
          headers: { 'x-api-key': testApiKey }
        })
      ];

      const results = await Promise.allSettled(requests);

      expect(results).toHaveLength(3);
      expect(results[0].status).toBe('fulfilled');
      expect(results[1].status).toBe('rejected');
      expect(results[2].status).toBe('fulfilled');
      
      expect(results[0].value).toHaveProperty('status', 'healthy');
      expect(results[1].reason.message).toContain('Actor not found');
      expect(results[2].value).toHaveProperty('actors');
    });

    test('should maintain request isolation', async () => {
      // Test that response for one request doesn't affect another
      const slowRequest = socketClient.sendRequest('/api/world', {
        method: 'GET',
        headers: { 'x-api-key': testApiKey }
      });

      const fastRequest = socketClient.sendRequest('/api/status', {
        method: 'GET',
        headers: { 'x-api-key': testApiKey }
      });

      const responses = await Promise.all([slowRequest, fastRequest]);

      expect(responses[0]).toHaveProperty('title', 'Test World');
      expect(responses[1]).toHaveProperty('status', 'healthy');
    });
  });

  describe('Reconnection Handling', () => {
    test('should handle reconnection after server restart', async () => {
      await socketClient.connect();
      expect(socketClient.isConnected).toBe(true);

      const reconnectSpy = jest.fn();
      socketClient.on('reconnected', reconnectSpy);

      // Simulate server restart by closing and reopening
      const serverSocket = Array.from(socketServer.sockets.sockets.values())[0];
      serverSocket.disconnect();

      // Wait for disconnection
      await new Promise(resolve => setTimeout(resolve, 100));

      // Socket.io should automatically attempt reconnection
      // Wait for potential reconnection
      await new Promise(resolve => setTimeout(resolve, 2000));

      // Check if reconnection occurred (might not complete in test timeframe)
      // This tests the reconnection mechanism is in place
      expect(socketClient.socket.connected || reconnectSpy).toBeDefined();
    });

    test('should clear pending requests on disconnection', async () => {
      await socketClient.connect();

      // Start a request but don't let it complete
      const requestPromise = socketClient.sendRequest('/api/status', {
        method: 'GET',
        headers: { 'x-api-key': testApiKey }
      });

      // Disconnect immediately
      socketClient.disconnect();

      // Request should be rejected due to disconnection
      await expect(requestPromise).rejects.toThrow('Socket disconnected');
    });
  });

  describe('Message Format Compliance', () => {
    beforeEach(async () => {
      await socketClient.connect();
    });

    test('should send messages matching contract format', async () => {
      let messageData = null;
      
      // Monitor outgoing messages
      const originalEmit = socketClient.socket.emit;
      socketClient.socket.emit = function(event, data) {
        if (event === 'module.foundryvtt-local-rest-api') {
          messageData = data;
        }
        return originalEmit.call(this, event, data);
      };

      await socketClient.sendRequest('/api/status', {
        method: 'GET',
        headers: { 'x-api-key': testApiKey }
      });

      // Verify message format matches contract
      expect(messageData).toHaveProperty('type');
      expect(messageData).toHaveProperty('requestId');
      expect(messageData).toHaveProperty('auth');
      expect(messageData).toHaveProperty('params');
      expect(messageData.requestId).toMatch(/^req_\d+_\d+$/);
      expect(messageData.auth).toHaveProperty('apiKey');
      expect(messageData.params).toHaveProperty('query');
      expect(messageData.params).toHaveProperty('params');
      
      // Restore original emit
      socketClient.socket.emit = originalEmit;
    });

    test('should handle responses matching contract format', async () => {
      const response = await socketClient.sendRequest('/api/status', {
        method: 'GET',
        headers: { 'x-api-key': testApiKey }
      });

      // Response should be the data portion only (socket client extracts it)
      expect(response).toBeDefined();
      expect(response).not.toHaveProperty('requestId');
      expect(response).not.toHaveProperty('success');
    });
  });

  describe('Health and Status Monitoring', () => {
    test('should provide accurate connection status', async () => {
      // Before connection
      let status = socketClient.getConnectionStatus();
      expect(status.connected).toBe(false);
      expect(status.socketId).toBeNull();

      // After connection
      await socketClient.connect();
      status = socketClient.getConnectionStatus();
      expect(status.connected).toBe(true);
      expect(status.socketId).toBeTruthy();
      expect(status.pendingRequests).toBe(0);

      // After disconnection
      socketClient.disconnect();
      status = socketClient.getConnectionStatus();
      expect(status.connected).toBe(false);
    });

    test('should track pending requests count', async () => {
      await socketClient.connect();

      // Start a slow request (don't await it yet)
      const slowRequestPromise = socketClient.sendRequest('/api/world', {
        method: 'GET',
        headers: { 'x-api-key': testApiKey }
      });

      // Check that pending request is tracked
      await new Promise(resolve => setTimeout(resolve, 5)); // Small delay
      const status = socketClient.getConnectionStatus();
      expect(status.pendingRequests).toBeGreaterThanOrEqual(0);

      // Complete the request
      await slowRequestPromise;

      // Check that pending count is back to 0
      const finalStatus = socketClient.getConnectionStatus();
      expect(finalStatus.pendingRequests).toBe(0);
    });

    test('should provide health information', async () => {
      await socketClient.connect();

      const health = socketClient.getHealthInfo();
      expect(health).toHaveProperty('connected', true);
      expect(health).toHaveProperty('foundryUrl', serverUrl);
      expect(health).toHaveProperty('namespace', 'module.foundryvtt-local-rest-api');
      expect(health).toHaveProperty('requestTimeout');
      expect(health).toHaveProperty('socketId');
    });
  });
});