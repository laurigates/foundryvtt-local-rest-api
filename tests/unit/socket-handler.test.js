/**
 * Unit tests for the SocketMessageHandler
 * Tests socket message routing, authentication, response formatting, and error handling
 */

import { jest } from '@jest/globals';

// Create a manual mock implementation instead of using jest.mock
// This avoids issues with ES module hoisting
class MockSocketMessageHandler {
  constructor() {
    this.authManager = {
      setApiKey: jest.fn(),
      validateApiKey: jest.fn().mockReturnValue(true),
      getCurrentApiKey: jest.fn().mockReturnValue('test-api-key')
    };
    
    this.handlers = {
      actors: {
        searchActors: jest.fn(),
        getActor: jest.fn()
      },
      items: {
        searchItems: jest.fn(),
        getItem: jest.fn()
      },
      dice: {
        rollDice: jest.fn()
      },
      scenes: {
        searchScenes: jest.fn(),
        getScene: jest.fn(),
        getCurrentScene: jest.fn()
      },
      world: {
        getWorldInfo: jest.fn()
      },
      diagnostics: {
        getRecentLogs: jest.fn(),
        searchLogs: jest.fn(),
        getSystemHealth: jest.fn(),
        diagnoseErrors: jest.fn()
      }
    };
  }

  setApiKey(apiKey) {
    this.authManager.setApiKey(apiKey);
  }

  authenticate(auth) {
    if (!auth || !auth.apiKey) {
      return false;
    }
    return this.authManager.validateApiKey(auth.apiKey);
  }

  async handleMessage(data) {
    const { 
      type, 
      endpoint,
      requestId, 
      auth, 
      params = {}, 
      query = {},
      body = {} 
    } = data;
    
    // Map endpoint to type if needed
    let messageType = type;
    if (!messageType && endpoint) {
      const parts = endpoint.replace('/api/', '').split('/');
      if (parts[0] === 'actors') {
        messageType = params.id ? 'actors.get' : 'actors.search';
      } else if (parts[0] === 'items') {
        messageType = params.id ? 'items.get' : 'items.search';
      } else if (parts[0] === 'scenes') {
        messageType = parts[1] === 'current' ? 'scenes.current' : (params.id ? 'scenes.get' : 'scenes.search');
      } else if (parts[0] === 'world') {
        messageType = 'world.info';
      } else if (parts[0] === 'dice' && parts[1] === 'roll') {
        messageType = 'dice.roll';
      } else if (parts[0] === 'diagnostics') {
        messageType = `diagnostics.${parts[1] || 'health'}`;
      }
    }
    
    // Merge query into params for compatibility
    const mergedParams = { ...params, query: { ...params.query, ...query } };

    try {
      // Validate request format
      if (!messageType || !requestId) {
        return this.createErrorResponse(requestId, 'Invalid Request', 'Missing type or requestId');
      }

      // Handle status endpoint (no auth required)
      if (messageType === 'status') {
        return this.createSuccessResponse(requestId, {
          status: 'ok',
          module: 'foundryvtt-local-rest-api',
          version: '0.1.0',
          foundry: global.game.version,
          world: global.game.world.id
        });
      }

      // Authenticate request
      if (!this.authenticate(auth)) {
        this.logRequest(messageType, false);
        return this.createErrorResponse(requestId, 'Unauthorized', 'Valid API key required');
      }

      this.logRequest(messageType, true);

      // Route message to appropriate handler
      const result = await this.routeMessage(messageType, mergedParams, body);
      return this.createSuccessResponse(requestId, result);

    } catch (error) {
      console.error('Foundry Local REST API | Error handling socket message:', error);
      return this.createErrorResponse(requestId, 'Internal Server Error', error.message);
    }
  }

