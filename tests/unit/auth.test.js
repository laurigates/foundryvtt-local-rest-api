/**
 * Unit tests for the FoundryVTT Module AuthManager
 * Tests browser-side authentication functionality
 */

import { AuthManager } from '../../scripts/auth.js';

describe('FoundryVTT Module AuthManager', () => {
  let authManager;
  let mockCrypto;
  
  beforeEach(() => {
    // Reset the auth manager
    authManager = new AuthManager();
    
    // Mock crypto.getRandomValues for consistent testing
    mockCrypto = {
      getRandomValues: jest.fn()
    };
    global.crypto = mockCrypto;
    
    // Mock btoa for base64 encoding
    global.btoa = jest.fn((str) => Buffer.from(str, 'binary').toString('base64'));
  });
  
  afterEach(() => {
    jest.clearAllMocks();
  });
  
  describe('constructor', () => {
    test('should initialize with null API key', () => {
      expect(authManager.getCurrentApiKey()).toBeNull();
    });
    
    test('should create a new instance', () => {
      expect(authManager).toBeInstanceOf(AuthManager);
    });
  });
  
  describe('generateApiKey', () => {
    beforeEach(() => {
      // Mock crypto.getRandomValues to return predictable values
      const mockArray = new Uint8Array(32);
      for (let i = 0; i < 32; i++) {
        mockArray[i] = i + 1; // Sequential values for predictable testing
      }
      mockCrypto.getRandomValues.mockImplementation((array) => {
        for (let i = 0; i < array.length; i++) {
          array[i] = mockArray[i];
        }
        return array;
      });
      
      // Mock btoa to return predictable base64
      global.btoa = jest.fn(() => 'MockedBase64String+/=test');
    });
    
    test('should generate a cryptographically secure API key', () => {
      // Mock the specific instance used by AuthManager
      const mockGetRandomValues = jest.spyOn(global.crypto, 'getRandomValues');
      
      const apiKey = authManager.generateApiKey();
      
      expect(mockGetRandomValues).toHaveBeenCalledWith(expect.any(Uint8Array));
      expect(mockGetRandomValues).toHaveBeenCalledTimes(1);
      
      const calledArray = mockGetRandomValues.mock.calls[0][0];
      expect(calledArray).toHaveLength(32);
      
      mockGetRandomValues.mockRestore();
    });
    
    test('should return URL-safe base64 string', () => {
      const apiKey = authManager.generateApiKey();
      
      // Should call btoa for base64 encoding
      expect(global.btoa).toHaveBeenCalledTimes(1);
      
      // Should return processed string (+ replaced with -, / with _, = removed)
      expect(apiKey).toBe('MockedBase64String-_test');
      expect(apiKey).not.toContain('+');
      expect(apiKey).not.toContain('/');
      expect(apiKey).not.toContain('=');
    });
    
    test('should not store the generated key', () => {
      // generateApiKey only produces a key; it is also used for one-off
      // values such as API-user passwords. The key becomes active through
      // setApiKey (rotateApiKey, or the api-key setting's onChange).
      authManager.setApiKey('existing-key');
      const apiKey = authManager.generateApiKey();
      
      expect(apiKey).toBe('MockedBase64String-_test');
      expect(authManager.getCurrentApiKey()).toBe('existing-key');
    });
    
    test('should generate different keys on subsequent calls', () => {
      // Set up different mock values for second call
      let callCount = 0;
      mockCrypto.getRandomValues.mockImplementation((array) => {
        for (let i = 0; i < array.length; i++) {
          array[i] = callCount * 10 + i + 1; // Different values per call
        }
        callCount++;
        return array;
      });
      
      global.btoa = jest.fn()
        .mockReturnValueOnce('FirstKey+/=')
        .mockReturnValueOnce('SecondKey+/=');
      
      const firstKey = authManager.generateApiKey();
      const secondKey = authManager.generateApiKey();
      
      expect(firstKey).toBe('FirstKey-_');
      expect(secondKey).toBe('SecondKey-_');
      expect(firstKey).not.toBe(secondKey);
    });
    
    test('should handle crypto.getRandomValues with actual random values', () => {
      // Use real crypto implementation
      global.crypto = {
        getRandomValues: (array) => {
          for (let i = 0; i < array.length; i++) {
            array[i] = Math.floor(Math.random() * 256);
          }
          return array;
        }
      };
      
      global.btoa = (str) => Buffer.from(str, 'binary').toString('base64');
      
      const apiKey = authManager.generateApiKey();
      
      expect(apiKey).toBeDefined();
      expect(typeof apiKey).toBe('string');
      expect(apiKey.length).toBeGreaterThan(0);
      expect(apiKey).not.toContain('+');
      expect(apiKey).not.toContain('/');
      expect(apiKey).not.toContain('=');
    });
  });
  
  describe('setApiKey', () => {
    test('should set the current API key', () => {
      const testKey = 'test-api-key-12345';
      
      authManager.setApiKey(testKey);
      
      expect(authManager.getCurrentApiKey()).toBe(testKey);
      expect(authManager.getCurrentApiKey()).toBe(testKey);
    });
    
    test('should update existing API key', () => {
      authManager.setApiKey('first-key');
      expect(authManager.getCurrentApiKey()).toBe('first-key');
      
      authManager.setApiKey('second-key');
      expect(authManager.getCurrentApiKey()).toBe('second-key');
    });
    
    test('should handle null values', () => {
      authManager.setApiKey('initial-key');
      authManager.setApiKey(null);
      
      expect(authManager.getCurrentApiKey()).toBeNull();
    });
    
    test('should handle empty string', () => {
      authManager.setApiKey('');
      
      expect(authManager.getCurrentApiKey()).toBe('');
    });
  });
  
  describe('validateApiKey', () => {
    beforeEach(() => {
      authManager.setApiKey('valid-test-key-123456789');
    });
    
    test('should return true for valid API key', () => {
      const result = authManager.validateApiKey('valid-test-key-123456789');
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
    
    test('should return false for null key', () => {
      const result = authManager.validateApiKey(null);
      expect(result).toBe(false);
    });
    
    test('should return false for empty string', () => {
      const result = authManager.validateApiKey('');
      expect(result).toBe(false);
    });
    
    test('should return false when no currentApiKey is set', () => {
      authManager.clearApiKey();
      const result = authManager.validateApiKey('any-key');
      expect(result).toBe(false);
    });
    
    test('should return false when currentApiKey is null', () => {
      authManager.setApiKey(null);
      const result = authManager.validateApiKey('any-key');
      expect(result).toBe(false);
    });
    
    test('should use constant-time comparison', () => {
      // Spy on the constantTimeEquals method
      const spy = jest.spyOn(authManager, 'constantTimeEquals');
      
      authManager.validateApiKey('test-key');
      
      expect(spy).toHaveBeenCalledWith('test-key', 'valid-test-key-123456789');
      expect(spy).toHaveBeenCalledTimes(1);
    });
    
    test('should handle special characters in API key', () => {
      const specialKey = 'key-with-!@#$%^&*()_+-=[]{}|;:,.<>?';
      authManager.setApiKey(specialKey);
      
      const result = authManager.validateApiKey(specialKey);
      expect(result).toBe(true);
    });
    
    test('should be case-sensitive', () => {
      authManager.setApiKey('CaseSensitiveKey');
      
      expect(authManager.validateApiKey('CaseSensitiveKey')).toBe(true);
      expect(authManager.validateApiKey('casesensitivekey')).toBe(false);
      expect(authManager.validateApiKey('CASESENSITIVEKEY')).toBe(false);
    });
  });
  
  describe('constantTimeEquals', () => {
    test('should return true for identical strings', () => {
      const result = authManager.constantTimeEquals('test123', 'test123');
      expect(result).toBe(true);
    });
    
    test('should return false for different strings of same length', () => {
      const result = authManager.constantTimeEquals('test123', 'test456');
      expect(result).toBe(false);
    });
    
    test('should return false for different length strings', () => {
      const result = authManager.constantTimeEquals('short', 'verylongstring');
      expect(result).toBe(false);
    });
    
    test('should return false when first string is longer', () => {
      const result = authManager.constantTimeEquals('verylongstring', 'short');
      expect(result).toBe(false);
    });
    
    test('should handle empty strings', () => {
      expect(authManager.constantTimeEquals('', '')).toBe(true);
      expect(authManager.constantTimeEquals('', 'nonempty')).toBe(false);
      expect(authManager.constantTimeEquals('nonempty', '')).toBe(false);
    });
    
    test('should handle special characters', () => {
      const specialString = '!@#$%^&*()_+-=[]{}|;:,.<>?';
      const result = authManager.constantTimeEquals(specialString, specialString);
      expect(result).toBe(true);
    });
    
    test('should handle Unicode characters', () => {
      const unicodeString = '测试🔑密钥';
      const result = authManager.constantTimeEquals(unicodeString, unicodeString);
      expect(result).toBe(true);
    });
    
    test('should implement constant-time algorithm correctly', () => {
      // Test that the XOR-based comparison works for various cases
      const testCases = [
        ['abc', 'abc', true],
        ['abc', 'abd', false],
        ['abc', 'xyz', false],
        ['000', '000', true],
        ['000', '001', false],
        ['AAA', 'aaa', false], // Case sensitivity
        ['123', '123', true],
        ['123', '124', false]
      ];
      
      testCases.forEach(([a, b, expected]) => {
        expect(authManager.constantTimeEquals(a, b)).toBe(expected);
      });
    });
    
    test('should use XOR operation for comparison', () => {
      // Create spy on charCodeAt to verify XOR logic
      const originalCharCodeAt = String.prototype.charCodeAt;
      const charCodeAtSpy = jest.spyOn(String.prototype, 'charCodeAt');
      
      authManager.constantTimeEquals('ab', 'ac');
      
      // Should call charCodeAt for each character in both strings
      expect(charCodeAtSpy).toHaveBeenCalledTimes(4); // 2 chars × 2 strings
      
      charCodeAtSpy.mockRestore();
    });
  });
  
  describe('getCurrentApiKey', () => {
    test('should return null when no key is set', () => {
      expect(authManager.getCurrentApiKey()).toBeNull();
    });
    
    test('should return the current API key', () => {
      const testKey = 'current-test-key';
      authManager.setApiKey(testKey);
      
      expect(authManager.getCurrentApiKey()).toBe(testKey);
    });
    
    test('should return a generated key once it is set', () => {
      global.btoa = jest.fn(() => 'GeneratedKey+/=test');
      
      const generatedKey = authManager.generateApiKey();
      expect(authManager.getCurrentApiKey()).toBeNull();
      
      authManager.setApiKey(generatedKey);
      expect(authManager.getCurrentApiKey()).toBe(generatedKey);
      expect(authManager.getCurrentApiKey()).toBe('GeneratedKey-_test');
    });
  });
  
  describe('clearApiKey', () => {
    test('should set currentApiKey to null', () => {
      authManager.setApiKey('some-key');
      expect(authManager.getCurrentApiKey()).toBe('some-key');
      
      authManager.clearApiKey();
      
      expect(authManager.getCurrentApiKey()).toBeNull();
      expect(authManager.getCurrentApiKey()).toBeNull();
    });
    
    test('should work when no key is set', () => {
      expect(() => authManager.clearApiKey()).not.toThrow();
      expect(authManager.getCurrentApiKey()).toBeNull();
    });
    
    test('should prevent validation after clearing', () => {
      authManager.setApiKey('test-key');
      expect(authManager.validateApiKey('test-key')).toBe(true);
      
      authManager.clearApiKey();
      expect(authManager.validateApiKey('test-key')).toBe(false);
    });
  });
  
  describe('integration scenarios', () => {
    test('should handle complete workflow: generate, validate, clear', () => {
      // Mock for predictable generation
      global.btoa = jest.fn(() => 'WorkflowKey+/=');
      mockCrypto.getRandomValues.mockImplementation((array) => {
        for (let i = 0; i < array.length; i++) {
          array[i] = 100 + i;
        }
        return array;
      });
      
      // Generate key and activate it
      const generatedKey = authManager.generateApiKey();
      expect(generatedKey).toBe('WorkflowKey-_');
      authManager.setApiKey(generatedKey);
      
      // Validate generated key
      expect(authManager.validateApiKey(generatedKey)).toBe(true);
      expect(authManager.validateApiKey('wrong-key')).toBe(false);
      
      // Clear key
      authManager.clearApiKey();
      expect(authManager.validateApiKey(generatedKey)).toBe(false);
    });
    
    test('should handle multiple key generations and updates', () => {
      global.btoa = jest.fn()
        .mockReturnValueOnce('Key1+/=')
        .mockReturnValueOnce('Key2+/=')
        .mockReturnValueOnce('Key3+/=');
      
      const key1 = authManager.generateApiKey();
      expect(key1).toBe('Key1-_');
      authManager.setApiKey(key1);
      expect(authManager.validateApiKey(key1)).toBe(true);
      
      const key2 = authManager.generateApiKey();
      expect(key2).toBe('Key2-_');
      authManager.setApiKey(key2);
      expect(authManager.validateApiKey(key2)).toBe(true);
      expect(authManager.validateApiKey(key1)).toBe(false); // Old key invalid
      
      authManager.setApiKey('custom-key');
      expect(authManager.validateApiKey('custom-key')).toBe(true);
      expect(authManager.validateApiKey(key2)).toBe(false); // Generated key invalid
    });
    
    test('should handle edge cases in validation', () => {
      authManager.setApiKey('edge-case-key');
      
      // Test various falsy values
      expect(authManager.validateApiKey(false)).toBe(false);
      expect(authManager.validateApiKey(0)).toBe(false);
      expect(authManager.validateApiKey(NaN)).toBe(false);
      expect(authManager.validateApiKey({})).toBe(false);
      expect(authManager.validateApiKey([])).toBe(false);
    });
  });
  
  describe('security considerations', () => {
    test('should use cryptographically secure random generation', () => {
      const mockGetRandomValues = jest.spyOn(global.crypto, 'getRandomValues');
      
      const apiKey = authManager.generateApiKey();
      
      // Verify crypto.getRandomValues was used
      expect(mockGetRandomValues).toHaveBeenCalledWith(expect.any(Uint8Array));
      
      // Verify 32-byte array (256-bit security)
      const calledArray = mockGetRandomValues.mock.calls[0][0];
      expect(calledArray.length).toBe(32);
      
      mockGetRandomValues.mockRestore();
    });
    
    test('should prevent timing attacks with constant-time comparison', () => {
      authManager.setApiKey('a'.repeat(50)); // Long key for timing test
      
      const spy = jest.spyOn(authManager, 'constantTimeEquals');
      
      // Test with keys of same length (timing attack scenario)
      authManager.validateApiKey('b'.repeat(50));
      authManager.validateApiKey('c'.repeat(50));
      
      expect(spy).toHaveBeenCalledTimes(2);
      
      // Verify that both calls use the same comparison method
      expect(spy.mock.calls[0]).toEqual(['b'.repeat(50), 'a'.repeat(50)]);
      expect(spy.mock.calls[1]).toEqual(['c'.repeat(50), 'a'.repeat(50)]);
    });
    
    test('should create URL-safe API keys', () => {
      // Test multiple generations to ensure consistent URL-safe format
      global.btoa = jest.fn()
        .mockReturnValueOnce('Test+Key/With=Padding')
        .mockReturnValueOnce('Another+Test/Key==')
        .mockReturnValueOnce('Final+Key/Test===');
      
      const keys = [
        authManager.generateApiKey(),
        authManager.generateApiKey(), 
        authManager.generateApiKey()
      ];
      
      keys.forEach(key => {
        expect(key).not.toMatch(/[+/=]/); // No unsafe URL characters
        expect(key).toMatch(/^[A-Za-z0-9_-]+$/); // Only URL-safe characters
      });
      
      expect(keys[0]).toBe('Test-Key_WithPadding');
      expect(keys[1]).toBe('Another-Test_Key');
      expect(keys[2]).toBe('Final-Key_Test');
    });
  });
  
  describe('error handling', () => {
    test('should handle crypto API unavailability gracefully', () => {
      // Test what happens if crypto is not available
      const originalCrypto = global.crypto;
      delete global.crypto;
      
      expect(() => authManager.generateApiKey()).toThrow(/crypto is not defined|Cannot read properties of undefined/);
      
      // Restore crypto for other tests
      global.crypto = originalCrypto;
    });
    
    test('should handle btoa unavailability gracefully', () => {
      global.btoa = undefined;
      
      expect(() => authManager.generateApiKey()).toThrow();
    });
    
    test('should handle non-string inputs to validation', () => {
      authManager.setApiKey('valid-key');
      
      // Should not throw, but return false for non-strings
      expect(authManager.validateApiKey(123)).toBe(false);
      expect(authManager.validateApiKey({})).toBe(false);
      expect(authManager.validateApiKey([])).toBe(false);
      expect(authManager.validateApiKey(true)).toBe(false);
    });
  });
});