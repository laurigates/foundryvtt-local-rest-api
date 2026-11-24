/**
 * Socket Bridge - Simplified to avoid conflicts
 * This is no longer needed since we handle everything in rest-api.js
 */

export class SocketBridge {
  constructor() {
    this.isInitialized = false;
  }

  /**
   * Initialize method kept for compatibility but does nothing
   * All socket handling is done in rest-api.js to avoid conflicts
   */
  initialize() {
    if (this.isInitialized) {
      return;
    }

    console.log('Foundry Local REST API | Socket bridge skipped (handled by main module)');
    this.isInitialized = true;
  }
}
