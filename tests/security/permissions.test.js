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

    test('should require owner permission for updates', async () => {
      const request = {
        type: 'actors.update',
        requestId: 'req123',
        auth: { apiKey: 'test-api-key' },
        params: { id: 'actor123' },
        body: { name: 'Updated Name' }
      };

      // Test with observer permission (not enough)
      mockActor.ownership.user123 = 2; // Observer
      let response = await socketHandler.handleMessage(request);
      
      expect(response.success).toBe(false);
      expect(response.error).toContain('Forbidden');

      // Test with owner permission
      mockActor.ownership.user123 = 3; // Owner
      response = await socketHandler.handleMessage(request);
      
      expect(response.success).toBe(true);
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
      
      expect(response.success).toBe(true);
      expect(response.data.total).toBeDefined();
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
    test('should restrict scene details based on user role', async () => {
      const request = {
        type: 'scenes.current',
        requestId: 'req123',
        auth: { apiKey: 'test-api-key' }
      };

      // Test with player role
      mockUser.role = 1; // Player
      let response = await socketHandler.handleMessage(request);
      
      // Players should get limited scene info
      expect(response.success).toBe(true);
      expect(response.data.tokens).toBeUndefined(); // No token info for players

      // Test with GM role
      mockGame.user = mockGame.users.get('gm123');
      response = await socketHandler.handleMessage(request);
      
      // GMs should get full scene info
      expect(response.success).toBe(true);
      expect(response.data.tokens).toBeDefined();
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
      expect(response.error).toContain('Forbidden');
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
          // None role should have very limited access
          expect(response.data.actors).toBeUndefined();
        } else {
          expect(response.success).toBe(true);
        }
      }
    });
  });
});