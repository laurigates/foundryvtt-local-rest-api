/**
 * Foundry Local REST API Module
 * Provides local HTTP endpoints for external integrations without third-party dependencies
 */

import { AuthManager } from './auth.js';
import { SocketMessageHandler } from './socket-handler.js';
import { SocketBridge } from './socket-bridge.js';

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
      type: ApiConfigurationForm,
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

    // Remove socket listeners
    if (game.socket) {
      game.socket.off(`module.foundryvtt-local-rest-api`);
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

    // Listen for messages on the module namespace
    game.socket.on(`module.foundryvtt-local-rest-api`, async (data) => {
      try {
        const response = await this.socketHandler.handleMessage(data);
        
        // Emit response back to the sender
        game.socket.emit(`module.foundryvtt-local-rest-api.response`, response);
      } catch (error) {
        console.error('Foundry Local REST API | Error handling socket message:', error);
        
        // Send error response
        const errorResponse = {
          requestId: data.requestId,
          success: false,
          error: 'Internal Server Error',
          message: error.message
        };
        
        game.socket.emit(`module.foundryvtt-local-rest-api.response`, errorResponse);
      }
    });

    console.log('Foundry Local REST API | Socket handlers registered');
  }
}

// Initialize when the module loads
Hooks.once('init', () => {
  FoundryLocalRestAPI.initialize();
});

/**
 * Configuration form for API settings
 */
class ApiConfigurationForm extends FormApplication {
  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      id: 'foundryvtt-local-rest-api-config',
      title: game.i18n.localize('foundryvtt-local-rest-api.config.title'),
      template: 'modules/foundryvtt-local-rest-api/templates/api-config.hbs',
      width: 500,
      height: 'auto',
      closeOnSubmit: false,
      submitOnChange: false,
      resizable: true
    });
  }

  getData() {
    const apiKey = game.settings.get('foundryvtt-local-rest-api', 'api-key');
    const isEnabled = game.settings.get('foundryvtt-local-rest-api', 'enable-api');
    
    return {
      apiKey: apiKey || 'No API key generated',
      hasApiKey: !!apiKey,
      isEnabled,
      baseUrl: 'http://localhost:3030/api',
      socketNamespace: 'module.foundryvtt-local-rest-api',
      bridgeInfo: 'Use with bridge server for REST API endpoints'
    };
  }

  activateListeners(html) {
    super.activateListeners(html);
    
    html.find('#copy-api-key').click(this._onCopyApiKey.bind(this));
    html.find('#regenerate-api-key').click(this._onRegenerateApiKey.bind(this));
    html.find('#test-connection').click(this._onTestConnection.bind(this));
  }

  async _onCopyApiKey(event) {
    event.preventDefault();
    const apiKey = game.settings.get('foundryvtt-local-rest-api', 'api-key');
    
    try {
      await navigator.clipboard.writeText(apiKey);
      ui.notifications.info(game.i18n.localize('foundryvtt-local-rest-api.config.api-key-copied'));
    } catch (err) {
      ui.notifications.error(game.i18n.localize('foundryvtt-local-rest-api.config.copy-failed'));
    }
  }

  async _onRegenerateApiKey(event) {
    event.preventDefault();
    
    const confirmed = await foundry.applications.api.DialogV2.confirm({
      window: { title: game.i18n.localize('foundryvtt-local-rest-api.config.regenerate-confirm-title') },
      content: `<p>${game.i18n.localize('foundryvtt-local-rest-api.config.regenerate-confirm-content')}</p>`,
      yes: { label: game.i18n.localize('foundryvtt-local-rest-api.config.regenerate') },
      no: { label: game.i18n.localize('foundryvtt-local-rest-api.config.cancel') }
    });

    if (confirmed) {
      window.foundryLocalRestAPI.generateApiKey();
      this.render();
    }
  }

  async _onTestConnection(event) {
    event.preventDefault();
    const apiKey = game.settings.get('foundryvtt-local-rest-api', 'api-key');
    
    if (!window.foundryLocalRestAPI.isEnabled) {
      ui.notifications.warn('Socket handlers are not enabled. Please enable the API first.');
      return;
    }
    
    try {
      // Test socket communication directly
      const testMessage = {
        type: 'status',
        requestId: foundry.utils.randomID(),
        auth: { apiKey }
      };
      
      // Listen for response
      const responsePromise = new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error('Test timeout'));
        }, 5000);
        
        const responseHandler = (response) => {
          if (response.requestId === testMessage.requestId) {
            clearTimeout(timeout);
            game.socket.off(`module.foundryvtt-local-rest-api.response`, responseHandler);
            resolve(response);
          }
        };
        
        game.socket.on(`module.foundryvtt-local-rest-api.response`, responseHandler);
      });
      
      // Send test message
      game.socket.emit(`module.foundryvtt-local-rest-api`, testMessage);
      
      // Wait for response
      const response = await responsePromise;
      
      if (response.success) {
        ui.notifications.info(game.i18n.format('foundryvtt-local-rest-api.config.test-success', { 
          status: response.data.status, 
          version: response.data.version 
        }));
      } else {
        ui.notifications.error(game.i18n.format('foundryvtt-local-rest-api.config.test-failed', { 
          error: response.error 
        }));
      }
    } catch (error) {
      ui.notifications.error(game.i18n.format('foundryvtt-local-rest-api.config.test-error', { 
        error: error.message 
      }));
    }
  }

  async _updateObject(event, formData) {
    // This form is read-only, no updates needed
  }
}

// Export for external access
export { FoundryLocalRestAPI, ApiConfigurationForm };
