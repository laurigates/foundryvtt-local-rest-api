/**
 * Socket Message Handler for Foundry Local REST API v13+
 * Routes socket messages with enhanced security and v13 Query System support
 */

import { AuthManager } from './auth.js';
import { PermissionValidator } from './security/permissions.js';
import { ValidationSchemas } from './validation/schemas.js';
import { ActorsAPI } from './routes/actors.js';
import { ItemsAPI } from './routes/items.js';
import { DiceAPI } from './routes/dice.js';
import { ScenesAPI } from './routes/scenes.js';
import { WorldAPI } from './routes/world.js';
import { DiagnosticsAPI } from './routes/diagnostics.js';

export class SocketMessageHandler {
  constructor() {
    this.authManager = new AuthManager();
    this.permissionValidator = new PermissionValidator();
    this.validationSchemas = new ValidationSchemas();
    
    // Initialize API handlers
    this.handlers = {
      actors: new ActorsAPI(),
      items: new ItemsAPI(),
      dice: new DiceAPI(),
      scenes: new ScenesAPI(),
      world: new WorldAPI(),
      diagnostics: new DiagnosticsAPI()
    };

    // Register v13 Query handlers for RPC-style communication
    // Only register if game.socket exists (not in test environment)
    if (typeof game !== 'undefined' && game?.socket) {
      this.registerQueryHandlers();
    }
  }

  /**
   * Register FoundryVTT v13 Query System handlers
   * This provides a more reliable RPC mechanism with timeout support
   */
  registerQueryHandlers() {
    // Register in CONFIG for v13 Query System
    if (typeof CONFIG !== 'undefined') {
      CONFIG.foundryvtt_local_rest_api = {
        queryHandlers: {
          'api.request': this.handleQueryRequest.bind(this)
        }
      };
    }

    // Also register legacy socket handler for backward compatibility with bridge
    if (game?.socket?.on) {
      game.socket.on('module.foundryvtt-local-rest-api', this.handleMessage.bind(this));
    }
  }

  /**
   * Handle v13 Query System requests with timeout and user targeting
   * @param {Object} request - The query request
   * @param {User} user - The user making the request
   * @returns {Promise} Query response
   */
  async handleQueryRequest(request, user) {
    // Validate user permissions at the query level
    if (!user || user.role < USER.PERMISSIONS.PLAYER) {
      throw new Error('Insufficient permissions for API access');
    }

    // Process through standard message handler with user context
    const response = await this.handleMessage({
      ...request,
      _queryUser: user // Attach user for permission checking
    });

    if (!response.success) {
      throw new Error(response.message || response.error);
    }

    return response.data;
  }

  /**
   * Set the API key for authentication
   */
  setApiKey(apiKey) {
    this.authManager.setApiKey(apiKey);
  }

