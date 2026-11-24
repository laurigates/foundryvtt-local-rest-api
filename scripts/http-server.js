/**
 * HTTP Server Handler for Foundry Local REST API
 * Uses FoundryVTT's server-side hooks to handle HTTP requests directly
 */

import { AuthManager } from './auth.js';
import { ActorsAPI } from './routes/actors.js';
import { ItemsAPI } from './routes/items.js';
import { DiceAPI } from './routes/dice.js';
import { ScenesAPI } from './routes/scenes.js';
import { WorldAPI } from './routes/world.js';
import { DiagnosticsAPI } from './routes/diagnostics.js';

export class HTTPServerHandler {
  constructor() {
    this.authManager = new AuthManager();
    this.handlers = {
      actors: new ActorsAPI(),
      items: new ItemsAPI(),
      dice: new DiceAPI(),
      scenes: new ScenesAPI(),
      world: new WorldAPI(),
      diagnostics: new DiagnosticsAPI()
    };
  }

  /**
   * Initialize HTTP request handling
   */
  initialize() {
    // Register HTTP route handlers with FoundryVTT's server
    if (typeof Hooks !== 'undefined') {
      Hooks.on('getRoute', this.handleRoute.bind(this));
      console.log('Foundry Local REST API | HTTP handlers registered');
    }
  }

  /**
   * Handle incoming HTTP requests
   */
  async handleRoute(route, request, response, next) {
    // Only handle API routes
    if (!route.startsWith('/api/')) {
      return next();
    }

    try {
      // Parse route
      const pathParts = route.split('/').filter((p) => p);
      if (pathParts.length < 2) {
        return next();
      }

      // Handle status endpoint (no auth)
      if (pathParts[1] === 'status') {
        return this.sendResponse(response, {
          success: true,
          status: 'ok',
          module: 'foundryvtt-local-rest-api',
          version: '1.0.0',
          world: game.world.id
        });
      }

      // Authenticate request
      const apiKey = this.extractApiKey(request);
      if (!this.authManager.validateApiKey(apiKey)) {
        return this.sendError(response, 401, 'Unauthorized', 'Invalid API key');
      }

      // Route to handler
      const handler = this.handlers[pathParts[1]];
      if (!handler) {
        return next();
      }

      // Create mock req/res for compatibility
      const mockReq = {
        query: request.query || {},
        params: { id: pathParts[2] },
        body: request.body || {},
        method: request.method
      };

      const mockRes = {
        json: (data) => this.sendResponse(response, data),
        status: (code) => ({
          json: (data) => this.sendError(response, code, data.error, data.message)
        })
      };

      // Handle based on route
      await this.routeRequest(pathParts[1], pathParts[2], handler, mockReq, mockRes);
    } catch (error) {
      console.error('Foundry Local REST API | Error handling request:', error);
      this.sendError(response, 500, 'Internal Server Error', error.message);
    }
  }

  /**
   * Route request to appropriate handler
   */
  async routeRequest(category, action, handler, req, res) {
    switch (category) {
      case 'actors':
        if (action) {
          await handler.getActor(req, res);
        } else {
          await handler.searchActors(req, res);
        }
        break;
      case 'items':
        if (action) {
          await handler.getItem(req, res);
        } else {
          await handler.searchItems(req, res);
        }
        break;
      case 'dice':
        if (action === 'roll') {
          await handler.rollDice(req, res);
        }
        break;
      case 'scenes':
        if (action === 'current') {
          await handler.getCurrentScene(req, res);
        } else if (action) {
          await handler.getScene(req, res);
        } else {
          await handler.searchScenes(req, res);
        }
        break;
      case 'world':
        await handler.getWorldInfo(req, res);
        break;
      case 'diagnostics':
        switch (action) {
          case 'logs':
            await handler.getRecentLogs(req, res);
            break;
          case 'health':
            await handler.getSystemHealth(req, res);
            break;
          case 'errors':
            await handler.diagnoseErrors(req, res);
            break;
          default:
            await handler.searchLogs(req, res);
        }
        break;
    }
  }

  /**
   * Extract API key from request
   */
  extractApiKey(request) {
    const headers = request.headers || {};
    let apiKey = headers['x-api-key'];

    if (!apiKey) {
      const authHeader = headers['authorization'];
      if (authHeader && authHeader.startsWith('Bearer ')) {
        apiKey = authHeader.substring(7);
      }
    }

    return apiKey;
  }

  /**
   * Send JSON response
   */
  sendResponse(response, data) {
    response.writeHead(200, { 'Content-Type': 'application/json' });
    response.end(JSON.stringify(data));
  }

  /**
   * Send error response
   */
  sendError(response, code, error, message) {
    response.writeHead(code, { 'Content-Type': 'application/json' });
    response.end(
      JSON.stringify({
        success: false,
        error,
        message
      })
    );
  }
}
