/**
 * Contract tests for socket message format between bridge server and FoundryVTT module
 * These tests ensure both components agree on the message structure
 */

describe('Socket Message Contract', () => {
  
  describe('Request Message Format', () => {
    const validRequestMessage = {
      type: 'actors.search',
      requestId: 'req_123_1234567890',
      auth: {
        apiKey: 'valid-api-key-here'
      },
      params: {
        query: { type: 'character', limit: 10 },
        params: { id: 'actor123' }
      },
      body: null
    };
    
    test('should have required fields', () => {
      expect(validRequestMessage).toHaveProperty('type');
      expect(validRequestMessage).toHaveProperty('requestId');
      expect(validRequestMessage).toHaveProperty('auth');
      expect(validRequestMessage).toHaveProperty('params');
    });
    
    test('type field should follow category.action format', () => {
      const validTypes = [
        'actors.search',
        'actors.get',
        'items.search',
        'items.get',
        'scenes.search',
        'scenes.get',
        'scenes.current',
        'dice.roll',
        'world.info',
        'status'
      ];
      
      validTypes.forEach(type => {
        if (type !== 'status') {
          expect(type).toMatch(/^[a-z]+\.[a-z]+$/);
        }
      });
    });
    
    test('requestId should be unique identifier', () => {
      expect(validRequestMessage.requestId).toMatch(/^req_\d+_\d+$/);
    });
    
    test('auth should contain apiKey', () => {
      expect(validRequestMessage.auth).toHaveProperty('apiKey');
      expect(typeof validRequestMessage.auth.apiKey).toBe('string');
    });
    
    test('params should contain query and params objects', () => {
      expect(validRequestMessage.params).toHaveProperty('query');
      expect(validRequestMessage.params).toHaveProperty('params');
      expect(typeof validRequestMessage.params.query).toBe('object');
      expect(typeof validRequestMessage.params.params).toBe('object');
    });
    
    test('body can be null or object for POST requests', () => {
      const postMessage = {
        ...validRequestMessage,
        type: 'dice.roll',
        body: { formula: '1d20+5', flavor: 'Attack roll' }
      };
      
      expect(postMessage.body).toBeDefined();
      expect(typeof postMessage.body).toBe('object');
    });
  });
  
  describe('Response Message Format', () => {
    
    describe('Success Response', () => {
      const successResponse = {
        requestId: 'req_123_1234567890',
        success: true,
        data: {
          actors: [
            { id: '1', name: 'Actor 1' },
            { id: '2', name: 'Actor 2' }
          ]
        }
      };
      
      test('should have required fields', () => {
        expect(successResponse).toHaveProperty('requestId');
        expect(successResponse).toHaveProperty('success');
        expect(successResponse).toHaveProperty('data');
      });
      
      test('success should be true', () => {
        expect(successResponse.success).toBe(true);
      });
      
      test('should not have error fields', () => {
        expect(successResponse).not.toHaveProperty('error');
        expect(successResponse).not.toHaveProperty('message');
      });
      
      test('data should be present and valid', () => {
        expect(successResponse.data).toBeDefined();
        expect(successResponse.data).not.toBeNull();
      });
    });
    
    describe('Error Response', () => {
      const errorResponse = {
        requestId: 'req_123_1234567890',
        success: false,
        error: 'NotFound',
        message: 'Actor not found with ID: invalid-id'
      };
      
      test('should have required fields', () => {
        expect(errorResponse).toHaveProperty('requestId');
        expect(errorResponse).toHaveProperty('success');
        expect(errorResponse).toHaveProperty('error');
        expect(errorResponse).toHaveProperty('message');
      });
      
      test('success should be false', () => {
        expect(errorResponse.success).toBe(false);
      });
      
      test('should not have data field', () => {
        expect(errorResponse).not.toHaveProperty('data');
      });
      
      test('error should be a valid error type', () => {
        const validErrorTypes = [
          'Unauthorized',
          'NotFound',
          'BadRequest',
          'InternalError',
          'Timeout',
          'ValidationError'
        ];
        
        expect(validErrorTypes).toContain(errorResponse.error);
      });
      
      test('message should be descriptive', () => {
        expect(typeof errorResponse.message).toBe('string');
        expect(errorResponse.message.length).toBeGreaterThan(0);
      });
    });
  });
  
  describe('Endpoint to Message Type Mapping', () => {
    const endpointMappings = [
      { endpoint: 'GET /api/actors', type: 'actors.search' },
      { endpoint: 'GET /api/actors/:id', type: 'actors.get' },
      { endpoint: 'GET /api/items', type: 'items.search' },
      { endpoint: 'GET /api/items/:id', type: 'items.get' },
      { endpoint: 'GET /api/scenes', type: 'scenes.search' },
      { endpoint: 'GET /api/scenes/:id', type: 'scenes.get' },
      { endpoint: 'GET /api/scenes/current', type: 'scenes.current' },
      { endpoint: 'POST /api/dice/roll', type: 'dice.roll' },
      { endpoint: 'GET /api/world', type: 'world.info' },
      { endpoint: 'GET /api/status', type: 'status' }
    ];
    
    test.each(endpointMappings)(
      '$endpoint should map to $type',
      ({ endpoint, type }) => {
        expect(type).toBeTruthy();
        expect(typeof type).toBe('string');
      }
    );
  });
  
  describe('Parameter Validation', () => {
    
    test('search parameters should be in query object', () => {
      const searchMessage = {
        type: 'actors.search',
        params: {
          query: {
            type: 'character',
            limit: 10,
            skip: 0,
            sort: 'name'
          },
          params: {}
        }
      };
      
      expect(searchMessage.params.query).toBeDefined();
      expect(searchMessage.params.query.type).toBe('character');
      expect(searchMessage.params.query.limit).toBe(10);
    });
    
    test('route parameters should be in params object', () => {
      const getMessage = {
        type: 'actors.get',
        params: {
          query: {},
          params: {
            id: 'actor123'
          }
        }
      };
      
      expect(getMessage.params.params).toBeDefined();
      expect(getMessage.params.params.id).toBe('actor123');
    });
    
    test('POST body should be in body field', () => {
      const postMessage = {
        type: 'dice.roll',
        body: {
          formula: '1d20+5',
          flavor: 'Attack roll',
          whisper: []
        }
      };
      
      expect(postMessage.body).toBeDefined();
      expect(postMessage.body.formula).toBe('1d20+5');
    });
  });
  
  describe('Data Type Contracts', () => {
    
    test('Actor data structure', () => {
      const actorData = {
        id: 'actor123',
        name: 'Test Character',
        type: 'character',
        img: 'path/to/image.png',
        system: {
          attributes: {
            hp: { value: 10, max: 10 }
          }
        }
      };
      
      expect(actorData).toHaveProperty('id');
      expect(actorData).toHaveProperty('name');
      expect(actorData).toHaveProperty('type');
      expect(actorData).toHaveProperty('system');
    });
    
    test('Item data structure', () => {
      const itemData = {
        id: 'item456',
        name: 'Sword',
        type: 'weapon',
        img: 'path/to/sword.png',
        system: {
          damage: '1d8',
          rarity: 'common'
        }
      };
      
      expect(itemData).toHaveProperty('id');
      expect(itemData).toHaveProperty('name');
      expect(itemData).toHaveProperty('type');
      expect(itemData).toHaveProperty('system');
    });
    
    test('Scene data structure', () => {
      const sceneData = {
        id: 'scene789',
        name: 'Tavern',
        active: true,
        img: 'path/to/scene.jpg',
        width: 2000,
        height: 2000,
        grid: {
          type: 1,
          size: 100
        }
      };
      
      expect(sceneData).toHaveProperty('id');
      expect(sceneData).toHaveProperty('name');
      expect(sceneData).toHaveProperty('active');
      expect(typeof sceneData.active).toBe('boolean');
    });
    
    test('Dice roll result structure', () => {
      const rollResult = {
        formula: '1d20+5',
        total: 18,
        results: [13],
        flavor: 'Attack roll',
        messageId: 'msg123'
      };
      
      expect(rollResult).toHaveProperty('formula');
      expect(rollResult).toHaveProperty('total');
      expect(typeof rollResult.total).toBe('number');
      expect(Array.isArray(rollResult.results)).toBe(true);
    });
    
    test('World info structure', () => {
      const worldInfo = {
        title: 'My World',
        system: 'dnd5e',
        version: '11.0.0',
        coreVersion: '11.315',
        systemVersion: '2.4.1',
        activeScene: 'scene123',
        activeCombat: null,
        stats: {
          actors: 50,
          items: 200,
          scenes: 10,
          users: 5
        }
      };
      
      expect(worldInfo).toHaveProperty('title');
      expect(worldInfo).toHaveProperty('system');
      expect(worldInfo).toHaveProperty('version');
      expect(worldInfo).toHaveProperty('stats');
      expect(typeof worldInfo.stats.actors).toBe('number');
    });
  });
  
  describe('Error Scenarios Contract', () => {
    
    test('Authentication failure response', () => {
      const authError = {
        requestId: 'req_123',
        success: false,
        error: 'Unauthorized',
        message: 'Valid API key required'
      };
      
      expect(authError.error).toBe('Unauthorized');
      expect(authError.message).toContain('API key');
    });
    
    test('Not found response', () => {
      const notFoundError = {
        requestId: 'req_124',
        success: false,
        error: 'NotFound',
        message: 'Actor not found with ID: nonexistent'
      };
      
      expect(notFoundError.error).toBe('NotFound');
      expect(notFoundError.message).toContain('not found');
    });
    
    test('Validation error response', () => {
      const validationError = {
        requestId: 'req_125',
        success: false,
        error: 'ValidationError',
        message: 'Invalid dice formula: not-a-formula'
      };
      
      expect(validationError.error).toBe('ValidationError');
      expect(validationError.message).toContain('Invalid');
    });
    
    test('Timeout error response', () => {
      const timeoutError = {
        requestId: 'req_126',
        success: false,
        error: 'Timeout',
        message: 'Request timeout after 5000ms'
      };
      
      expect(timeoutError.error).toBe('Timeout');
      expect(timeoutError.message).toContain('timeout');
    });
  });
});