  /**
   * Handle incoming socket messages with enhanced security
   */
  async handleMessage(data) {
    // Support both formats from bridge server
    const { 
      type, 
      endpoint,  // Bridge server may send endpoint instead of type
      requestId, 
      auth, 
      params = {}, 
      query = {},  // Bridge server sends query separately
      body = {},
      _queryUser // User from v13 Query System
    } = data;
    
    // Map endpoint to type if needed
    let messageType = type;
    if (!messageType && endpoint) {
      messageType = this.mapEndpointToType(endpoint, params);
    }
    
    // Merge query into params for compatibility. Destructuring defaults apply
    // only to undefined, so a message with `params: null` (or another
    // non-object) reached `params.query` and threw outside the try below.
    const safeParams = params && typeof params === 'object' ? params : {};
    const mergedParams = { ...safeParams, query: { ...safeParams.query, ...query } };

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
          version: '2.0.0', // Updated for v13
          foundry: game.version,
          system: game.system.version,
          world: game.world.id,
          v13Features: true,
          querySystemEnabled: !!CONFIG.foundryvtt_local_rest_api?.queryHandlers
        });
      }

      // Get requesting user (from query system or current user)
      const user = _queryUser || game.user;

      // Authenticate request
      if (!this.authenticate(auth, user)) {
        this.logRequest(messageType, false, user);
        return this.createErrorResponse(requestId, 'Unauthorized', 'Valid API key required');
      }

      // Validate input based on message type
      const validation = await this.validateInput(messageType, mergedParams, body);
      if (!validation.valid) {
        return this.createErrorResponse(requestId, 'Validation Error', validation.errors.join(', '));
      }

      // Check permissions for the operation
      const permissionCheck = await this.checkPermissions(messageType, validation.data, user);
      if (!permissionCheck.success) {
        this.logRequest(messageType, false, user, 'Permission denied');
        return this.createErrorResponse(requestId, permissionCheck.error, permissionCheck.message);
      }

      this.logRequest(messageType, true, user);

      // Route message to appropriate handler with validated data
      const result = await this.routeMessage(messageType, validation.data, body, user);
      return this.createSuccessResponse(requestId, result);

    } catch (error) {
      console.error('Foundry Local REST API | Error handling socket message:', error);
      return this.createErrorResponse(requestId, 'Internal Server Error', error.message);
    }
  }

  /**
   * Map REST endpoint to message type
   */
  mapEndpointToType(endpoint, params) {
    const parts = endpoint.replace('/api/', '').split('/');
    
    if (parts[0] === 'actors') {
      return params.id ? 'actors.get' : 'actors.search';
    } else if (parts[0] === 'items') {
      return params.id ? 'items.get' : 'items.search';
    } else if (parts[0] === 'scenes') {
      return parts[1] === 'current' ? 'scenes.current' : (params.id ? 'scenes.get' : 'scenes.search');
    } else if (parts[0] === 'world') {
      return 'world.info';
    } else if (parts[0] === 'dice' && parts[1] === 'roll') {
      return 'dice.roll';
    } else if (parts[0] === 'diagnostics') {
      return `diagnostics.${parts[1] || 'health'}`;
    }
    
    return null;
  }

  /**
   * Authenticate socket message with user context
   */
  authenticate(auth, user) {
    if (!auth || !auth.apiKey) {
      return false;
    }

    // For v13, check if this is a user-specific API key
    if (auth.userId && user) {
      // Validate user-specific key (stored in user flags in v13)
      const userKey = user.getFlag('foundryvtt-local-rest-api', 'apiKey');
      if (userKey) {
        return this.authManager.validateApiKey(auth.apiKey, userKey);
      }
    }

    // Fall back to global API key
    return this.authManager.validateApiKey(auth.apiKey);
  }

  /**
   * Validate input based on message type
   */
  async validateInput(type, params, body) {
    const [category, action] = type.split('.');
    
    switch (category) {
      case 'actors':
        if (action === 'search') {
          return this.validationSchemas.validateActorSearch(params.query || params);
        } else if (action === 'get') {
          const idValidation = this.validationSchemas.validateId(params.id);
          return {
            valid: idValidation.valid,
            errors: idValidation.valid ? [] : [idValidation.error],
            data: idValidation.valid ? { id: idValidation.value } : {}
          };
        }
        break;
        
      case 'dice':
        if (action === 'roll') {
          return this.validationSchemas.validateDiceRoll(body);
        }
        break;
        
      case 'items':
      case 'scenes':
        // Similar validation patterns
        return { valid: true, errors: [], data: params };
        
      default:
        return { valid: true, errors: [], data: params };
    }
    
    return { valid: true, errors: [], data: params };
  }

  /**
   * Check permissions for the operation
   */
  async checkPermissions(type, params, user) {
    const [category, action] = type.split('.');
    
    // System-level permission checks
    const systemOps = {
      'world.info': 'world.info',
      'scenes.current': 'scenes.current',
      'scenes.list': 'scenes.list',
      'diagnostics.health': 'diagnostics.health',
      'diagnostics.logs': 'diagnostics.logs'
    };
    
    if (systemOps[type]) {
      return this.permissionValidator.validateSystemPermission(user, systemOps[type]);
    }
    
    // Document-level permission checks
    if (category === 'actors' && action === 'get' && params.id) {
      const actor = game.actors.get(params.id);
      if (!actor) {
        return { success: false, error: 'Not Found', message: 'Actor not found' };
      }
      return this.permissionValidator.validateDocumentPermission(user, actor, 'read');
    }
    
    if (category === 'dice' && action === 'roll') {
      // Check if user can roll dice
      if (!this.permissionValidator.hasMinimumRole(user, 'roll')) {
        return {
          success: false,
          error: 'Forbidden',
          message: 'Insufficient permissions to roll dice'
        };
      }
    }
    
    return { success: true };
  }

  /**
   * Route message to appropriate API handler with user context
   */
  async routeMessage(type, params, body, user) {
    const [category, action] = type.split('.');

    if (!category || !action) {
      throw new Error(`Invalid message type format: ${type}`);
    }

    const handler = this.handlers[category];
    if (!handler) {
      throw new Error(`Unknown API category: ${category}`);
    }

    // Create mock req/res objects with user context
    const mockReq = this.createMockRequest(params, body, user);
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

    const responseData = mockRes.getData();
    
    // Apply permission-based data sanitization
    if (category === 'actors' && responseData) {
      if (Array.isArray(responseData)) {
        // Filter collection by permissions
        const filtered = this.permissionValidator.filterByPermission(user, responseData, 'read');
        return filtered.map(actor => 
          this.permissionValidator.sanitizeDocumentData(user, actor, actor)
        );
      } else if (responseData.data) {
        // Sanitize single actor data
        const actor = game.actors.get(params.id);
        if (actor) {
          responseData.data = this.permissionValidator.sanitizeDocumentData(user, actor, responseData.data);
        }
      }
    }
    
    return responseData;
  }

  /**
   * Route actors messages
   */
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
      // The API is read-only: ActorsAPI has no update/create/delete methods.
      // Cases that called them failed with "handler.updateActor is not a
      // function"; such actions now fall through to the unknown-action error.
      default:
        throw new Error(`Unknown actors action: ${action}`);
    }
  }

  /**
   * Route items messages
   */
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

  /**
   * Route dice messages
   */
  async routeDiceMessage(handler, action, req, res) {
    switch (action) {
      case 'roll':
        await handler.rollDice(req, res);
        break;
      default:
        throw new Error(`Unknown dice action: ${action}`);
    }
  }

  /**
   * Route scenes messages
   */
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

  /**
   * Route world messages
   */
  async routeWorldMessage(handler, action, req, res) {
    switch (action) {
      case 'info':
        await handler.getWorldInfo(req, res);
        break;
      default:
        throw new Error(`Unknown world action: ${action}`);
    }
  }

  /**
   * Route diagnostics messages
   */
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

  /**
   * Create mock request object with user context
   */
  createMockRequest(params, body, user) {
    return {
      query: params.query || {},
      params: params.params || params,
      body: body || {},
      user: user, // v13: Attach user for permission checking in handlers
      headers: {}
    };
  }

  /**
   * Create mock response object for existing handlers
   */
  createMockResponse() {
    let responseData = null;
    let statusCode = 200;

    // json() and status() return the response object itself so handlers can
    // chain them (res.status(404).json(...)), as with Express. Arrow functions
    // returning `this` returned the SocketMessageHandler instead, so every
    // handler error path threw "res.status(...).json is not a function".
    const res = {
      json: (data) => {
        responseData = data;
        return res;
      },
      status: (code) => {
        statusCode = code;
        return res;
      },
      getData: () => {
        if (statusCode !== 200) {
          throw new Error(responseData?.message || `HTTP ${statusCode}`);
        }
        return responseData;
      }
    };
    return res;
  }

  /**
   * Create success response for socket
   */
  createSuccessResponse(requestId, data) {
    return {
      requestId,
      success: true,
      result: data,  // Bridge server expects 'result' not 'data'
      data,  // Keep both for compatibility
      timestamp: Date.now(),
      v13: true // Indicate v13 features are available
    };
  }

  /**
   * Create error response for socket
   */
  createErrorResponse(requestId, error, message) {
    return {
      requestId,
      success: false,
      error,
      message,
      timestamp: Date.now()
    };
  }

  /**
   * Enhanced logging with user context
   */
  logRequest(type, authenticated, user, additionalInfo = '') {
    const logRequests = game.settings.get('foundryvtt-local-rest-api', 'log-requests');
    if (logRequests) {
      const authStatus = authenticated ? 'authenticated' : 'unauthorized';
      const userInfo = user ? `[${user.name}:${this.permissionValidator.getRoleName(user.role)}]` : '[anonymous]';
      const info = additionalInfo ? ` - ${additionalInfo}` : '';
      console.log(`Foundry Local REST API | ${type} ${userInfo} (${authStatus})${info}`);
    }
  }

  /**
   * Use v13's Query System to invoke API on specific user
   * @param {string} userId - Target user ID
   * @param {Object} request - API request
   * @param {number} timeout - Timeout in milliseconds
   * @returns {Promise} Query response
   */
  static async queryUser(userId, request, timeout = 5000) {
    // v13 Query System with timeout support
    const user = game.users.get(userId);
    if (!user) {
      throw new Error(`User ${userId} not found`);
    }

    return new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        reject(new Error(`Query timeout after ${timeout}ms`));
      }, timeout);

      // Use v13's query system
      game.socket.emit('module.foundryvtt-local-rest-api', {
        type: 'query',
        target: userId,
        request,
        callback: (response) => {
          clearTimeout(timeoutId);
          if (response.success) {
            resolve(response);
          } else {
            reject(new Error(response.message || response.error));
          }
        }
      });
    });
  }
}