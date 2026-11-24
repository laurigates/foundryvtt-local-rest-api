/**
 * API configuration window (ApplicationV2).
 *
 * AppV1 (`FormApplication`) is deprecated since v13 and slated for removal in
 * v16, so the settings menu uses `HandlebarsApplicationMixin(ApplicationV2)`.
 * The class is built by a factory so it can be created after Foundry's
 * globals exist, and tested with doubles of the two base classes.
 */

import { MODULE_ID, SOCKET_NAME } from './socket-routing.js';

const TEMPLATE = `modules/${MODULE_ID}/templates/api-config.hbs`;

/**
 * @param {object} api  `foundry.applications.api` (ApplicationV2, HandlebarsApplicationMixin, DialogV2)
 * @returns {typeof object} The ApiConfigurationForm class
 */
export function createApiConfigApp(api) {
  const { ApplicationV2, HandlebarsApplicationMixin, DialogV2 } = api;

  return class ApiConfigurationForm extends HandlebarsApplicationMixin(ApplicationV2) {
    static DEFAULT_OPTIONS = {
      id: `${MODULE_ID}-config`,
      classes: [`${MODULE_ID}-config`],
      window: {
        title: `${MODULE_ID}.config.title`,
        icon: 'fas fa-key',
        resizable: true
      },
      position: { width: 500, height: 'auto' },
      actions: {
        copyApiKey: ApiConfigurationForm.onCopyApiKey,
        regenerateApiKey: ApiConfigurationForm.onRegenerateApiKey,
        testConnection: ApiConfigurationForm.onTestConnection
      }
    };

    static PARTS = {
      form: { template: TEMPLATE }
    };

    /** @override */
    async _prepareContext(_options) {
      const apiKey = game.settings.get(MODULE_ID, 'api-key');
      const isEnabled = game.settings.get(MODULE_ID, 'enable-api');
      return {
        apiKey: apiKey || 'No API key generated',
        hasApiKey: !!apiKey,
        isEnabled,
        baseUrl: 'http://localhost:3030/api',
        socketNamespace: SOCKET_NAME,
        bridgeInfo: 'Use with bridge server for REST API endpoints'
      };
    }

    /** Action handler; `this` is the application instance. */
    static async onCopyApiKey(_event, _target) {
      const apiKey = game.settings.get(MODULE_ID, 'api-key');
      try {
        await navigator.clipboard.writeText(apiKey);
        ui.notifications.info(game.i18n.localize(`${MODULE_ID}.config.api-key-copied`));
      } catch {
        ui.notifications.error(game.i18n.localize(`${MODULE_ID}.config.copy-failed`));
      }
    }

    /** Action handler; `this` is the application instance. */
    static async onRegenerateApiKey(_event, _target) {
      const confirmed = await DialogV2.confirm({
        window: { title: game.i18n.localize(`${MODULE_ID}.config.regenerate-confirm-title`) },
        content: `<p>${game.i18n.localize(`${MODULE_ID}.config.regenerate-confirm-content`)}</p>`,
        yes: { label: game.i18n.localize(`${MODULE_ID}.config.regenerate`) },
        no: { label: game.i18n.localize(`${MODULE_ID}.config.cancel`) }
      });
      if (confirmed) {
        window.foundryLocalRestAPI.generateApiKey();
        this.render();
      }
    }

    /**
     * Action handler; `this` is the application instance.
     *
     * Runs a status request through the local message handler. A socket
     * round-trip cannot be tested from here: Foundry never delivers a client's
     * own module message back to it.
     */
    static async onTestConnection(_event, _target) {
      const restApi = window.foundryLocalRestAPI;
      if (!restApi?.isEnabled) {
        ui.notifications.warn('Socket handlers are not enabled. Please enable the API first.');
        return;
      }
      try {
        const response = await restApi.socketHandler.handleMessage({
          type: 'status',
          requestId: foundry.utils.randomID()
        });
        if (response.success) {
          ui.notifications.info(game.i18n.format(`${MODULE_ID}.config.test-success`, {
            status: response.data.status,
            version: response.data.version
          }));
        } else {
          ui.notifications.error(game.i18n.format(`${MODULE_ID}.config.test-failed`, {
            status: response.error
          }));
        }
      } catch (error) {
        ui.notifications.error(game.i18n.format(`${MODULE_ID}.config.test-error`, {
          error: error.message
        }));
      }
    }
  };
}
