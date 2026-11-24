/**
 * End-to-End API Flow Tests
 * 
 * This test suite validates the complete REST API request flow:
 * HTTP Request → Bridge Server → Socket.io → Mock FoundryVTT Module → Response
 * 
 * Tests cover:
 * - All REST API endpoints
 * - Authentication scenarios
 * - Query parameters and request bodies
 * - Error scenarios (404, 401, 500)
 * - Concurrent request handling
 * - Server lifecycle management
 */

// Jest globals are automatically available in test environment
// import { jest, describe, beforeAll, afterAll, beforeEach, afterEach, it, expect } from '@jest/globals';
import request from 'supertest';
import express from 'express';
import { Server as SocketServer } from 'socket.io';
import { createServer as createHttpServer } from 'http';
import cors from 'cors';
import helmet from 'helmet';
import { FoundrySocketClient } from '../../lib/socket-client.js';
import { AuthManager } from '../../lib/auth.js';

// Mock dependencies - We'll use real implementations for E2E testing
// jest.mock('../../lib/socket-client.js');

describe('E2E API Flow Tests', () => {
  let bridgeServer;
  let mockFoundryServer;
  let testApiKey = 'test_api_key_12345';
  let testPort = 3035; // Different from default to avoid conflicts
  let mockFoundryPort = 30003;
  
  // Mock FoundryVTT responses for different endpoints
  const mockResponses = {
    'actors.search': {
      success: true,
      data: [
        {
          id: 'actor_123',
          name: 'Test Character',
          type: 'character',
          level: 5,
          hp: { value: 45, max: 45 },
          attributes: { str: 16, dex: 14, con: 15, int: 12, wis: 13, cha: 8 }
        },
        {
          id: 'actor_456',
          name: 'Test NPC',
          type: 'npc',
          level: 3,
          hp: { value: 22, max: 22 },
          attributes: { str: 14, dex: 12, con: 13, int: 10, wis: 11, cha: 16 }
        }
      ]
    },
    'actors.get': {
      success: true,
      data: {
        id: 'actor_123',
        name: 'Specific Character',
        type: 'character',
        level: 8,
        hp: { value: 68, max: 68 },
        attributes: { str: 18, dex: 16, con: 17, int: 14, wis: 15, cha: 12 },
        skills: {
          athletics: { value: 7, proficient: true },
          stealth: { value: 5, proficient: false }
        },
        inventory: [
          { id: 'item_1', name: 'Longsword', quantity: 1 },
          { id: 'item_2', name: 'Shield', quantity: 1 }
        ]
      }
    },
    'items.search': {
      success: true,
      data: [
        {
          id: 'item_789',
          name: 'Healing Potion',
          type: 'consumable',
          rarity: 'common',
          description: 'Restores 2d4+2 hit points',
          properties: { healing: '2d4+2' }
        },
        {
          id: 'item_101',
          name: 'Magic Sword',
          type: 'weapon',
          rarity: 'rare',
          description: '+1 magical longsword',
          properties: { damage: '1d8+1', attackBonus: 1 }
        }
      ]
    },
    'items.get': {
      success: true,
      data: {
        id: 'item_789',
        name: 'Specific Item',
        type: 'weapon',
        rarity: 'legendary',
        description: 'A very powerful weapon',
        properties: { damage: '2d6+3', attackBonus: 3, special: 'fire damage' }
      }
    },
    'dice.roll': {
      success: true,
      data: {
        formula: '1d20+5',
        results: [
          { die: 20, roll: 15 }
        ],
        total: 20,
        breakdown: '15 + 5',
        reason: 'Attack roll',
        timestamp: new Date().toISOString(),
        advantage: false,
        disadvantage: false,
        sentToChat: false
      }
    },
    'scenes.search': {
      success: true,
      data: [
        {
          id: 'scene_001',
          name: 'Test Dungeon',
          active: false,
          width: 2048,
          height: 1536,
          gridSize: 50,
          tokens: 3,
          lights: 2
        },
        {
          id: 'scene_002',
          name: 'Town Square',
          active: true,
          width: 1024,
          height: 768,
          gridSize: 25,
          tokens: 8,
          lights: 5
        }
      ]
    },
    'scenes.get': {
      success: true,
      data: {
        id: 'scene_001',
        name: 'Detailed Scene',
        active: false,
        width: 2048,
        height: 1536,
        gridSize: 50,
        background: '/assets/maps/dungeon.webp',
        tokens: [
          { id: 'token_1', name: 'Hero', x: 100, y: 150 },
          { id: 'token_2', name: 'Monster', x: 200, y: 250 }
        ],
        walls: [
          { x1: 0, y1: 0, x2: 100, y2: 0 },
          { x1: 100, y1: 0, x2: 100, y2: 100 }
        ],
        lights: [
          { x: 50, y: 75, radius: 30, bright: 20, dim: 30 }
        ]
      }
    },
    'scenes.current': {
      success: true,
      data: {
        id: 'scene_002',
        name: 'Current Active Scene',
        active: true,
        width: 1024,
        height: 768,
        gridSize: 25,
        tokens: 5,
        weather: 'clear',
        timeOfDay: 'afternoon'
      }
    },
    'world.info': {
      success: true,
      data: {
        id: 'test_world',
        title: 'Test Adventure World',
        system: 'dnd5e',
        version: '11.315',
        players: {
          total: 4,
          active: 2,
          gm: 1
        },
        actors: {
          total: 25,
          characters: 4,
          npcs: 21
        },
        scenes: {
          total: 8,
          active: 'scene_002'
        },
        items: {
          total: 156,
          weapons: 23,
          armor: 12,
          consumables: 45,
          other: 76
        },
        combat: {
          active: false,
          round: 0,
          turn: 0,
          combatants: []
        }
      }
    },
    'status': {
      success: true,
      status: 'ok',
      foundryVTT: {
        version: '11.315',
        system: 'dnd5e',
        systemVersion: '2.4.1',
        world: 'test_world',
        uptime: 3600000
      }
    }
  };

  /**
   * Mock FoundryVTT Socket.io Server
   * Simulates the FoundryVTT module's socket.io server
   */
  class MockFoundryServer {
    constructor(port = 30001) {
      this.port = port;
      this.httpServer = null;
      this.io = null;
      this.connectedSockets = new Map();
    }

    async start() {
      this.httpServer = createHttpServer();
      this.io = new SocketServer(this.httpServer, {
        path: '/socket.io',
        cors: {
          origin: '*',
          methods: ['GET', 'POST']
        },
        transports: ['websocket', 'polling']
      });

      this.setupEventHandlers();
      
      return new Promise((resolve, reject) => {
        this.httpServer.listen(this.port, (error) => {
          if (error) {
            reject(error);
          } else {
            console.log(`[MockFoundryServer] Started on port ${this.port}`);
            resolve();
          }
        });
      });
    }

    setupEventHandlers() {
      this.io.on('connection', (socket) => {
        console.log(`[MockFoundryServer] Client connected: ${socket.id}`);
        this.connectedSockets.set(socket.id, socket);

        // Listen for API requests from bridge server
        socket.on('module.foundryvtt-local-rest-api', (requestData) => {
          this.handleApiRequest(socket, requestData);
        });

        socket.on('disconnect', (reason) => {
          console.log(`[MockFoundryServer] Client disconnected: ${socket.id}, reason: ${reason}`);
          this.connectedSockets.delete(socket.id);
        });

        socket.on('error', (error) => {
          console.error(`[MockFoundryServer] Socket error: ${socket.id}`, error);
        });
      });
    }

    handleApiRequest(socket, requestData) {
      const { type, requestId, auth, params, body } = requestData;
      
      console.log(`[MockFoundryServer] Received request: ${type} (${requestId})`);
      
      // Simulate authentication check
      const expectedApiKey = testApiKey;
      if (!auth?.apiKey || auth.apiKey !== expectedApiKey) {
        socket.emit('module.foundryvtt-local-rest-api.response', {
          requestId,
          success: false,
          error: 'Unauthorized',
          message: 'Invalid or missing API key'
        });
        return;
      }

      // Simulate processing delay (more realistic)
      setTimeout(() => {
        this.sendMockResponse(socket, type, requestId, params, body);
      }, 50); // 50ms delay
    }

    sendMockResponse(socket, type, requestId, params, body) {
      let response;

      // Handle specific error scenarios for testing
      if (params?.params?.id === 'nonexistent') {
        response = {
          requestId,
          success: false,
          error: 'Not Found',
          message: 'Resource not found'
        };
      } else if (params?.params?.id === 'server_error') {
        response = {
          requestId,
          success: false,
          error: 'Internal Server Error',
          message: 'Mock server error for testing'
        };
      } else if (body?.formula === 'invalid_formula') {
        response = {
          requestId,
          success: false,
          error: 'Invalid Formula',
          message: 'Invalid dice formula syntax'
        };
      } else {
        // Return mock response based on message type
        const mockData = mockResponses[type];
        if (mockData) {
          // If mockData already has success/data structure, extract just the data
          const responseData = mockData.data !== undefined ? mockData.data : mockData;
          response = {
            requestId,
            success: true,
            data: responseData
          };
        } else {
          response = {
            requestId,
            success: false,
            error: 'Not Implemented',
            message: `Mock response not implemented for type: ${type}`
          };
        }
      }

      socket.emit('module.foundryvtt-local-rest-api.response', response);
    }

    async stop() {
      if (this.io) {
        this.io.close();
      }
      if (this.httpServer) {
        return new Promise((resolve) => {
          this.httpServer.close(resolve);
        });
      }
    }
  }

  beforeAll(async () => {
    // Start mock FoundryVTT server
    mockFoundryServer = new MockFoundryServer(mockFoundryPort);
    await mockFoundryServer.start();

    // Create bridge server instance with test configuration
    process.env.API_KEY = testApiKey;
    process.env.API_PORT = testPort.toString();
    process.env.FOUNDRY_URL = `http://localhost:${mockFoundryPort}`;
    process.env.REQUEST_TIMEOUT = '2000';
    process.env.LOG_LEVEL = 'error'; // Suppress logs during testing

    // Start bridge server
    bridgeServer = new BridgeServer();
    await bridgeServer.start();
    
    // Wait for connections to stabilize
    await new Promise(resolve => setTimeout(resolve, 500));
  }, 30000);

  afterAll(async () => {
    // Cleanup
    if (bridgeServer) {
      await bridgeServer.shutdown(0);
    }
    if (mockFoundryServer) {
      await mockFoundryServer.stop();
    }
    
    // Clear environment variables
    delete process.env.API_KEY;
    delete process.env.API_PORT;
    delete process.env.FOUNDRY_URL;
    delete process.env.REQUEST_TIMEOUT;
    delete process.env.LOG_LEVEL;
  }, 10000);

  beforeEach(() => {
    // Reset any test state if needed
    // For E2E tests, we mostly rely on server state management
  });

  describe('Health Check Endpoint', () => {
    it('should return server status without authentication', async () => {
      const response = await request(`http://localhost:${testPort}`)
        .get('/api/status')
        .expect(200);

      expect(response.body).toMatchObject({
        success: true,
        status: 'ok',
        server: 'foundry-rest-bridge-server',
        version: '1.0.0',
        foundry: {
          url: `http://localhost:${mockFoundryPort}`,
          connected: true
        },
        bridge: {
          port: testPort
        }
      });

      expect(response.body.bridge.uptime).toBeGreaterThan(0);
      expect(response.body.timestamp).toBeDefined();
    });
  });

  describe('Authentication Tests', () => {
    it('should reject requests without API key', async () => {
      const response = await request(`http://localhost:${testPort}`)
        .get('/api/actors')
        .expect(401);

      expect(response.body).toEqual({
        success: false,
        error: 'Unauthorized',
        message: 'Valid API key required'
      });
    });

    it('should reject requests with invalid API key', async () => {
      const response = await request(`http://localhost:${testPort}`)
        .get('/api/actors')
        .set('x-api-key', 'invalid_key')
        .expect(401);

      expect(response.body).toEqual({
        success: false,
        error: 'Unauthorized', 
        message: 'Valid API key required'
      });
    });

    it('should accept requests with valid x-api-key header', async () => {
      const response = await request(`http://localhost:${testPort}`)
        .get('/api/actors')
        .set('x-api-key', testApiKey)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toBeDefined();
    });

    it('should accept requests with Bearer token authorization', async () => {
      const response = await request(`http://localhost:${testPort}`)
        .get('/api/actors')
        .set('Authorization', `Bearer ${testApiKey}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toBeDefined();
    });
  });

  describe('Actors API Endpoints', () => {
    it('should search actors with query parameters', async () => {
      const response = await request(`http://localhost:${testPort}`)
        .get('/api/actors')
        .query({ query: 'test', type: 'character', limit: '10' })
        .set('x-api-key', testApiKey)
        .expect(200);

      expect(response.body).toEqual(mockResponses['actors.search']);
      expect(Array.isArray(response.body.data)).toBe(true);
      expect(response.body.data).toHaveLength(2);
      expect(response.body.data[0]).toMatchObject({
        id: 'actor_123',
        name: 'Test Character',
        type: 'character',
        level: 5
      });
    });

    it('should get specific actor by ID', async () => {
      const response = await request(`http://localhost:${testPort}`)
        .get('/api/actors/actor_123')
        .set('x-api-key', testApiKey)
        .expect(200);

      expect(response.body).toEqual(mockResponses['actors.get']);
      expect(response.body.data.id).toBe('actor_123');
      expect(response.body.data.name).toBe('Specific Character');
      expect(response.body.data.inventory).toBeDefined();
      expect(response.body.data.skills).toBeDefined();
    });

    it('should return 404 for non-existent actor', async () => {
      const response = await request(`http://localhost:${testPort}`)
        .get('/api/actors/nonexistent')
        .set('x-api-key', testApiKey)
        .expect(404);

      expect(response.body).toEqual({
        success: false,
        error: 'Actor Not Found',
        message: 'Actor with ID nonexistent does not exist'
      });
    });
  });

  describe('Items API Endpoints', () => {
    it('should search items with query parameters', async () => {
      const response = await request(`http://localhost:${testPort}`)
        .get('/api/items')
        .query({ query: 'potion', type: 'consumable', rarity: 'common' })
        .set('x-api-key', testApiKey)
        .expect(200);

      expect(response.body).toEqual(mockResponses['items.search']);
      expect(Array.isArray(response.body.data)).toBe(true);
      expect(response.body.data).toHaveLength(2);
      expect(response.body.data[0].name).toBe('Healing Potion');
    });

    it('should get specific item by ID', async () => {
      const response = await request(`http://localhost:${testPort}`)
        .get('/api/items/item_789')
        .set('x-api-key', testApiKey)
        .expect(200);

      expect(response.body).toEqual(mockResponses['items.get']);
      expect(response.body.data.id).toBe('item_789');
      expect(response.body.data.properties).toBeDefined();
    });
  });

  describe('Dice Rolling API Endpoint', () => {
    it('should roll dice with valid formula', async () => {
      const rollData = {
        formula: '1d20+5',
        reason: 'Attack roll',
        advantage: false,
        disadvantage: false,
        sendToChat: false
      };

      const response = await request(`http://localhost:${testPort}`)
        .post('/api/dice/roll')
        .send(rollData)
        .set('x-api-key', testApiKey)
        .set('Content-Type', 'application/json')
        .expect(200);

      expect(response.body).toEqual(mockResponses['dice.roll']);
      expect(response.body.data.formula).toBe('1d20+5');
      expect(response.body.data.total).toBe(20);
      expect(response.body.data.breakdown).toBe('15 + 5');
    });

    it('should validate required formula in request body', async () => {
      const response = await request(`http://localhost:${testPort}`)
        .post('/api/dice/roll')
        .send({})
        .set('x-api-key', testApiKey)
        .set('Content-Type', 'application/json')
        .expect(400);

      expect(response.body).toEqual({
        success: false,
        error: 'Bad Request',
        message: 'Formula is required in request body'
      });
    });

    it('should handle invalid dice formula', async () => {
      const response = await request(`http://localhost:${testPort}`)
        .post('/api/dice/roll')
        .send({ formula: 'invalid_formula' })
        .set('x-api-key', testApiKey)
        .set('Content-Type', 'application/json')
        .expect(400);

      expect(response.body).toEqual({
        success: false,
        error: 'Invalid Dice Formula',
        message: 'Invalid dice formula syntax'
      });
    });

    it('should validate formula is non-empty string', async () => {
      const response = await request(`http://localhost:${testPort}`)
        .post('/api/dice/roll')
        .send({ formula: '   ' })
        .set('x-api-key', testApiKey)
        .set('Content-Type', 'application/json')
        .expect(400);

      expect(response.body).toEqual({
        success: false,
        error: 'Invalid Formula',
        message: 'Formula must be a non-empty string'
      });
    });
  });

  describe('Scenes API Endpoints', () => {
    it('should search scenes', async () => {
      const response = await request(`http://localhost:${testPort}`)
        .get('/api/scenes')
        .query({ query: 'dungeon' })
        .set('x-api-key', testApiKey)
        .expect(200);

      expect(response.body).toEqual(mockResponses['scenes.search']);
      expect(Array.isArray(response.body.data)).toBe(true);
      expect(response.body.data).toHaveLength(2);
      expect(response.body.data[0].name).toBe('Test Dungeon');
    });

    it('should get specific scene by ID', async () => {
      const response = await request(`http://localhost:${testPort}`)
        .get('/api/scenes/scene_001')
        .set('x-api-key', testApiKey)
        .expect(200);

      expect(response.body).toEqual(mockResponses['scenes.get']);
      expect(response.body.data.tokens).toBeDefined();
      expect(response.body.data.walls).toBeDefined();
      expect(response.body.data.lights).toBeDefined();
    });

    it('should get current active scene', async () => {
      const response = await request(`http://localhost:${testPort}`)
        .get('/api/scenes/current')
        .set('x-api-key', testApiKey)
        .expect(200);

      expect(response.body).toEqual(mockResponses['scenes.current']);
      expect(response.body.data.active).toBe(true);
    });
  });

  describe('World Information API Endpoint', () => {
    it('should get world information', async () => {
      const response = await request(`http://localhost:${testPort}`)
        .get('/api/world')
        .set('x-api-key', testApiKey)
        .expect(200);

      expect(response.body).toEqual(mockResponses['world.info']);
      expect(response.body.data.title).toBe('Test Adventure World');
      expect(response.body.data.players).toBeDefined();
      expect(response.body.data.actors).toBeDefined();
      expect(response.body.data.combat).toBeDefined();
    });
  });

  describe('Error Handling', () => {
    it('should handle 500 errors from FoundryVTT', async () => {
      const response = await request(`http://localhost:${testPort}`)
        .get('/api/actors/server_error')
        .set('x-api-key', testApiKey)
        .expect(500);

      expect(response.body).toEqual({
        success: false,
        error: 'Internal Server Error',
        message: 'Failed to communicate with FoundryVTT server'
      });
    });

    it('should return 404 for non-existent endpoints', async () => {
      const response = await request(`http://localhost:${testPort}`)
        .get('/api/nonexistent')
        .set('x-api-key', testApiKey)
        .expect(404);

      expect(response.body).toMatchObject({
        success: false,
        error: 'Not Found',
        message: 'Endpoint GET /api/nonexistent not found'
      });
      expect(response.body.availableEndpoints).toBeDefined();
      expect(Array.isArray(response.body.availableEndpoints)).toBe(true);
    });

    it('should handle malformed JSON in request body', async () => {
      const response = await request(`http://localhost:${testPort}`)
        .post('/api/dice/roll')
        .send('{ invalid json }')
        .set('x-api-key', testApiKey)
        .set('Content-Type', 'application/json')
        .expect(400);

      // Express will handle this as a bad request
      expect(response.status).toBe(400);
    });
  });

  describe('Concurrent Request Handling', () => {
    it('should handle multiple concurrent requests', async () => {
      const requests = [
        request(`http://localhost:${testPort}`)
          .get('/api/actors')
          .set('x-api-key', testApiKey),
        request(`http://localhost:${testPort}`)
          .get('/api/items')
          .set('x-api-key', testApiKey),
        request(`http://localhost:${testPort}`)
          .get('/api/scenes')
          .set('x-api-key', testApiKey),
        request(`http://localhost:${testPort}`)
          .get('/api/world')
          .set('x-api-key', testApiKey),
        request(`http://localhost:${testPort}`)
          .post('/api/dice/roll')
          .send({ formula: '1d6' })
          .set('x-api-key', testApiKey)
      ];

      const responses = await Promise.all(requests);

      // All requests should succeed
      responses.forEach((response, index) => {
        expect(response.status).toBe(200);
        expect(response.body.success).toBe(true);
        expect(response.body.data).toBeDefined();
      });

      // Verify response content matches expected mock data
      expect(responses[0].body.data).toEqual(mockResponses['actors.search'].data);
      expect(responses[1].body.data).toEqual(mockResponses['items.search'].data);
      expect(responses[2].body.data).toEqual(mockResponses['scenes.search'].data);
      expect(responses[3].body.data).toEqual(mockResponses['world.info'].data);
      expect(responses[4].body.data.formula).toBe('1d6');
    });

    it('should handle mixed authentication scenarios in concurrent requests', async () => {
      const requests = [
        request(`http://localhost:${testPort}`)
          .get('/api/actors')
          .set('x-api-key', testApiKey), // Valid
        request(`http://localhost:${testPort}`)
          .get('/api/items')
          .set('x-api-key', 'invalid'), // Invalid
        request(`http://localhost:${testPort}`)
          .get('/api/scenes'), // No auth
        request(`http://localhost:${testPort}`)
          .get('/api/world')
          .set('Authorization', `Bearer ${testApiKey}`) // Valid Bearer
      ];

      const responses = await Promise.all(
        requests.map(req => req.catch(res => res))
      );

      expect(responses[0].status).toBe(200); // Valid auth
      expect(responses[1].status).toBe(401); // Invalid auth
      expect(responses[2].status).toBe(401); // No auth
      expect(responses[3].status).toBe(200); // Valid Bearer auth
    });
  });

  describe('Request/Response Format Validation', () => {
    it('should have consistent success response format', async () => {
      const response = await request(`http://localhost:${testPort}`)
        .get('/api/actors')
        .set('x-api-key', testApiKey)
        .expect(200);

      expect(response.body).toHaveProperty('success', true);
      expect(response.body).toHaveProperty('data');
      expect(typeof response.body.success).toBe('boolean');
      expect(response.body.data).toBeDefined();
    });

    it('should have consistent error response format', async () => {
      const response = await request(`http://localhost:${testPort}`)
        .get('/api/actors/nonexistent')
        .set('x-api-key', testApiKey)
        .expect(404);

      expect(response.body).toHaveProperty('success', false);
      expect(response.body).toHaveProperty('error');
      expect(response.body).toHaveProperty('message');
      expect(typeof response.body.success).toBe('boolean');
      expect(typeof response.body.error).toBe('string');
      expect(typeof response.body.message).toBe('string');
      expect(response.body).not.toHaveProperty('data');
    });

    it('should set correct HTTP headers', async () => {
      const response = await request(`http://localhost:${testPort}`)
        .get('/api/status');

      expect(response.headers['content-type']).toMatch(/application\/json/);
      expect(response.headers['x-content-type-options']).toBe('nosniff');
      expect(response.headers['x-frame-options']).toBe('SAMEORIGIN');  // Helmet default
      expect(response.headers['x-xss-protection']).toBe('0');
    });

    it('should handle CORS preflight requests', async () => {
      const response = await request(`http://localhost:${testPort}`)
        .options('/api/actors')
        .set('Origin', 'http://localhost:3000')
        .set('Access-Control-Request-Method', 'GET')
        .set('Access-Control-Request-Headers', 'x-api-key')
        .expect(204);

      expect(response.headers['access-control-allow-origin']).toBe('*');
      expect(response.headers['access-control-allow-methods']).toContain('GET');
      expect(response.headers['access-control-allow-headers']).toContain('x-api-key');
    });
  });

  describe('Root Endpoint Documentation', () => {
    it('should return API documentation at root endpoint', async () => {
      const response = await request(`http://localhost:${testPort}`)
        .get('/')
        .expect(200);

      expect(response.body).toMatchObject({
        name: 'FoundryVTT REST API Bridge Server',
        version: '1.0.0',
        description: 'Node.js bridge server for FoundryVTT Local REST API module',
        endpoints: {
          status: '/api/status',
          actors: '/api/actors',
          items: '/api/items',
          dice: '/api/dice/roll',
          scenes: '/api/scenes',
          world: '/api/world',
          diagnostics: '/api/diagnostics'
        }
      });
      
      expect(response.body.documentation).toBeDefined();
    });
  });
});

/**
 * Create a minimal BridgeServer class for testing
 * This is a simplified version that doesn't require the full server.js complexity
 */
class BridgeServer {
  constructor() {
    this.app = express();
    this.port = parseInt(process.env.API_PORT) || 3031;
    this.foundryUrl = process.env.FOUNDRY_URL || 'http://localhost:30001';
    this.apiKey = process.env.API_KEY;
    this.requestTimeout = parseInt(process.env.REQUEST_TIMEOUT) || 5000;
    this.socketClient = null;
    this.authManager = null;
    this.server = null;
  }

  async start() {
    // Create socket client
    this.socketClient = new FoundrySocketClient({
      foundryUrl: this.foundryUrl,
      requestTimeout: this.requestTimeout,
      namespace: 'module.foundryvtt-local-rest-api'
    });

    // Create auth manager
    this.authManager = new AuthManager(this.apiKey);

    // Setup Express
    this.setupMiddleware();
    await this.setupRoutes();

    // Connect to mock FoundryVTT
    await this.socketClient.connect();

    // Start HTTP server
    return new Promise((resolve, reject) => {
      this.server = this.app.listen(this.port, (error) => {
        if (error) {
          reject(error);
        } else {
          resolve();
        }
      });
    });
  }

  setupMiddleware() {
    this.app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
    this.app.use(cors({
      origin: '*',
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'x-api-key']
    }));
    this.app.use(express.json({ limit: '10mb' }));
    this.app.use(express.urlencoded({ extended: true, limit: '10mb' }));
    this.app.use('/api', this.authManager.authenticate);
  }

  async setupRoutes() {
    // Import route modules dynamically to avoid circular dependencies
    const { createActorsRouter } = await import('../../routes/actors.js');
    const { createItemsRouter } = await import('../../routes/items.js');
    const { createDiceRouter } = await import('../../routes/dice.js');
    const { createScenesRouter } = await import('../../routes/scenes.js');
    const { createWorldRouter } = await import('../../routes/world.js');
    const { createDiagnosticsRouter } = await import('../../routes/diagnostics.js');

    // Status endpoint (no auth)
    this.app.get('/api/status', (req, res) => {
      res.json({
        success: true,
        status: 'ok',
        server: 'foundry-rest-bridge-server',
        version: '1.0.0',
        foundry: {
          url: this.foundryUrl,
          connected: this.socketClient?.getConnectionStatus?.()?.connected || false,
          socketId: this.socketClient?.getConnectionStatus?.()?.socketId
        },
        bridge: {
          port: this.port,
          uptime: process.uptime(),
          pendingRequests: this.socketClient?.getConnectionStatus?.()?.pendingRequests || 0
        },
        timestamp: new Date().toISOString()
      });
    });

    // API routes
    this.app.use('/api/actors', createActorsRouter(this.socketClient));
    this.app.use('/api/items', createItemsRouter(this.socketClient));
    this.app.use('/api/dice', createDiceRouter(this.socketClient));
    this.app.use('/api/scenes', createScenesRouter(this.socketClient));
    this.app.use('/api/world', createWorldRouter(this.socketClient));
    this.app.use('/api/diagnostics', createDiagnosticsRouter(this.socketClient));

    // Root endpoint
    this.app.get('/', (req, res) => {
      res.json({
        name: 'FoundryVTT REST API Bridge Server',
        version: '1.0.0',
        description: 'Node.js bridge server for FoundryVTT Local REST API module',
        endpoints: {
          status: '/api/status',
          actors: '/api/actors',
          items: '/api/items',
          dice: '/api/dice/roll',
          scenes: '/api/scenes',
          world: '/api/world',
          diagnostics: '/api/diagnostics'
        },
        documentation: 'https://github.com/yourusername/foundryvtt-local-rest-api#bridge-server'
      });
    });

    // 404 handler
    this.app.use('*', (req, res) => {
      res.status(404).json({
        success: false,
        error: 'Not Found',
        message: `Endpoint ${req.method} ${req.originalUrl} not found`,
        availableEndpoints: [
          'GET /api/status',
          'GET /api/actors',
          'GET /api/actors/:id',
          'GET /api/items',
          'GET /api/items/:id',
          'POST /api/dice/roll',
          'GET /api/scenes',
          'GET /api/scenes/:id',
          'GET /api/scenes/current',
          'GET /api/world',
          'GET /api/diagnostics/logs',
          'GET /api/diagnostics/search',
          'GET /api/diagnostics/health',
          'GET /api/diagnostics/errors'
        ]
      });
    });
  }

  async shutdown(exitCode = 0) {
    if (this.server) {
      await new Promise(resolve => this.server.close(resolve));
    }
    if (this.socketClient) {
      this.socketClient.disconnect();
    }
  }
}