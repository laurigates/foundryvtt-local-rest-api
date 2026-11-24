/**
 * Permission Security Tests for Foundry Local REST API
 * Tests permission validation, user role checking, and document access control
 */

import { SocketMessageHandler } from '../../scripts/socket-handler.js';

describe('Permission Security', () => {
  let socketHandler;
  let mockGame;
  let mockUser;
  let mockActor;

  beforeEach(() => {
    // Mock FoundryVTT game object
    mockUser = {
      id: 'user123',
      name: 'Test User',
      role: 1, // Player role
      isGM: false
    };

    mockActor = {
      id: 'actor123',
      name: 'Test Actor',
      type: 'character',
      // Fields ActorsAPI.formatActorDetail reads
      system: {},
      items: new Map(),
      effects: [],
      ownership: {
        default: 0, // None
        user123: 2, // Observer
        gm123: 3 // Owner
      },
      canUserModify: jest.fn((user, action) => {
        const level = mockActor.ownership[user.id] || mockActor.ownership.default;
        if (action === 'update') return level >= 3;
        if (action === 'delete') return level >= 3;
        return level >= 1;
      }),
      testUserPermission: jest.fn((user, permission) => {
        const level = mockActor.ownership[user.id] || mockActor.ownership.default;
        return level >= permission;
      })
    };

    mockGame = {
      user: mockUser,
      users: new Map([
        ['user123', mockUser],
        ['gm123', { id: 'gm123', name: 'GM User', role: 4, isGM: true }]
      ]),
      actors: new Map([
        ['actor123', mockActor]
      ]),
      scenes: {
        active: {
          id: 'scene123',
          name: 'Test Scene',
          tokens: [],
          notes: [],
          lights: [],
          sounds: [],
          walls: [],
          drawings: [],
          tiles: [],
          templates: []
        }
      },
      settings: {
        get: jest.fn().mockReturnValue('test-api-key')
      }
    };

    global.game = mockGame;

    // Mock console methods
    global.console.error = jest.fn();
    global.console.log = jest.fn();
    
    // Initialize socket handler
    socketHandler = new SocketMessageHandler();
    socketHandler.setApiKey('test-api-key');
  });

  describe('Actor Permission Checks', () => {
    test('should deny access to actors without proper permissions', async () => {
      const request = {
        type: 'actors.get',
        requestId: 'req123',
        auth: { apiKey: 'test-api-key' },
        params: { id: 'actor123' }
      };

      // Mock a user without permissions
      mockActor.ownership.user123 = 0; // None

      // Test that access is denied
      const response = await socketHandler.handleMessage(request);
      
      expect(response.success).toBe(false);
      expect(response.error).toContain('Forbidden');
      expect(response.message).toContain('permission');
    });

    test('should allow read access for observers', async () => {
      const request = {
        type: 'actors.get',
        requestId: 'req123',
        auth: { apiKey: 'test-api-key' },
        params: { id: 'actor123' }
      };

      mockActor.ownership.user123 = 2; // Observer

      const response = await socketHandler.handleMessage(request);
      
      expect(response.success).toBe(true);
      expect(response.data).toBeDefined();
    });

    test('should reject actors.update, which the API does not implement', async () => {
      // The API is read-only; an update request must fail for every role
      // and leave the actor unchanged.
      const request = {
        type: 'actors.update',
        requestId: 'req123',
        auth: { apiKey: 'test-api-key' },
        params: { id: 'actor123' },
        body: { name: 'Updated Name' }
      };

      for (const level of [2, 3]) { // Observer, Owner
        mockActor.ownership.user123 = level;
        const response = await socketHandler.handleMessage(request);

        expect(response.success).toBe(false);
        expect(response.message).toContain('Unknown actors action: update');
        expect(mockActor.name).toBe('Test Actor');
      }
    });

    test('should allow GM to access any actor', async () => {
      const request = {
        type: 'actors.get',
        requestId: 'req123',
        auth: { apiKey: 'test-api-key' },
        params: { id: 'actor123' }
      };

      // Switch to GM user
      mockGame.user = mockGame.users.get('gm123');
      mockActor.ownership.gm123 = 0; // Even with no explicit permission

      const response = await socketHandler.handleMessage(request);
      
      expect(response.success).toBe(true);
      expect(response.data).toBeDefined();
    });
  });

  describe('Dice Rolling Permissions', () => {
    test('should allow players to roll dice', async () => {
      const request = {
        type: 'dice.roll',
        requestId: 'req123',
        auth: { apiKey: 'test-api-key' },
        body: { formula: '1d20+5', reason: 'Attack' }
      };

      const response = await socketHandler.handleMessage(request);
      
      // The route's {success, data} payload sits inside the socket envelope
      expect(response.success).toBe(true);
      expect(response.data.data.total).toEqual(expect.any(Number));
    });

    test('should prevent dice rolls from users with None role', async () => {
      mockUser.role = 0; // None
      
      const request = {
        type: 'dice.roll',
        requestId: 'req123',
        auth: { apiKey: 'test-api-key' },
        body: { formula: '1d20+5' }
      };

      const response = await socketHandler.handleMessage(request);
      
      expect(response.success).toBe(false);
      expect(response.error).toContain('Forbidden');
    });
  });

  describe('Scene Access Permissions', () => {
    // Scene responses are not filtered by role (only actor responses go
    // through sanitizeDocumentData); access itself is gated at Player.
    test('should allow players and GMs to read the current scene', async () => {
      const request = {
        type: 'scenes.current',
        requestId: 'req123',
        auth: { apiKey: 'test-api-key' }
      };

      mockUser.role = 1; // Player
      let response = await socketHandler.handleMessage(request);
      expect(response.success).toBe(true);
      expect(response.data.data.id).toBe('scene123');

      mockGame.user = mockGame.users.get('gm123');
      response = await socketHandler.handleMessage(request);
      expect(response.success).toBe(true);
      expect(response.data.data.id).toBe('scene123');
    });

    test('should deny the current scene to users with None role', async () => {
      mockUser.role = 0; // None
      const response = await socketHandler.handleMessage({
        type: 'scenes.current',
        requestId: 'req123',
        auth: { apiKey: 'test-api-key' }
      });

      expect(response.success).toBe(false);
      expect(response.error).toBe('Forbidden');
    });
  });

  describe('Diagnostics Permissions (#16)', () => {
    // logs, search and errors all return captured log entries, stack traces
    // included, so they share the Assistant gate; health needs Trusted.
    const required = {
      'diagnostics.logs': 3,
      'diagnostics.search': 3,
      'diagnostics.errors': 3,
      'diagnostics.health': 2
    };
    const stubs = {
      'diagnostics.logs': 'getRecentLogs',
      'diagnostics.search': 'searchLogs',
      'diagnostics.errors': 'diagnoseErrors',
      'diagnostics.health': 'getSystemHealth'
    };

    beforeEach(() => {
      // Role gating only: stub the routes so the allowed case needs no
      // diagnostics fixtures.
      for (const method of Object.values(stubs)) {
        jest.spyOn(socketHandler.handlers.diagnostics, method)
          .mockImplementation((req, res) => res.json({ success: true, data: { stub: method } }));
      }
    });

    test.each(Object.entries(required))('%s refuses a user one role below the gate', async (type, role) => {
      mockUser.role = role - 1;

      const response = await socketHandler.handleMessage({
        type,
        requestId: 'req123',
        auth: { apiKey: 'test-api-key' },
        params: { query: { pattern: '.' }, params: {} }
      });

      expect(response.success).toBe(false);
      expect(response.error).toBe('Forbidden');
      expect(socketHandler.handlers.diagnostics[stubs[type]]).not.toHaveBeenCalled();
    });

    test.each(Object.entries(required))('%s answers a user at the gate', async (type, role) => {
      mockUser.role = role;

      const response = await socketHandler.handleMessage({
        type,
        requestId: 'req123',
        auth: { apiKey: 'test-api-key' },
        params: { query: { pattern: '.' }, params: {} }
      });

      expect(response.success).toBe(true);
      expect(response.data.data.stub).toBe(stubs[type]);
    });
  });

  describe('Permission Bypass Attempts', () => {
    test('should prevent permission escalation through API', async () => {
      // Attempt to modify actor permissions directly
      const request = {
        type: 'actors.update',
        requestId: 'req123',
        auth: { apiKey: 'test-api-key' },
        params: { id: 'actor123' },
        body: { 
          ownership: { 
            user123: 3 // Try to give self owner permission
          } 
        }
      };

      mockActor.ownership.user123 = 1; // Limited permission

      const response = await socketHandler.handleMessage(request);
      
      expect(response.success).toBe(false);
      expect(response.message).toContain('Unknown actors action: update');
      expect(mockActor.ownership.user123).toBe(1); // Unchanged
    });

    test('should validate permission checks are not bypassed', async () => {
      // Try to access actor with manipulated permission check
      const request = {
        type: 'actors.get',
        requestId: 'req123',
        auth: { apiKey: 'test-api-key' },
        params: { 
          id: 'actor123',
          // Try to inject permission override
          __proto__: { canUserModify: true }
        }
      };

      mockActor.ownership.user123 = 0; // None

      const response = await socketHandler.handleMessage(request);
      
      expect(response.success).toBe(false);
      expect(response.error).toContain('Forbidden');
    });
  });

  describe('User Role Validation', () => {
    test('should enforce role hierarchy', async () => {
      const roles = {
        0: 'None',
        1: 'Player',
        2: 'Trusted',
        3: 'Assistant',
        4: 'GameMaster'
      };

      // This test is about role gating, not world formatting, so stub the
      // route rather than mocking every collection formatWorldInfo reads.
      jest.spyOn(socketHandler.handlers.world, 'getWorldInfo')
        .mockImplementation((req, res) => res.json({ success: true, data: { id: 'test-world' } }));

      // Test each role level
      for (const [level, name] of Object.entries(roles)) {
        mockUser.role = parseInt(level);
        mockUser.isGM = level === '4';

        const request = {
          type: 'world.info',
          requestId: `req${level}`,
          auth: { apiKey: 'test-api-key' }
        };

        const response = await socketHandler.handleMessage(request);

        if (level === '0') {
          // world.info requires the Player role
          expect(response.success).toBe(false);
          expect(response.error).toBe('Forbidden');
          expect(response.data).toBeUndefined();
        } else {
          expect(response.success).toBe(true);
        }
      }
    });
  });
});