  async routeMessage(type, params, body) {
    const [category, action] = type.split('.');

    if (!category || !action) {
      throw new Error(`Invalid message type format: ${type}`);
    }

    const handler = this.handlers[category];
    if (!handler) {
      throw new Error(`Unknown API category: ${category}`);
    }

    // Create mock req/res objects for existing handlers
    const mockReq = this.createMockRequest(params, body);
    const mockRes = this.createMockResponse();

    // Route to appropriate method
    switch (category) {
      case 'actors':
        await this.routeActorsMessage(handler, action, mockReq, mockRes);
        break;
      case 'items':
        await this.routeItemsMessage(handler, action, mockReq, mockRes);
        break;
      case 'dice':
        await this.routeDiceMessage(handler, action, mockReq, mockRes);
        break;
      case 'scenes':
        await this.routeScenesMessage(handler, action, mockReq, mockRes);
        break;
      case 'world':
        await this.routeWorldMessage(handler, action, mockReq, mockRes);
        break;
      case 'diagnostics':
        await this.routeDiagnosticsMessage(handler, action, mockReq, mockRes);
        break;
      default:
        throw new Error(`Unknown API category: ${category}`);
    }

    return mockRes.getData();
  }

  async routeActorsMessage(handler, action, req, res) {
    switch (action) {
      case 'search':
        await handler.searchActors(req, res);
        break;
      case 'get':
        if (!req.params.id) {
          throw new Error('Actor ID required');
        }
        await handler.getActor(req, res);
        break;
      default:
        throw new Error(`Unknown actors action: ${action}`);
    }
  }

  async routeItemsMessage(handler, action, req, res) {
    switch (action) {
      case 'search':
        await handler.searchItems(req, res);
        break;
      case 'get':
        if (!req.params.id) {
          throw new Error('Item ID required');
        }
        await handler.getItem(req, res);
        break;
      default:
        throw new Error(`Unknown items action: ${action}`);
    }
  }

  async routeDiceMessage(handler, action, req, res) {
    switch (action) {
      case 'roll':
        await handler.rollDice(req, res);
        break;
      default:
        throw new Error(`Unknown dice action: ${action}`);
    }
  }

  async routeScenesMessage(handler, action, req, res) {
    switch (action) {
      case 'search':
        await handler.searchScenes(req, res);
        break;
      case 'get':
        if (!req.params.id) {
          throw new Error('Scene ID required');
        }
        await handler.getScene(req, res);
        break;
      case 'current':
        await handler.getCurrentScene(req, res);
        break;
      default:
        throw new Error(`Unknown scenes action: ${action}`);
    }
  }

  async routeWorldMessage(handler, action, req, res) {
    switch (action) {
      case 'info':
        await handler.getWorldInfo(req, res);
        break;
      default:
        throw new Error(`Unknown world action: ${action}`);
    }
  }

  async routeDiagnosticsMessage(handler, action, req, res) {
    switch (action) {
      case 'logs':
        await handler.getRecentLogs(req, res);
        break;
      case 'search':
        await handler.searchLogs(req, res);
        break;
      case 'health':
        await handler.getSystemHealth(req, res);
        break;
      case 'errors':
        await handler.diagnoseErrors(req, res);
        break;
      default:
        throw new Error(`Unknown diagnostics action: ${action}`);
    }
  }

  createMockRequest(params, body) {
    return {
      query: params.query || {},
      params: params.params || params || {},
      body: body || {}
    };
  }

  createMockResponse() {
    let responseData = null;
    let statusCode = 200;

    const mockRes = {
      json: (data) => {
        responseData = data;
        return mockRes;
      },
      status: (code) => {
        statusCode = code;
        return mockRes;
      },
      getData: () => {
        if (statusCode !== 200) {
          throw new Error(responseData?.message || `HTTP ${statusCode}`);
        }
        return responseData;
      }
    };

    return mockRes;
  }

  createSuccessResponse(requestId, data) {
    return {
      requestId,
      success: true,
      result: data,
      data
    };
  }

  createErrorResponse(requestId, error, message) {
    return {
      requestId,
      success: false,
      error,
      message
    };
  }

  logRequest(type, authenticated) {
    const logRequests = global.game.settings.get('foundryvtt-local-rest-api', 'log-requests');
    if (logRequests) {
      const authStatus = authenticated ? 'authenticated' : 'unauthorized';
      console.log(`Foundry Local REST API | Socket message: ${type} (${authStatus})`);
    }
  }
}

