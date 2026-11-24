/**
 * Authentication middleware for the bridge server
 * Validates API keys using the same logic as the FoundryVTT module
 */

export class AuthManager {
  constructor(apiKey) {
    // If no apiKey provided, get from environment
    if (!apiKey && !process.env.API_KEY) {
      throw new Error('API_KEY environment variable is required');
    }
    this.apiKey = apiKey || process.env.API_KEY;
  }

  /**
   * Update the API key
   */
  setApiKey(apiKey) {
    this.apiKey = apiKey;
  }

  /**
   * Express middleware for API key authentication
   */
  authenticate = (req, res, next) => {
    // Skip authentication for status endpoint
    if (req.path === '/api/status') {
      return next();
    }

    // Extract API key from headers
    const providedKey = this.extractApiKey(req);

    if (!providedKey) {
      return res.status(401).json({
        success: false,
        error: 'Unauthorized',
        message: 'Valid API key required'
      });
    }

    // Validate API key
    if (!this.validateApiKey(providedKey)) {
      return res.status(401).json({
        success: false,
        error: 'Unauthorized',
        message: 'Valid API key required'
      });
    }

    // Add API key to request for forwarding
    req.apiKey = providedKey;
    next();
  };

  /**
   * Extract API key from request headers
   */
  extractApiKey(req) {
    // Try x-api-key header first
    let apiKey = req.headers['x-api-key'];

    if (!apiKey) {
      // Try Authorization header with Bearer token
      const authHeader = req.headers['authorization'];
      if (authHeader && authHeader.startsWith('Bearer ')) {
        apiKey = authHeader.substring(7); // Remove 'Bearer ' prefix
      }
    }

    return apiKey;
  }

  /**
   * Validate API key (same logic as FoundryVTT module)
   */
  validateApiKey(providedKey) {
    if (!providedKey || !this.apiKey) {
      return false;
    }

    // Use constant-time comparison to prevent timing attacks
    return this.constantTimeCompare(providedKey, this.apiKey);
  }

  /**
   * Constant-time string comparison to prevent timing attacks
   * Same implementation as FoundryVTT module auth.js
   */
  constantTimeEquals(a, b) {
    if (a.length !== b.length) {
      return false;
    }

    let result = 0;
    for (let i = 0; i < a.length; i++) {
      result |= a.charCodeAt(i) ^ b.charCodeAt(i);
    }

    return result === 0;
  }

  /**
   * Alias for constantTimeEquals for test compatibility
   */
  constantTimeCompare(a, b) {
    return this.constantTimeEquals(a, b);
  }

  /**
   * Get current API key (masked for logging)
   */
  getCurrentApiKey() {
    if (!this.apiKey) {
      return null;
    }

    // Return first 8 and last 4 characters with asterisks
    if (this.apiKey.length <= 12) {
      return '*'.repeat(this.apiKey.length);
    }

    return (
      this.apiKey.substring(0, 8) +
      '*'.repeat(this.apiKey.length - 12) +
      this.apiKey.substring(this.apiKey.length - 4)
    );
  }
}
