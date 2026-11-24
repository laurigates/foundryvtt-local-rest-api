/**
 * Authentication manager for the Foundry Local REST API v13
 * Handles API key generation and validation with per-user support
 */

export class AuthManager {
  constructor() {
    this.globalApiKey = null;
    this.userKeys = new Map(); // Cache for user-specific keys
  }

  /**
   * Generate a secure API key
   * @param {number} length - Key length in bytes (default 32)
   * @returns {string} Generated API key
   */
  generateApiKey(length = 32) {
    // Generate a cryptographically secure random string
    const array = new Uint8Array(length);
    crypto.getRandomValues(array);

    // Convert to base64 and make URL-safe
    const apiKey = btoa(String.fromCharCode.apply(null, array))
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=/g, '');

    return apiKey;
  }

  /**
   * Generate and store a user-specific API key (v13 feature)
   * @param {User} user - The FoundryVTT user
   * @returns {Promise<string>} Generated API key
   */
  async generateUserApiKey(user) {
    if (!user) {
      throw new Error('User is required to generate user-specific API key');
    }

    const apiKey = this.generateApiKey();
    
    // Store in user flags (persisted in v13)
    await user.setFlag('foundryvtt-local-rest-api', 'apiKey', apiKey);
    await user.setFlag('foundryvtt-local-rest-api', 'apiKeyCreated', Date.now());
    
    // Update cache
    this.userKeys.set(user.id, apiKey);
    
    // Log the generation (audit trail)
    console.log(`Foundry Local REST API | Generated new API key for user: ${user.name}`);
    
    return apiKey;
  }

  /**
   * Revoke a user's API key
   * @param {User} user - The FoundryVTT user
   * @returns {Promise<void>}
   */
  async revokeUserApiKey(user) {
    if (!user) return;

    // Remove from user flags
    await user.unsetFlag('foundryvtt-local-rest-api', 'apiKey');
    await user.unsetFlag('foundryvtt-local-rest-api', 'apiKeyCreated');
    
    // Clear cache
    this.userKeys.delete(user.id);
    
    console.log(`Foundry Local REST API | Revoked API key for user: ${user.name}`);
  }

  /**
   * Get a user's API key from flags
   * @param {User} user - The FoundryVTT user
   * @returns {string|null} User's API key or null
   */
  getUserApiKey(user) {
    if (!user) return null;

    // Check cache first
    if (this.userKeys.has(user.id)) {
      return this.userKeys.get(user.id);
    }

    // Load from user flags (v13 persistent storage)
    const apiKey = user.getFlag('foundryvtt-local-rest-api', 'apiKey');
    if (apiKey) {
      this.userKeys.set(user.id, apiKey);
    }
    
    return apiKey;
  }

  /**
   * Set the global API key (for backward compatibility)
   * @param {string} apiKey - The API key to set
   */
  setApiKey(apiKey) {
    this.globalApiKey = apiKey;
  }

  /**
   * Validate an API key (supports both global and user keys)
   * @param {string} providedKey - The API key to validate
   * @param {string} expectedKey - Expected key (optional, uses global if not provided)
   * @returns {boolean} True if valid, false otherwise
   */
  validateApiKey(providedKey, expectedKey = null) {
    if (!providedKey) {
      return false;
    }

    // If expected key is provided, validate against it
    if (expectedKey) {
      return this.constantTimeEquals(providedKey, expectedKey);
    }

    // Otherwise validate against global key
    if (!this.globalApiKey) {
      return false;
    }

    return this.constantTimeEquals(providedKey, this.globalApiKey);
  }

  /**
   * Validate a user-specific API key
   * @param {string} providedKey - The API key to validate
   * @param {User} user - The user whose key to validate against
   * @returns {boolean} True if valid, false otherwise
   */
  validateUserApiKey(providedKey, user) {
    if (!providedKey || !user) {
      return false;
    }

    const userKey = this.getUserApiKey(user);
    if (!userKey) {
      return false;
    }

    return this.constantTimeEquals(providedKey, userKey);
  }

  /**
   * Constant-time string comparison to prevent timing attacks
   * @param {string} a - First string
   * @param {string} b - Second string
   * @returns {boolean} True if strings are equal
   */
  constantTimeEquals(a, b) {
    if (a.length !== b.length) {
      // Even for different lengths, do some work to prevent timing analysis
      const padding = '0'.repeat(Math.max(a.length, b.length));
      const paddedA = (a + padding).slice(0, padding.length);
      const paddedB = (b + padding).slice(0, padding.length);
      
      let result = 1; // Starts non-zero, so the comparison is always false
      for (let i = 0; i < padding.length; i++) {
        result |= paddedA.charCodeAt(i) ^ paddedB.charCodeAt(i);
      }
      return result === 0;
    }

    let result = 0;
    for (let i = 0; i < a.length; i++) {
      result |= a.charCodeAt(i) ^ b.charCodeAt(i);
    }

    return result === 0;
  }

  /**
   * Get the current global API key
   * @returns {string|null} Current API key or null if not set
   */
  getCurrentApiKey() {
    return this.globalApiKey;
  }

  /**
   * Clear the global API key
   */
  clearApiKey() {
    this.globalApiKey = null;
  }

  /**
   * Get all users with API keys (for admin management)
   * @returns {Array<Object>} Array of users with API key info
   */
  async getUsersWithApiKeys() {
    const users = [];
    
    for (const user of game.users) {
      const apiKey = user.getFlag('foundryvtt-local-rest-api', 'apiKey');
      if (apiKey) {
        const created = user.getFlag('foundryvtt-local-rest-api', 'apiKeyCreated');
        users.push({
          id: user.id,
          name: user.name,
          role: user.role,
          hasApiKey: true,
          created: created ? new Date(created) : null,
          // Don't include the actual key for security
        });
      }
    }
    
    return users;
  }

  /**
   * Rotate API key (generate new, invalidate old)
   * @param {User} user - User whose key to rotate (null for global)
   * @returns {Promise<string>} New API key
   */
  async rotateApiKey(user = null) {
    if (user) {
      // Rotate user key
      const newKey = await this.generateUserApiKey(user);
      
      // Log rotation for audit
      console.log(`Foundry Local REST API | Rotated API key for user: ${user.name}`);
      
      // Optionally notify about the rotation
      if (game.user.isGM) {
        ui.notifications.info(`API key rotated for user: ${user.name}`);
      }
      
      return newKey;
    } else {
      // Rotate global key
      const newKey = this.generateApiKey();
      this.globalApiKey = newKey;
      
      // Store in settings
      await game.settings.set('foundryvtt-local-rest-api', 'api-key', newKey);
      
      console.log('Foundry Local REST API | Rotated global API key');
      
      return newKey;
    }
  }

  /**
   * Check if API key has expired (optional expiration feature)
   * @param {User} user - User to check
   * @param {number} maxAge - Maximum age in milliseconds (default 30 days)
   * @returns {boolean} True if expired
   */
  isApiKeyExpired(user, maxAge = 30 * 24 * 60 * 60 * 1000) {
    const created = user.getFlag('foundryvtt-local-rest-api', 'apiKeyCreated');
    if (!created) return false;
    
    return (Date.now() - created) > maxAge;
  }

  /**
   * Initialize authentication manager with v13 features
   * Called during module initialization
   */
  async initialize() {
    // Load global API key from settings
    const globalKey = game.settings.get('foundryvtt-local-rest-api', 'api-key');
    if (globalKey) {
      this.globalApiKey = globalKey;
    }

    // Preload user keys into cache for performance
    for (const user of game.users) {
      const apiKey = user.getFlag('foundryvtt-local-rest-api', 'apiKey');
      if (apiKey) {
        this.userKeys.set(user.id, apiKey);
      }
    }

    console.log(`Foundry Local REST API | Authentication manager initialized (v13 mode)`);
  }

  /**
   * Create a dedicated API user (inspired by Planeshift pattern)
   * @param {string} name - Name for the API user
   * @returns {Promise<Object>} Created user and API key
   */
  async createApiUser(name = 'API User') {
    if (!game.user.isGM) {
      throw new Error('Only GMs can create API users');
    }

    // Create a new user with Player role
    const userData = {
      name: `${name} (API)`,
      role: 1, // Player role
      password: this.generateApiKey(16), // Random password
      flags: {
        'foundryvtt-local-rest-api': {
          isApiUser: true,
          created: Date.now()
        }
      }
    };

    const user = await User.create(userData);
    
    // Generate API key for this user
    const apiKey = await this.generateUserApiKey(user);
    
    console.log(`Foundry Local REST API | Created dedicated API user: ${user.name}`);
    
    return {
      user,
      apiKey,
      instructions: 'Use this API key with the userId parameter in your requests'
    };
  }
}