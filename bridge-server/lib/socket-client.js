/**
 * Socket.io client for communicating with FoundryVTT module
 * Handles connection management, request forwarding, and response handling
 */

import { io } from 'socket.io-client';
import { EventEmitter } from 'events';
import { FoundryAuthenticator } from './foundry-auth.js';

export class FoundrySocketClient extends EventEmitter {
  constructor(options = {}) {
    super();
    
    this.foundryUrl = options.foundryUrl || 'http://localhost:30000';
    this.apiKey = options.apiKey;
    this.timeout = options.timeout || 5000;
    this.namespace = options.namespace || 'module.foundryvtt-local-rest-api';
    this.requestTimeout = options.requestTimeout || this.timeout;
    this.maxRetries = options.maxRetries || 3;
    this.reconnectDelay = options.reconnectDelay || 1000;
    
    // Authentication options
    this.username = options.username;
    this.password = options.password;
    this.worldId = options.worldId;
    
    this.socket = null;
    this.isConnected = false;
    this.pendingRequests = new Map();
    this.requestCounter = 0;
    this.retryCount = 0;
    this.authenticator = null;
    
    // Error tracking
    this.lastError = null;
    this.errorHistory = [];
    this.maxErrorHistory = 10;
    this.connectionAttempts = 0;
    this.lastConnectionAttempt = null;
  }

  /**
   * Log with timestamp
   */
  log(level, message, data = null) {
    const timestamp = new Date().toISOString();
    const logMessage = `[${timestamp}] [SocketClient] ${message}`;
    
    if (level === 'error') {
      console.error(logMessage, data || '');
    } else if (level === 'warn') {
      console.warn(logMessage, data || '');
    } else {
      console.log(logMessage, data || '');
    }
  }

  /**
   * Categorize and track errors
   */
  categorizeError(error) {
    const errorInfo = {
      timestamp: new Date().toISOString(),
      message: error.message,
      code: error.code,
      type: 'unknown',
      troubleshooting: []
    };

    // Categorize by error code or message
    if (error.code === 'ECONNREFUSED') {
      errorInfo.type = 'connection_refused';
      errorInfo.troubleshooting = [
        `FoundryVTT server is not reachable at ${this.foundryUrl}`,
        'Check if FoundryVTT is running',
        'Verify the URL and port are correct',
        'Ensure no firewall is blocking the connection'
      ];
    } else if (error.message?.includes('timeout')) {
      errorInfo.type = 'timeout';
      errorInfo.troubleshooting = [
        'FoundryVTT is not responding within the timeout period',
        'The server may be overloaded or slow to respond',
        'Try increasing the timeout value',
        'Check network connectivity'
      ];
    } else if (error.message?.includes('401') || error.message?.includes('unauthorized')) {
      errorInfo.type = 'authentication';
      errorInfo.troubleshooting = [
        'API key authentication failed',
        'Verify the API key matches the one in FoundryVTT module settings',
        'Ensure the REST API module is enabled in FoundryVTT',
        'Check that you have the correct permissions'
      ];
    } else if (error.message?.includes('module') || error.message?.includes('namespace')) {
      errorInfo.type = 'module_not_found';
      errorInfo.troubleshooting = [
        'The FoundryVTT REST API module may not be installed or enabled',
        'Check that the module is installed in FoundryVTT',
        'Verify the module is enabled for the current world',
        'Ensure the module\'s socket server is running'
      ];
    } else if (error.message?.includes('world')) {
      errorInfo.type = 'world_not_loaded';
      errorInfo.troubleshooting = [
        'No world is currently loaded in FoundryVTT',
        'Load a world in FoundryVTT before connecting',
        'Check that the correct world is active'
      ];
    } else if (error.type === 'TransportError' || error.message?.includes('xhr poll')) {
      errorInfo.type = 'transport_error';
      errorInfo.troubleshooting = [
        'Socket.io transport layer failed',
        'This may indicate a proxy or network configuration issue',
        'Try connecting directly without proxies',
        'Check if WebSocket connections are allowed'
      ];
    }

    // Store error in history
    this.lastError = errorInfo;
    this.errorHistory.unshift(errorInfo);
    if (this.errorHistory.length > this.maxErrorHistory) {
      this.errorHistory.pop();
    }

    return errorInfo;
  }