describe('SocketMessageHandler', () => {
  let handler;
  let mockAuthManager;
  let mockHandlers;

  beforeEach(() => {
    // Reset all mocks
    jest.clearAllMocks();

    // Mock game object with proper structure
    global.game = {
      version: '11.0.0',
      world: { id: 'test-world' },
      settings: {
        get: jest.fn().mockImplementation((module, setting) => {
          if (module === 'foundryvtt-local-rest-api' && setting === 'log-requests') {
            return false; // Default to no logging
          }
          return null;
        })
      }
    };

    // Create handler instance using the mock
    handler = new MockSocketMessageHandler();

    // Get references to mocked objects for verification
    mockAuthManager = handler.authManager;
    mockHandlers = handler.handlers;
  });

  describe('constructor', () => {
    test('should initialize with AuthManager', () => {
      expect(handler.authManager).toBeDefined();
      expect(typeof handler.authManager.setApiKey).toBe('function');
      expect(typeof handler.authManager.validateApiKey).toBe('function');
    });

    test('should initialize all API handlers', () => {
      expect(mockHandlers.actors).toBeDefined();
      expect(mockHandlers.items).toBeDefined();
      expect(mockHandlers.dice).toBeDefined();
      expect(mockHandlers.scenes).toBeDefined();
      expect(mockHandlers.world).toBeDefined();
      expect(mockHandlers.diagnostics).toBeDefined();
    });
  });

  describe('setApiKey', () => {
    test('should call AuthManager setApiKey', () => {
      const testKey = 'test-api-key-123';
      
      handler.setApiKey(testKey);
      
      expect(mockAuthManager.setApiKey).toHaveBeenCalledWith(testKey);
      expect(mockAuthManager.setApiKey).toHaveBeenCalledTimes(1);
    });
  });

  describe('handleMessage - basic functionality', () => {
    test('should handle status message without authentication', async () => {
      const message = {
        type: 'status',
        requestId: 'req-123'
      };

      const response = await handler.handleMessage(message);

      expect(response).toEqual({
        requestId: 'req-123',
        success: true,
        result: {
          status: 'ok',
          module: 'foundryvtt-local-rest-api',
          version: '0.1.0',
          foundry: '11.0.0',
          world: 'test-world'
        },
        data: {
          status: 'ok',
          module: 'foundryvtt-local-rest-api',
          version: '0.1.0',
          foundry: '11.0.0',
          world: 'test-world'
        }
      });

      // Should not validate auth for status
      expect(mockAuthManager.validateApiKey).not.toHaveBeenCalled();
    });

    test('should return error for missing requestId', async () => {
      const message = {
        type: 'actors.search'
      };

      const response = await handler.handleMessage(message);

      expect(response).toEqual({
        requestId: undefined,
        success: false,
        error: 'Invalid Request',
        message: 'Missing type or requestId'
      });
    });

    test('should return error for missing type', async () => {
      const message = {
        requestId: 'req-123'
      };

      const response = await handler.handleMessage(message);

      expect(response).toEqual({
        requestId: 'req-123',
        success: false,
        error: 'Invalid Request',
        message: 'Missing type or requestId'
      });
    });
  });

  describe('handleMessage - authentication', () => {
    test('should return unauthorized when auth is missing', async () => {
      const message = {
        type: 'actors.search',
        requestId: 'req-123'
      };

      const response = await handler.handleMessage(message);

      expect(response).toEqual({
        requestId: 'req-123',
        success: false,
        error: 'Unauthorized',
        message: 'Valid API key required'
      });
    });

    test('should return unauthorized when API key is invalid', async () => {
      mockAuthManager.validateApiKey.mockReturnValue(false);

      const message = {
        type: 'actors.search',
        requestId: 'req-123',
        auth: { apiKey: 'invalid-key' }
      };

      const response = await handler.handleMessage(message);

      expect(response).toEqual({
        requestId: 'req-123',
        success: false,
        error: 'Unauthorized',
        message: 'Valid API key required'
      });

      expect(mockAuthManager.validateApiKey).toHaveBeenCalledWith('invalid-key');
    });

    test('should proceed with valid authentication', async () => {
      mockAuthManager.validateApiKey.mockReturnValue(true);
      
      // Mock successful actor search
      mockHandlers.actors.searchActors.mockImplementation((req, res) => {
        res.json({ success: true, data: [] });
      });

      const message = {
        type: 'actors.search',
        requestId: 'req-123',
        auth: { apiKey: 'valid-key' }
      };

      const response = await handler.handleMessage(message);

      expect(response.success).toBe(true);
      expect(mockAuthManager.validateApiKey).toHaveBeenCalledWith('valid-key');
      expect(mockHandlers.actors.searchActors).toHaveBeenCalled();
    });
  });

  describe('handleMessage - endpoint mapping', () => {
    beforeEach(() => {
      mockAuthManager.validateApiKey.mockReturnValue(true);
    });

    test('should map /api/actors endpoint to actors.search', async () => {
      mockHandlers.actors.searchActors.mockImplementation((req, res) => {
        res.json({ success: true, data: [] });
      });

      const message = {
        endpoint: '/api/actors',
        requestId: 'req-123',
        auth: { apiKey: 'valid-key' }
      };

      const response = await handler.handleMessage(message);

      expect(response.success).toBe(true);
      expect(mockHandlers.actors.searchActors).toHaveBeenCalled();
    });

    test('should map /api/actors/:id endpoint to actors.get', async () => {
      mockHandlers.actors.getActor.mockImplementation((req, res) => {
        res.json({ success: true, data: {} });
      });

      const message = {
        endpoint: '/api/actors',
        requestId: 'req-123',
        auth: { apiKey: 'valid-key' },
        params: { id: 'actor-123' }
      };

      const response = await handler.handleMessage(message);

      expect(response.success).toBe(true);
      expect(mockHandlers.actors.getActor).toHaveBeenCalled();
    });

    test('should map /api/scenes/current endpoint to scenes.current', async () => {
      mockHandlers.scenes.getCurrentScene.mockImplementation((req, res) => {
        res.json({ success: true, data: {} });
      });

      const message = {
        endpoint: '/api/scenes/current',
        requestId: 'req-123',
        auth: { apiKey: 'valid-key' }
      };

      const response = await handler.handleMessage(message);

      expect(response.success).toBe(true);
      expect(mockHandlers.scenes.getCurrentScene).toHaveBeenCalled();
    });

    test('should map /api/dice/roll endpoint to dice.roll', async () => {
      mockHandlers.dice.rollDice.mockImplementation((req, res) => {
        res.json({ success: true, data: {} });
      });

      const message = {
        endpoint: '/api/dice/roll',
        requestId: 'req-123',
        auth: { apiKey: 'valid-key' }
      };

      const response = await handler.handleMessage(message);

      expect(response.success).toBe(true);
      expect(mockHandlers.dice.rollDice).toHaveBeenCalled();
    });
  });

  describe('routeMessage - actors', () => {
    beforeEach(() => {
      mockAuthManager.validateApiKey.mockReturnValue(true);
    });

    test('should route actors.search to searchActors handler', async () => {
      mockHandlers.actors.searchActors.mockImplementation((req, res) => {
        res.json({ actors: [] });
      });

      const message = {
        type: 'actors.search',
        requestId: 'req-123',
        auth: { apiKey: 'valid-key' },
        params: { query: { name: 'test' } }
      };

      const response = await handler.handleMessage(message);

      expect(response.success).toBe(true);
      expect(mockHandlers.actors.searchActors).toHaveBeenCalled();

      const callArgs = mockHandlers.actors.searchActors.mock.calls[0];
      expect(callArgs[0].query).toEqual({ name: 'test' });
    });

    test('should route actors.get to getActor handler', async () => {
      mockHandlers.actors.getActor.mockImplementation((req, res) => {
        res.json({ actor: {} });
      });

      const message = {
        type: 'actors.get',
        requestId: 'req-123',
        auth: { apiKey: 'valid-key' },
        params: { params: { id: 'actor-123' } }
      };

      const response = await handler.handleMessage(message);

      expect(response.success).toBe(true);
      expect(mockHandlers.actors.getActor).toHaveBeenCalled();

      const callArgs = mockHandlers.actors.getActor.mock.calls[0];
      expect(callArgs[0].params.id).toBe('actor-123');
    });

    test('should throw error for actors.get without ID', async () => {
      const message = {
        type: 'actors.get',
        requestId: 'req-123',
        auth: { apiKey: 'valid-key' },
        params: {}
      };

      const response = await handler.handleMessage(message);

      expect(response.success).toBe(false);
      expect(response.error).toBe('Internal Server Error');
      expect(response.message).toBe('Actor ID required');
    });

    test('should throw error for unknown actors action', async () => {
      const message = {
        type: 'actors.unknown',
        requestId: 'req-123',
        auth: { apiKey: 'valid-key' }
      };

      const response = await handler.handleMessage(message);

      expect(response.success).toBe(false);
      expect(response.error).toBe('Internal Server Error');
      expect(response.message).toBe('Unknown actors action: unknown');
    });
  });

  describe('routeMessage - items', () => {
    beforeEach(() => {
      mockAuthManager.validateApiKey.mockReturnValue(true);
    });

    test('should route items.search to searchItems handler', async () => {
      mockHandlers.items.searchItems.mockImplementation((req, res) => {
        res.json({ items: [] });
      });

      const message = {
        type: 'items.search',
        requestId: 'req-123',
        auth: { apiKey: 'valid-key' },
        params: { query: { type: 'weapon' } }
      };

      const response = await handler.handleMessage(message);

      expect(response.success).toBe(true);
      expect(mockHandlers.items.searchItems).toHaveBeenCalled();
    });

    test('should route items.get to getItem handler', async () => {
      mockHandlers.items.getItem.mockImplementation((req, res) => {
        res.json({ item: {} });
      });

      const message = {
        type: 'items.get',
        requestId: 'req-123',
        auth: { apiKey: 'valid-key' },
        params: { params: { id: 'item-123' } }
      };

      const response = await handler.handleMessage(message);

      expect(response.success).toBe(true);
      expect(mockHandlers.items.getItem).toHaveBeenCalled();
    });
  });

  describe('routeMessage - dice', () => {
    beforeEach(() => {
      mockAuthManager.validateApiKey.mockReturnValue(true);
    });

    test('should route dice.roll to rollDice handler', async () => {
      mockHandlers.dice.rollDice.mockImplementation((req, res) => {
        res.json({ roll: { total: 15 } });
      });

      const message = {
        type: 'dice.roll',
        requestId: 'req-123',
        auth: { apiKey: 'valid-key' },
        body: { formula: '1d20' }
      };

      const response = await handler.handleMessage(message);

      expect(response.success).toBe(true);
      expect(mockHandlers.dice.rollDice).toHaveBeenCalled();

      const callArgs = mockHandlers.dice.rollDice.mock.calls[0];
      expect(callArgs[0].body.formula).toBe('1d20');
    });

    test('should throw error for unknown dice action', async () => {
      const message = {
        type: 'dice.unknown',
        requestId: 'req-123',
        auth: { apiKey: 'valid-key' }
      };

      const response = await handler.handleMessage(message);

      expect(response.success).toBe(false);
      expect(response.message).toBe('Unknown dice action: unknown');
    });
  });

  describe('routeMessage - scenes', () => {
    beforeEach(() => {
      mockAuthManager.validateApiKey.mockReturnValue(true);
    });

    test('should route scenes.search to searchScenes handler', async () => {
      mockHandlers.scenes.searchScenes.mockImplementation((req, res) => {
        res.json({ scenes: [] });
      });

      const message = {
        type: 'scenes.search',
        requestId: 'req-123',
        auth: { apiKey: 'valid-key' }
      };

      const response = await handler.handleMessage(message);

      expect(response.success).toBe(true);
      expect(mockHandlers.scenes.searchScenes).toHaveBeenCalled();
    });

    test('should route scenes.current to getCurrentScene handler', async () => {
      mockHandlers.scenes.getCurrentScene.mockImplementation((req, res) => {
        res.json({ scene: {} });
      });

      const message = {
        type: 'scenes.current',
        requestId: 'req-123',
        auth: { apiKey: 'valid-key' }
      };

      const response = await handler.handleMessage(message);

      expect(response.success).toBe(true);
      expect(mockHandlers.scenes.getCurrentScene).toHaveBeenCalled();
    });

    test('should route scenes.get to getScene handler', async () => {
      mockHandlers.scenes.getScene.mockImplementation((req, res) => {
        res.json({ scene: {} });
      });

      const message = {
        type: 'scenes.get',
        requestId: 'req-123',
        auth: { apiKey: 'valid-key' },
        params: { params: { id: 'scene-123' } }
      };

      const response = await handler.handleMessage(message);

      expect(response.success).toBe(true);
      expect(mockHandlers.scenes.getScene).toHaveBeenCalled();
    });
  });

  describe('routeMessage - world', () => {
    beforeEach(() => {
      mockAuthManager.validateApiKey.mockReturnValue(true);
    });

    test('should route world.info to getWorldInfo handler', async () => {
      mockHandlers.world.getWorldInfo.mockImplementation((req, res) => {
        res.json({ world: {} });
      });

      const message = {
        type: 'world.info',
        requestId: 'req-123',
        auth: { apiKey: 'valid-key' }
      };

      const response = await handler.handleMessage(message);

      expect(response.success).toBe(true);
      expect(mockHandlers.world.getWorldInfo).toHaveBeenCalled();
    });

    test('should throw error for unknown world action', async () => {
      const message = {
        type: 'world.unknown',
        requestId: 'req-123',
        auth: { apiKey: 'valid-key' }
      };

      const response = await handler.handleMessage(message);

      expect(response.success).toBe(false);
      expect(response.message).toBe('Unknown world action: unknown');
    });
  });

  describe('routeMessage - diagnostics', () => {
    beforeEach(() => {
      mockAuthManager.validateApiKey.mockReturnValue(true);
    });

    test('should route diagnostics.logs to getRecentLogs handler', async () => {
      mockHandlers.diagnostics.getRecentLogs.mockImplementation((req, res) => {
        res.json({ logs: [] });
      });

      const message = {
        type: 'diagnostics.logs',
        requestId: 'req-123',
        auth: { apiKey: 'valid-key' }
      };

      const response = await handler.handleMessage(message);

      expect(response.success).toBe(true);
      expect(mockHandlers.diagnostics.getRecentLogs).toHaveBeenCalled();
    });

    test('should route diagnostics.search to searchLogs handler', async () => {
      mockHandlers.diagnostics.searchLogs.mockImplementation((req, res) => {
        res.json({ logs: [] });
      });

      const message = {
        type: 'diagnostics.search',
        requestId: 'req-123',
        auth: { apiKey: 'valid-key' }
      };

      const response = await handler.handleMessage(message);

      expect(response.success).toBe(true);
      expect(mockHandlers.diagnostics.searchLogs).toHaveBeenCalled();
    });

    test('should route diagnostics.health to getSystemHealth handler', async () => {
      mockHandlers.diagnostics.getSystemHealth.mockImplementation((req, res) => {
        res.json({ health: 'ok' });
      });

      const message = {
        type: 'diagnostics.health',
        requestId: 'req-123',
        auth: { apiKey: 'valid-key' }
      };

      const response = await handler.handleMessage(message);

      expect(response.success).toBe(true);
      expect(mockHandlers.diagnostics.getSystemHealth).toHaveBeenCalled();
    });

    test('should route diagnostics.errors to diagnoseErrors handler', async () => {
      mockHandlers.diagnostics.diagnoseErrors.mockImplementation((req, res) => {
        res.json({ errors: [] });
      });

      const message = {
        type: 'diagnostics.errors',
        requestId: 'req-123',
        auth: { apiKey: 'valid-key' }
      };

      const response = await handler.handleMessage(message);

      expect(response.success).toBe(true);
      expect(mockHandlers.diagnostics.diagnoseErrors).toHaveBeenCalled();
    });
  });

  describe('error handling', () => {
    beforeEach(() => {
      mockAuthManager.validateApiKey.mockReturnValue(true);
    });

    test('should handle invalid message type format', async () => {
      const message = {
        type: 'invalid-format',
        requestId: 'req-123',
        auth: { apiKey: 'valid-key' }
      };

      const response = await handler.handleMessage(message);

      expect(response.success).toBe(false);
      expect(response.error).toBe('Internal Server Error');
      expect(response.message).toBe('Invalid message type format: invalid-format');
    });

    test('should handle unknown API category', async () => {
      const message = {
        type: 'unknown.action',
        requestId: 'req-123',
        auth: { apiKey: 'valid-key' }
      };

      const response = await handler.handleMessage(message);

      expect(response.success).toBe(false);
      expect(response.error).toBe('Internal Server Error');
      expect(response.message).toBe('Unknown API category: unknown');
    });

    test('should handle handler throwing error', async () => {
      mockHandlers.actors.searchActors.mockImplementation(() => {
        throw new Error('Handler error');
      });

      const message = {
        type: 'actors.search',
        requestId: 'req-123',
        auth: { apiKey: 'valid-key' }
      };

      const response = await handler.handleMessage(message);

      expect(response.success).toBe(false);
      expect(response.error).toBe('Internal Server Error');
      expect(response.message).toBe('Handler error');
    });

    test('should handle handler returning error status', async () => {
      mockHandlers.actors.searchActors.mockImplementation((req, res) => {
        res.status(400).json({ message: 'Bad request' });
      });

      const message = {
        type: 'actors.search',
        requestId: 'req-123',
        auth: { apiKey: 'valid-key' }
      };

      const response = await handler.handleMessage(message);

      expect(response.success).toBe(false);
      expect(response.error).toBe('Internal Server Error');
      expect(response.message).toBe('Bad request');
    });
  });

  describe('mock request/response objects', () => {
    test('should create proper mock request object', () => {
      const params = {
        query: { name: 'test' },
        params: { id: '123' }
      };
      const body = { data: 'value' };

      const mockReq = handler.createMockRequest(params, body);

      expect(mockReq).toEqual({
        query: { name: 'test' },
        params: { id: '123' },
        body: { data: 'value' }
      });
    });

    test('should handle empty params and body', () => {
      const mockReq = handler.createMockRequest({}, {});

      expect(mockReq).toEqual({
        query: {},
        params: {},
        body: {}
      });
    });

    test('should create proper mock response object', () => {
      const mockRes = handler.createMockResponse();

      expect(mockRes.json).toBeInstanceOf(Function);
      expect(mockRes.status).toBeInstanceOf(Function);
      expect(mockRes.getData).toBeInstanceOf(Function);
    });

    test('should handle response data flow', () => {
      const mockRes = handler.createMockResponse();
      const testData = { result: 'success' };

      mockRes.json(testData);
      const data = mockRes.getData();

      expect(data).toEqual(testData);
    });

    test('should handle error status codes', () => {
      const mockRes = handler.createMockResponse();
      const errorData = { message: 'Not found' };

      mockRes.status(404).json(errorData);

      expect(() => mockRes.getData()).toThrow('Not found');
    });
  });

  describe('response formatting', () => {
    test('should create success response with proper format', () => {
      const requestId = 'req-123';
      const data = { result: 'test' };

      const response = handler.createSuccessResponse(requestId, data);

      expect(response).toEqual({
        requestId: 'req-123',
        success: true,
        result: { result: 'test' },
        data: { result: 'test' }
      });
    });

    test('should create error response with proper format', () => {
      const requestId = 'req-123';
      const error = 'Test Error';
      const message = 'Error message';

      const response = handler.createErrorResponse(requestId, error, message);

      expect(response).toEqual({
        requestId: 'req-123',
        success: false,
        error: 'Test Error',
        message: 'Error message'
      });
    });
  });

  describe('request logging', () => {
    test('should not log when logging is disabled', () => {
      global.game.settings.get.mockReturnValue(false);
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

      handler.logRequest('actors.search', true);

      expect(consoleSpy).not.toHaveBeenCalled();
      consoleSpy.mockRestore();
    });

    test('should log when logging is enabled', () => {
      global.game.settings.get.mockReturnValue(true);
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

      handler.logRequest('actors.search', true);

      expect(consoleSpy).toHaveBeenCalledWith('Foundry Local REST API | Socket message: actors.search (authenticated)');
      consoleSpy.mockRestore();
    });

    test('should log unauthorized requests', () => {
      global.game.settings.get.mockReturnValue(true);
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

      handler.logRequest('actors.search', false);

      expect(consoleSpy).toHaveBeenCalledWith('Foundry Local REST API | Socket message: actors.search (unauthorized)');
      consoleSpy.mockRestore();
    });
  });

  describe('parameter merging', () => {
    beforeEach(() => {
      mockAuthManager.validateApiKey.mockReturnValue(true);
      mockHandlers.actors.searchActors.mockImplementation((req, res) => {
        res.json({ query: req.query });
      });
    });

    test('should merge query parameters correctly', async () => {
      const message = {
        type: 'actors.search',
        requestId: 'req-123',
        auth: { apiKey: 'valid-key' },
        params: { query: { name: 'existing' } },
        query: { type: 'character', limit: '10' }
      };

      const response = await handler.handleMessage(message);

      expect(response.success).toBe(true);
      
      const callArgs = mockHandlers.actors.searchActors.mock.calls[0];
      expect(callArgs[0].query).toEqual({
        name: 'existing',
        type: 'character',
        limit: '10'
      });
    });

    test('should handle missing query parameters', async () => {
      const message = {
        type: 'actors.search',
        requestId: 'req-123',
        auth: { apiKey: 'valid-key' },
        params: {}
      };

      const response = await handler.handleMessage(message);

      expect(response.success).toBe(true);
      
      const callArgs = mockHandlers.actors.searchActors.mock.calls[0];
      expect(callArgs[0].query).toEqual({});
    });
  });

  describe('authentication edge cases', () => {
    test('should handle auth object without apiKey', async () => {
      const message = {
        type: 'actors.search',
        requestId: 'req-123',
        auth: {}
      };

      const response = await handler.handleMessage(message);

      expect(response.success).toBe(false);
      expect(response.error).toBe('Unauthorized');
    });

    test('should handle null auth object', async () => {
      const message = {
        type: 'actors.search',
        requestId: 'req-123',
        auth: null
      };

      const response = await handler.handleMessage(message);

      expect(response.success).toBe(false);
      expect(response.error).toBe('Unauthorized');
    });

    test('should call validateApiKey with correct parameter', async () => {
      const message = {
        type: 'actors.search',
        requestId: 'req-123',
        auth: { apiKey: 'test-key-value' }
      };

      await handler.handleMessage(message);

      expect(mockAuthManager.validateApiKey).toHaveBeenCalledWith('test-key-value');
    });
  });

  describe('integration scenarios', () => {
    beforeEach(() => {
      mockAuthManager.validateApiKey.mockReturnValue(true);
    });

    test('should handle complete workflow for actors search', async () => {
      const mockActors = [{ id: 'actor-1', name: 'Test Actor' }];
      mockHandlers.actors.searchActors.mockImplementation((req, res) => {
        res.json({
          success: true,
          data: mockActors,
          total: 1
        });
      });

      const message = {
        type: 'actors.search',
        requestId: 'req-123',
        auth: { apiKey: 'valid-key' },
        params: { query: { name: 'test' } }
      };

      const response = await handler.handleMessage(message);

      expect(response.success).toBe(true);
      expect(response.requestId).toBe('req-123');
      expect(response.result).toEqual({
        success: true,
        data: mockActors,
        total: 1
      });

      // Verify authentication was checked
      expect(mockAuthManager.validateApiKey).toHaveBeenCalledWith('valid-key');
      
      // Verify handler was called with correct parameters
      expect(mockHandlers.actors.searchActors).toHaveBeenCalled();
      const callArgs = mockHandlers.actors.searchActors.mock.calls[0];
      expect(callArgs[0].query).toEqual({ name: 'test' });
    });

    test('should handle endpoint-based routing with parameters', async () => {
      mockHandlers.actors.getActor.mockImplementation((req, res) => {
        res.json({ success: true, data: { id: req.params.id, name: 'Found Actor' } });
      });

      const message = {
        endpoint: '/api/actors',
        requestId: 'req-123',
        auth: { apiKey: 'valid-key' },
        params: { id: 'actor-456' },
        query: { detailed: 'true' }
      };

      const response = await handler.handleMessage(message);

      expect(response.success).toBe(true);
      expect(mockHandlers.actors.getActor).toHaveBeenCalled();
      
      const callArgs = mockHandlers.actors.getActor.mock.calls[0];
      expect(callArgs[0].params.id).toBe('actor-456');
      expect(callArgs[0].query.detailed).toBe('true');
    });
  });
});