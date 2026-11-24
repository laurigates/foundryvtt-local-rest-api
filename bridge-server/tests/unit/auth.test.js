import { jest } from '@jest/globals';
import { AuthManager } from '../../lib/auth.js';

describe('AuthManager', () => {
  let authManager;
  const validApiKey = 'test-valid-api-key-123456789';
  
  beforeEach(() => {
    process.env.API_KEY = validApiKey;
    authManager = new AuthManager();
  });
  
  afterEach(() => {
    jest.clearAllMocks();
  });
  
  describe('constructor', () => {
    test('should initialize with API key from environment', () => {
      expect(authManager.apiKey).toBe(validApiKey);
    });
    
    test('should throw error if API_KEY is not set', () => {
      delete process.env.API_KEY;
      expect(() => new AuthManager()).toThrow('API_KEY environment variable is required');
    });
  });
  
  describe('validateApiKey', () => {
    test('should return true for valid API key', () => {
      const result = authManager.validateApiKey(validApiKey);
      expect(result).toBe(true);
    });
    
    test('should return false for invalid API key', () => {
      const result = authManager.validateApiKey('invalid-key');
      expect(result).toBe(false);
    });
    
    test('should return false for undefined key', () => {
      const result = authManager.validateApiKey(undefined);
      expect(result).toBe(false);
    });
    
    test('should return false for empty string', () => {
      const result = authManager.validateApiKey('');
      expect(result).toBe(false);
    });
    
    test('should use constant-time comparison to prevent timing attacks', () => {
      // This test verifies the implementation uses constant-time comparison
      // We'll spy on the comparison method to ensure it's called
      const spy = jest.spyOn(authManager, 'constantTimeCompare');
      authManager.validateApiKey('some-key');
      expect(spy).toHaveBeenCalled();
    });
  });
  
  describe('authenticate middleware', () => {
    let req, res, next;
    
    beforeEach(() => {
      req = {
        headers: {}
      };
      res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn()
      };
      next = jest.fn();
    });
    
    test('should call next() with valid API key in x-api-key header', () => {
      req.headers['x-api-key'] = validApiKey;
      authManager.authenticate(req, res, next);
      expect(next).toHaveBeenCalled();
      expect(res.status).not.toHaveBeenCalled();
    });
    
    test('should call next() with valid API key in Authorization Bearer header', () => {
      req.headers.authorization = `Bearer ${validApiKey}`;
      authManager.authenticate(req, res, next);
      expect(next).toHaveBeenCalled();
      expect(res.status).not.toHaveBeenCalled();
    });
    
    test('should return 401 with missing API key', () => {
      authManager.authenticate(req, res, next);
      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Unauthorized',
        message: 'Valid API key required'
      });
      expect(next).not.toHaveBeenCalled();
    });
    
    test('should return 401 with invalid API key', () => {
      req.headers['x-api-key'] = 'invalid-key';
      authManager.authenticate(req, res, next);
      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Unauthorized',
        message: 'Valid API key required'
      });
      expect(next).not.toHaveBeenCalled();
    });
    
    test('should handle malformed Authorization header gracefully', () => {
      req.headers.authorization = 'InvalidFormat';
      authManager.authenticate(req, res, next);
      expect(res.status).toHaveBeenCalledWith(401);
      expect(next).not.toHaveBeenCalled();
    });
  });
  
  describe('constantTimeCompare', () => {
    test('should return true for identical strings', () => {
      const result = authManager.constantTimeCompare('test123', 'test123');
      expect(result).toBe(true);
    });
    
    test('should return false for different strings', () => {
      const result = authManager.constantTimeCompare('test123', 'test456');
      expect(result).toBe(false);
    });
    
    test('should return false for different length strings', () => {
      const result = authManager.constantTimeCompare('short', 'muchlongerstring');
      expect(result).toBe(false);
    });
    
    test('should handle special characters', () => {
      const specialKey = 'key-with-!@#$%^&*()_+';
      const result = authManager.constantTimeCompare(specialKey, specialKey);
      expect(result).toBe(true);
    });
  });
});