  /**
   * Connect to FoundryVTT server
   */
  async connect() {
    this.connectionAttempts++;
    this.lastConnectionAttempt = new Date().toISOString();
    this.log('info', `Connecting to FoundryVTT at ${this.foundryUrl} (attempt ${this.connectionAttempts})`);
    
    try {
      let socketOptions = {
        path: '/socket.io',
        autoConnect: true,
        reconnection: true,
        reconnectionDelay: this.reconnectDelay,
        reconnectionAttempts: 5,
        timeout: this.requestTimeout,
        forceNew: true,
        transports: ['websocket'],  // Force WebSocket for better compatibility
        query: {
          // Identify as an API client
          client: 'foundryvtt-rest-bridge',
          version: '1.0.0'
        }
      };

      // If username and password are provided, authenticate first
      this.log('info', `Checking auth - username: ${this.username}, has password: ${!!this.password}`);
      
      if (this.username && this.password) {
        this.log('info', `Starting authentication for user: ${this.username}`);
        
        // Create and initialize the authenticator
        this.authenticator = new FoundryAuthenticator({
          foundryUrl: this.foundryUrl,
          username: this.username,
          password: this.password,
          worldId: this.worldId
        });
        
        try {
          // Authenticate and get session cookie
          const authResult = await this.authenticator.authenticate();
          this.log('info', '✅ Authentication successful, session obtained');
          this.log('debug', `Session cookie: ${authResult.sessionCookie}`);
          
          // Get authenticated socket options
          const authOptions = this.authenticator.getSocketAuthOptions();
          
          // Merge authentication options with base options
          socketOptions = {
            ...socketOptions,
            ...authOptions,
            // For websocket transport, we need to pass cookies differently
            transports: ['websocket', 'polling'],
            transportOptions: {
              websocket: {
                extraHeaders: {
                  'Cookie': this.authenticator.sessionCookie,
                  'User-Agent': 'FoundryVTT-Bridge-Server/1.0'
                }
              },
              polling: authOptions.transportOptions?.polling || {}
            },
            auth: authOptions.auth,
            withCredentials: true
          };
          
          this.log('info', 'Connecting as authenticated Socket.io client');
        } catch (authError) {
          this.log('error', `Authentication failed: ${authError.message}`);
          this.log('debug', `Auth error stack: ${authError.stack}`);
          this.log('info', 'Falling back to anonymous connection');
          // Continue with anonymous connection if auth fails
        }
      } else {
        this.log('info', 'No credentials provided, connecting as anonymous Socket.io client');
      }

      // Connect to FoundryVTT's Socket.io server
      this.socket = io(this.foundryUrl, socketOptions);

      this.setupEventHandlers();
      
      // Wait for connection
      const result = await new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          const timeoutError = new Error(`Connection timeout after ${this.requestTimeout}ms`);
          const errorInfo = this.categorizeError(timeoutError);
          this.log('error', `Connection timeout - ${errorInfo.type}`);
          errorInfo.troubleshooting.forEach(hint => this.log('info', `  → ${hint}`));
          reject(timeoutError);
        }, this.requestTimeout);

        this.socket.once('connect', () => {
          clearTimeout(timeout);
          this.isConnected = true;
          this.retryCount = 0;
          this.connectionAttempts = 0; // Reset on successful connection
          this.log('info', '✅ Connected to FoundryVTT Socket.io server');
          this.log('info', `Socket ID: ${this.socket.id}`);
          
          if (this.authenticator && this.authenticator.isAuthenticated) {
            this.log('info', `Connected as authenticated user: ${this.authenticator.userId}`);
          }
          
          this.emit('connected');
          resolve(true);
        });

