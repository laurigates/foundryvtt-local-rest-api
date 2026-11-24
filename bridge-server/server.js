/**
 * FoundryVTT REST API Bridge Server
 * 
 * This server creates actual HTTP endpoints and forwards requests to the 
 * FoundryVTT module via socket.io, solving the architectural limitation 
 * where FoundryVTT modules run in browser context and cannot create HTTP servers.
 */

import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import dotenv from 'dotenv';
import { FoundrySocketClient } from './lib/socket-client.js';
import { AuthManager } from './lib/auth.js';

// Import route handlers
import { createActorsRouter } from './routes/actors.js';
import { createItemsRouter } from './routes/items.js';
import { createDiceRouter } from './routes/dice.js';
import { createScenesRouter } from './routes/scenes.js';
import { createWorldRouter } from './routes/world.js';
import { createDiagnosticsRouter } from './routes/diagnostics.js';
import { createCompendiumRouter } from './routes/compendium.js';

// Load environment variables
dotenv.config();

class BridgeServer {
  constructor() {
    this.app = express();
    this.port = process.env.API_PORT || 3030;
    this.foundryUrl = process.env.FOUNDRY_URL || 'http://localhost:30000';
    this.apiKey = process.env.API_KEY;
    this.requestTimeout = parseInt(process.env.REQUEST_TIMEOUT) || 5000;
    this.corsOrigin = process.env.CORS_ORIGIN || '*';
    this.logLevel = process.env.LOG_LEVEL || 'info';
    
    // Validate required configuration
    if (!this.apiKey) {
      console.error('[BridgeServer] ERROR: API_KEY environment variable is required');
      process.exit(1);
    }

    this.socketClient = null;
    this.authManager = null;
    this.server = null;
    this.isShuttingDown = false;
  }

  /**
   * Initialize and start the server
   */
  async start() {
    try {
      console.log('[BridgeServer] Starting FoundryVTT REST API Bridge Server...');
      console.log(`[BridgeServer] FoundryVTT URL: ${this.foundryUrl}`);
      console.log(`[BridgeServer] API Port: ${this.port}`);
      console.log(`[BridgeServer] Request Timeout: ${this.requestTimeout}ms`);

      // Initialize socket client with authentication
      this.socketClient = new FoundrySocketClient({
        foundryUrl: this.foundryUrl,
        requestTimeout: this.requestTimeout,
        namespace: process.env.FOUNDRY_NAMESPACE || 'module.foundryvtt-local-rest-api',
        username: process.env.FOUNDRY_USERNAME,
        password: process.env.FOUNDRY_PASSWORD,
        userId: process.env.FOUNDRY_USER_ID,
        worldId: process.env.FOUNDRY_WORLD_ID
      });

      // Initialize authentication
      this.authManager = new AuthManager(this.apiKey);

      // Setup Express app
      this.setupMiddleware();
      this.setupRoutes();
      this.setupErrorHandling();

      // Connect to FoundryVTT
      await this.socketClient.connect();

      // Start HTTP server
      this.server = this.app.listen(this.port, () => {
        console.log(`[BridgeServer] ✅ Bridge server running on http://localhost:${this.port}`);
        console.log(`[BridgeServer] ✅ Connected to FoundryVTT at ${this.foundryUrl}`);
        console.log(`[BridgeServer] 🔑 API Key: ${this.authManager.getCurrentApiKey()}`);
        console.log('[BridgeServer] Ready to forward requests to FoundryVTT module');
      });

      // Setup graceful shutdown
      this.setupGracefulShutdown();

    } catch (error) {
      console.error('[BridgeServer] Failed to start server:', error.message);
      process.exit(1);
    }
  }

  /**
   * Setup Express middleware
   */
  setupMiddleware() {
    // Security middleware
    this.app.use(helmet({
      crossOriginResourcePolicy: { policy: 'cross-origin' }
    }));

    // CORS middleware
    this.app.use(cors({
      origin: this.corsOrigin,
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'x-api-key']
    }));

    // Body parsing middleware
    this.app.use(express.json({ limit: '10mb' }));
    this.app.use(express.urlencoded({ extended: true, limit: '10mb' }));

    // Request logging middleware
    if (this.logLevel === 'debug') {
      this.app.use((req, res, next) => {
        console.log(`[BridgeServer] ${req.method} ${req.path} - ${req.ip}`);
        next();
      });
    }

    // Authentication middleware - exclude /api/status
    this.app.use('/api', (req, res, next) => {
      // Skip auth for status endpoint
      if (req.path === '/status') {
        return next();
      }
      // Apply auth for all other API endpoints
      this.authManager.authenticate(req, res, next);
    });
  }

  /**
   * Setup API routes
   */
  setupRoutes() {
    // Health check endpoint (no auth required)
    this.app.get('/api/status', (req, res) => {
      const socketStatus = this.socketClient.getConnectionStatus();
      
      res.json({
        success: true,
        status: 'ok',
        server: 'foundry-rest-bridge-server',
        version: '1.0.0',
        foundry: {
          url: this.foundryUrl,
          connected: socketStatus.connected,
          socketId: socketStatus.socketId
        },
        bridge: {
          port: this.port,
          uptime: process.uptime(),
          pendingRequests: socketStatus.pendingRequests
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
    this.app.use('/api/compendium', createCompendiumRouter(this.socketClient));

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
          diagnostics: '/api/diagnostics',
          compendium: '/api/compendium/search'
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
          'GET /api/diagnostics/errors',
          'GET /api/diagnostics/connection',
          'GET /api/compendium/search'
        ]
      });
    });
  }

  /**
   * Setup error handling middleware
   */
  setupErrorHandling() {
    this.app.use((err, req, res, next) => {
      console.error('[BridgeServer] Unhandled error:', err.message);
      console.error(err.stack);

      res.status(500).json({
        success: false,
        error: 'Internal Server Error',
        message: 'An unexpected error occurred'
      });
    });

    // Handle unhandled promise rejections
    process.on('unhandledRejection', (reason, promise) => {
      console.error('[BridgeServer] Unhandled Rejection at:', promise, 'reason:', reason);
    });

    // Handle uncaught exceptions
    process.on('uncaughtException', (error) => {
      console.error('[BridgeServer] Uncaught Exception:', error);
      this.shutdown(1);
    });
  }

  /**
   * Setup graceful shutdown handling
   */
  setupGracefulShutdown() {
    const gracefulShutdown = (signal) => {
      console.log(`[BridgeServer] Received ${signal}, starting graceful shutdown...`);
      this.shutdown(0);
    };

    process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
    process.on('SIGINT', () => gracefulShutdown('SIGINT'));
  }

  /**
   * Gracefully shutdown the server
   */
  async shutdown(exitCode = 0) {
    if (this.isShuttingDown) {
      return;
    }
    
    this.isShuttingDown = true;
    console.log('[BridgeServer] Shutting down...');

    try {
      // Close HTTP server
      if (this.server) {
        await new Promise((resolve) => {
          this.server.close(resolve);
        });
        console.log('[BridgeServer] HTTP server closed');
      }

      // Disconnect from FoundryVTT
      if (this.socketClient) {
        this.socketClient.disconnect();
        console.log('[BridgeServer] Disconnected from FoundryVTT');
      }

      console.log('[BridgeServer] Graceful shutdown complete');
      process.exit(exitCode);
    } catch (error) {
      console.error('[BridgeServer] Error during shutdown:', error);
      process.exit(1);
    }
  }
}

// Start the server
const server = new BridgeServer();
server.start();