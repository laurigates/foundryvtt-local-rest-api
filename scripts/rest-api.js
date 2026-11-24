/**
 * Foundry Local REST API Module
 * Provides local HTTP endpoints for external integrations without third-party dependencies
 */

import { AuthManager } from './auth.js';
import { SocketMessageHandler } from './socket-handler.js';
import { SocketBridge } from './socket-bridge.js';
import { createApiConfigApp } from './api-config-app.js';
import {
  SOCKET_NAME,
  isResponseMessage,
  shouldHandleRequest,
  responseEmitArgs
} from './socket-routing.js';

class FoundryLocalRestAPI {
  constructor() {
    this.authManager = new AuthManager();
    this.socketHandler = new SocketMessageHandler();
    this.socketBridge = new SocketBridge();
    this.isEnabled = false;
  }

  /**
   * Initialize the REST API module
   */
  static initialize() {
    console.log('Foundry Local REST API | Initializing module');

    // Create global instance
    window.foundryLocalRestAPI = new FoundryLocalRestAPI();

    // Register module settings
    window.foundryLocalRestAPI.registerSettings();

    // Start API server if enabled
    Hooks.once('ready', () => {
      window.foundryLocalRestAPI.onReady();
    });
  }

  /**
   * Register module settings
   */
  registerSettings() {
    game.settings.register('foundryvtt-local-rest-api', 'enable-api', {
      name: game.i18n.localize('foundryvtt-local-rest-api.settings.enable-api.name'),
      hint: game.i18n.localize('foundryvtt-local-rest-api.settings.enable-api.hint'),
      scope: 'world',
      config: true,
      type: Boolean,
      default: false,
      onChange: (value) => {
        if (value) {
          this.enableSocketHandlers();
        } else {
          this.disableSocketHandlers();
        }
      }
    });

    game.settings.register('foundryvtt-local-rest-api', 'api-key', {
      name: game.i18n.localize('foundryvtt-local-rest-api.settings.api-key.name'),
      hint: game.i18n.localize('foundryvtt-local-rest-api.settings.api-key.hint'),
      scope: 'world',
      config: false,
      type: String,
      default: '',
      onChange: (value) => {
        this.authManager.setApiKey(value);
        this.socketHandler.setApiKey(value);
      }
    });

    game.settings.register('foundryvtt-local-rest-api', 'log-requests', {
      name: game.i18n.localize('foundryvtt-local-rest-api.settings.log-requests.name'),
      hint: game.i18n.localize('foundryvtt-local-rest-api.settings.log-requests.hint'),
      scope: 'world',
      config: true,
      type: Boolean,
      default: false
    });

    game.settings.registerMenu('foundryvtt-local-rest-api', 'api-config', {
      name: game.i18n.localize('foundryvtt-local-rest-api.settings.api-config.name'),
      hint: game.i18n.localize('foundryvtt-local-rest-api.settings.api-config.hint'),
      icon: 'fas fa-key',
      type: createApiConfigApp(foundry.applications.api),
      restricted: true
    });
  }

  /**
   * Called when FoundryVTT is ready
   */
  onReady() {
    console.log('Foundry Local REST API | FoundryVTT ready');

    // Initialize auth manager
    const apiKey = game.settings.get('foundryvtt-local-rest-api', 'api-key');
    this.authManager.setApiKey(apiKey);
    this.socketHandler.setApiKey(apiKey);

    // Generate API key if none exists
    if (!apiKey) {
      this.generateApiKey();
    }

    // Enable socket handlers if enabled
    const isEnabled = game.settings.get('foundryvtt-local-rest-api', 'enable-api');
    if (isEnabled) {
      this.enableSocketHandlers();
    }
  }

  /**
   * Generate a new API key
   */
  generateApiKey() {
    const apiKey = this.authManager.generateApiKey();
    game.settings.set('foundryvtt-local-rest-api', 'api-key', apiKey);
    this.socketHandler.setApiKey(apiKey);

    ui.notifications.info(
      game.i18n.format('foundryvtt-local-rest-api.notifications.api-key-generated', { key: apiKey })
    );

    console.log('Foundry Local REST API | Generated new API key:', apiKey);
  }

  /**
   * Enable socket message handlers
   */
  enableSocketHandlers() {
    if (this.isEnabled) {
      console.log('Foundry Local REST API | Socket handlers already enabled');
      return;
    }

    console.log('Foundry Local REST API | Enabling socket handlers...');

    try {
      // Only setup the socket handlers once - no bridge needed
      this.setupSocketHandlers();
      
      this.isEnabled = true;

      ui.notifications.info(
        game.i18n.localize('foundryvtt-local-rest-api.notifications.api-enabled')
      );

      console.log('Foundry Local REST API | Socket handlers enabled');
    } catch (error) {
      console.error('Foundry Local REST API | Failed to enable socket handlers:', error);
      ui.notifications.error('Failed to enable REST API socket handlers');
    }
  }

  /**
   * Disable socket message handlers
   */
  disableSocketHandlers() {
    if (!this.isEnabled) {
      console.log('Foundry Local REST API | Socket handlers not enabled');
      return;
    }

    console.log('Foundry Local REST API | Disabling socket handlers...');
    this.isEnabled = false;

    // Remove our socket listener
    if (game.socket && this.socketListener) {
      game.socket.off(SOCKET_NAME, this.socketListener);
      this.socketListener = null;
    }

    ui.notifications.info(
      game.i18n.localize('foundryvtt-local-rest-api.notifications.api-disabled')
    );
  }

  /**
   * Setup socket message handlers
   */
  setupSocketHandlers() {
    if (!game.socket) {
      throw new Error('Game socket not available');
    }

    this.socketListener = (data, senderId) => this.onSocketMessage(data, senderId);
    game.socket.on(SOCKET_NAME, this.socketListener);

    console.log('Foundry Local REST API | Socket handlers registered');
  }

  /**
   * Answer one request received on the module socket.
   *
   * Responses go back on the same event (the server relays no other), only
   * to the sender, and only from the designated active GM so that one client
   * answers each request.
   *
   * @param {object} data       The message
   * @param {string} [senderId] The sending user's id, passed by Foundry's server
   */
  async onSocketMessage(data, senderId) {
    if (isResponseMessage(data)) return;
    if (!shouldHandleRequest(game.users, senderId)) return;

    let response;
    try {
      response = await this.socketHandler.handleMessage(data);
    } catch (error) {
      console.error('Foundry Local REST API | Error handling socket message:', error);
      response = {
        requestId: data?.requestId,
        success: false,
        error: 'Internal Server Error',
        message: error.message
      };
    }
    game.socket.emit(...responseEmitArgs(response, senderId));
  }
}

// Initialize when the module loads
Hooks.once('init', () => {
  FoundryLocalRestAPI.initialize();
});

// Export for external access
export { FoundryLocalRestAPI };