        this.socket.once('connect_error', (error) => {
          clearTimeout(timeout);
          const errorInfo = this.categorizeError(error);
          this.log('error', `Connection failed - ${errorInfo.type}: ${error.message}`);
          if (error.type) {
            this.log('error', `Error type: ${error.type}`, error.data);
          }
          this.log('info', 'Troubleshooting suggestions:');
          errorInfo.troubleshooting.forEach(hint => this.log('info', `  → ${hint}`));
          reject(error);
        });
      });

      return result;

    } catch (error) {
      const errorInfo = this.categorizeError(error);
      this.log('error', `Failed to connect - ${errorInfo.type}: ${error.message}`);
      this.log('info', 'Troubleshooting suggestions:');
      errorInfo.troubleshooting.forEach(hint => this.log('info', `  → ${hint}`));
      throw error;
    }
  }

  /**
   * Set up socket event handlers
   */
  setupEventHandlers() {
    this.socket.on('disconnect', (reason) => {
      this.log('warn', `Disconnected: ${reason}`);
      this.isConnected = false;
      this.emit('disconnected', reason);
      
      // Track disconnect as error if unexpected
      if (reason === 'transport error' || reason === 'server namespace disconnect') {
        this.categorizeError(new Error(`Disconnected: ${reason}`));
      }
      
      // Reject all pending requests
      for (const { reject } of this.pendingRequests.values()) {
        reject(new Error('Socket disconnected'));
      }
      this.pendingRequests.clear();
    });

    this.socket.on('reconnect', (attemptNumber) => {
      this.log('info', `✅ Reconnected after ${attemptNumber} attempts`);
      this.isConnected = true;
      this.retryCount = 0;
      this.emit('reconnected', attemptNumber);
    });

    this.socket.on('reconnect_error', (error) => {
      const errorInfo = this.categorizeError(error);
      this.log('error', `Reconnection failed - ${errorInfo.type}: ${error.message}`);
      this.emit('reconnect_error', error);
    });

    this.socket.on('connect_error', (error) => {
      const errorInfo = this.categorizeError(error);
      this.log('error', `Connection error - ${errorInfo.type}: ${error.message}`);
      this.retryCount++;
      if (this.retryCount >= this.maxRetries) {
        this.log('error', `Max retries (${this.maxRetries}) exceeded`);
        this.emit('max_retries_exceeded', error);
      }
    });

    // Listen for API responses from FoundryVTT module
    this.socket.on(`${this.namespace}.response`, (data) => {
      this.handleApiResponse(data);
    });

    // Listen for general errors
    this.socket.on('error', (error) => {
      const errorInfo = this.categorizeError(error);
      this.log('error', `Socket error - ${errorInfo.type}:`, error);
      this.emit('error', error);
    });
  }

  /**
   * Handle API response from FoundryVTT module
   */
  handleApiResponse(data) {
    const { requestId, success, result, data: responseData, error, message } = data;
    
    if (!requestId) {
      this.log('warn', 'Received response without requestId:', data);
      return;
    }

    const pendingRequest = this.pendingRequests.get(requestId);
    if (!pendingRequest) {
      this.log('warn', `No pending request found for ID: ${requestId}`);
      return;
    }

    // Remove from pending requests
    this.pendingRequests.delete(requestId);
    clearTimeout(pendingRequest.timeout);

    // Resolve or reject based on response
    if (success) {
      pendingRequest.resolve(responseData || result);
    } else {
      const errorMessage = message || error || 'Unknown error from FoundryVTT';
      const err = new Error(errorMessage);
      err.code = error;
      pendingRequest.reject(err);
    }
  }

  /**
   * Send API request to FoundryVTT module
   */
  async sendRequest(endpoint, options = {}) {
    if (!this.isConnected || !this.socket || !this.socket.connected) {
      throw new Error('Socket not connected');
    }

    const requestId = `req_${++this.requestCounter}_${Date.now()}`;
    
    // Map endpoint to message type
    const type = this.getMessageType(endpoint, options.method);
    
    // Extract route parameters from endpoint
    const routeParams = this.extractRouteParams(endpoint);
    
    const requestData = {
      type,
      requestId,
      auth: {
        apiKey: options.headers?.['x-api-key'] || this.apiKey || process.env.API_KEY
      },
      params: {
        query: options.query || {},
        params: routeParams || {}
      },
      body: options.body || null
    };

    // Create promise for response
    return new Promise((resolve, reject) => {
      // Set up timeout
      const timeout = setTimeout(() => {
        this.pendingRequests.delete(requestId);
        reject(new Error(`Request timeout after ${this.requestTimeout}ms`));
      }, this.requestTimeout);

      // Store pending request
      this.pendingRequests.set(requestId, {
        resolve,
        reject,
        timeout,
        timestamp: Date.now()
      });

      // Send request to FoundryVTT module
      this.socket.emit(this.namespace, requestData);
      
      this.log('debug', `Sent request ${requestId}: ${options.method || 'GET'} ${endpoint}`);
    });
  }

  /**
   * Map endpoint and method to message type
   */
  getMessageType(endpoint, method = 'GET') {
    // Remove /api prefix if present
    const path = endpoint.replace(/^\/api/, '');
    
    // Map common endpoints
    if (path === '/actors' && method === 'GET') return 'actors.search';
    if (path.match(/^\/actors\/[\w-]+$/) && method === 'GET') return 'actors.get';
    if (path === '/items' && method === 'GET') return 'items.search';
    if (path.match(/^\/items\/[\w-]+$/) && method === 'GET') return 'items.get';
    if (path === '/scenes' && method === 'GET') return 'scenes.search';
    // Before the :id pattern, which also matches "current"
    if (path === '/scenes/current' && method === 'GET') return 'scenes.current';
    if (path.match(/^\/scenes\/[\w-]+$/) && method === 'GET') return 'scenes.get';
    if (path === '/dice/roll' && method === 'POST') return 'dice.roll';
    if (path === '/world' && method === 'GET') return 'world.info';
    if (path === '/status' && method === 'GET') return 'status';
    
    // Default mapping
    const resource = path.split('/')[1] || 'unknown';
    const action = method === 'GET' ? 'get' : method.toLowerCase();
    return `${resource}.${action}`;
  }
  
  /**
   * Extract route parameters from endpoint
   */
  extractRouteParams(endpoint) {
    const match = endpoint.match(/\/api\/\w+\/([\w-]+)$/);
    if (match) {
      return { id: match[1] };
    }
    return {};
  }
  
  /**
   * Disconnect from FoundryVTT server
   */
  disconnect() {
    this.log('info', 'Disconnecting from FoundryVTT');
    
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }
    
    this.isConnected = false;
    
    // Clear pending requests
    for (const { timeout, reject } of this.pendingRequests.values()) {
      clearTimeout(timeout);
      reject(new Error('Client disconnected'));
    }
    this.pendingRequests.clear();
  }

  /**
   * Check if connected to FoundryVTT
   */
  getConnectionStatus() {
    return {
      connected: this.isConnected,
      socketId: this.socket?.id || null,
      pendingRequests: this.pendingRequests.size,
      retryCount: this.retryCount
    };
  }

  /**
   * Get health information
   */
  getHealthInfo() {
    return {
      ...this.getConnectionStatus(),
      foundryUrl: this.foundryUrl,
      namespace: this.namespace,
      requestTimeout: this.requestTimeout,
      uptime: this.socket?.connected ? Date.now() - (this.socket.auth?.timestamp || 0) : 0
    };
  }

  /**
   * Get detailed connection diagnostics
   */
  getConnectionDiagnostics() {
    return {
      status: {
        connected: this.isConnected,
        socketId: this.socket?.id || null,
        foundryUrl: this.foundryUrl,
        namespace: this.namespace
      },
      statistics: {
        connectionAttempts: this.connectionAttempts,
        lastConnectionAttempt: this.lastConnectionAttempt,
        retryCount: this.retryCount,
        maxRetries: this.maxRetries,
        pendingRequests: this.pendingRequests.size,
        uptime: this.socket?.connected ? Date.now() - (this.socket.auth?.timestamp || 0) : 0
      },
      lastError: this.lastError,
      errorHistory: this.errorHistory,
      configuration: {
        requestTimeout: this.requestTimeout,
        reconnectDelay: this.reconnectDelay,
        apiKeyConfigured: !!this.apiKey
      }
    };
  }

  /**
   * Get troubleshooting suggestions based on current state
   */
  getTroubleshootingSuggestions() {
    const suggestions = [];
    
    if (!this.isConnected) {
      suggestions.push('Socket is not connected to FoundryVTT');
      
      if (this.lastError) {
        suggestions.push(`Last error: ${this.lastError.type}`);
        suggestions.push(...this.lastError.troubleshooting);
      }
      
      if (this.connectionAttempts > 3) {
        suggestions.push('Multiple connection attempts have failed');
        suggestions.push('Consider checking FoundryVTT logs for more information');
      }
    }
    
    if (this.pendingRequests.size > 5) {
      suggestions.push(`${this.pendingRequests.size} requests are pending - possible performance issue`);
    }
    
    if (this.errorHistory.length > 0) {
      const errorTypes = [...new Set(this.errorHistory.map(e => e.type))];
      suggestions.push(`Recent error types: ${errorTypes.join(', ')}`);
    }
    
    return suggestions;
  }
}