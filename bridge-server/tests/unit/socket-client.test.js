import { jest } from '@jest/globals';

// Create mocks before importing the module that uses them
const mockSocket = {
  id: 'test-socket-id',
  connected: false,
  on: jest.fn(),
  once: jest.fn(),
  emit: jest.fn(),
  disconnect: jest.fn(),
  connect: jest.fn(),
  off: jest.fn(),
  removeListener: jest.fn(),
  removeAllListeners: jest.fn(),
  auth: {}
};

const io = jest.fn(() => mockSocket);

// Mock the socket.io-client module
jest.unstable_mockModule('socket.io-client', () => ({
  io: io,
  default: io
}));

// Import after mocking
const { FoundrySocketClient } = await import('../../lib/socket-client.js');

describe('FoundrySocketClient', () => {
  let socketClient;
  const mockFoundryUrl = 'http://localhost:30000';
  const mockApiKey = 'test-api-key-123';

  beforeEach(() => {
    // Reset all mocks
    jest.clearAllMocks();

    // Reset mock socket state
    mockSocket.connected = false;
    mockSocket.id = 'test-socket-id';

    // Create socket client
    socketClient = new FoundrySocketClient({
      foundryUrl: mockFoundryUrl,
      apiKey: mockApiKey,
      timeout: 1000
    });
  });

  describe('constructor', () => {
    test('should initialize with provided options', () => {
      expect(socketClient.foundryUrl).toBe(mockFoundryUrl);
      expect(socketClient.apiKey).toBe(mockApiKey);
      expect(socketClient.timeout).toBe(1000);
    });

    test('should use default timeout if not provided', () => {
      const client = new FoundrySocketClient({
        foundryUrl: mockFoundryUrl,
        apiKey: mockApiKey
      });
      expect(client.timeout).toBe(5000);
    });
  });

  describe('connect', () => {
    test('should create socket connection with correct options', async () => {
      // Set up mock to return our mock socket
      io.mockReturnValue(mockSocket);

      // Set up connect event handler
      mockSocket.once.mockImplementation((event, callback) => {
        if (event === 'connect') {
          setTimeout(() => callback(), 0);
        }
      });

      // Connect
      await socketClient.connect();

      // Should have called io with correct URL
      expect(io).toHaveBeenCalledWith(
        mockFoundryUrl,
        expect.objectContaining({
          path: '/socket.io',
          transports: ['websocket']
        })
      );
    });

    test('should handle connection errors', async () => {
      io.mockReturnValue(mockSocket);

      const mockError = new Error('Connection refused');
      mockError.code = 'ECONNREFUSED';

      mockSocket.once.mockImplementation((event, callback) => {
        if (event === 'connect_error') {
          setTimeout(() => callback(mockError), 0);
        }
      });

      await expect(socketClient.connect()).rejects.toThrow('Connection refused');

      // Check error was categorized
      expect(socketClient.lastError).toBeDefined();
      expect(socketClient.lastError.type).toBe('connection_refused');
    });
  });

  describe('sendRequest', () => {
    beforeEach(() => {
      socketClient.isConnected = true;
      socketClient.socket = mockSocket;
      mockSocket.connected = true;
    });

    test('should send request with correct format', async () => {
      const endpoint = '/api/actors';
      const options = {
        method: 'GET',
        query: { limit: 10 },
        headers: { 'x-api-key': mockApiKey }
      };

      // Set up response handler first
      let responseHandler;
      mockSocket.on.mockImplementation((event, handler) => {
        if (event === 'module.foundryvtt-local-rest-api.response') {
          responseHandler = handler;
        }
      });

      // Set up emit handler to capture request and respond
      let capturedRequestData;
      mockSocket.emit.mockImplementation((event, data) => {
        if (event === 'module.foundryvtt-local-rest-api') {
          capturedRequestData = data;
          // Simulate response immediately
          if (responseHandler) {
            const response = {
              requestId: data.requestId,
              success: true,
              data: { actors: [] }
            };
            // Use setImmediate to ensure promise chain continues
            setImmediate(() => responseHandler(response));
          }
        }
      });

      // Initialize socket handlers (this calls setupEventHandlers)
      socketClient.socket = mockSocket;
      socketClient.setupEventHandlers();

      // Send request
      const result = await socketClient.sendRequest(endpoint, options);

      // Verify request format
      expect(capturedRequestData).toBeDefined();
      expect(capturedRequestData.type).toBe('actors.search');
      expect(capturedRequestData.auth.apiKey).toBe(mockApiKey);
      expect(capturedRequestData.params.query).toEqual({ limit: 10 });

      // Verify response
      expect(result).toEqual({ actors: [] });
    });

    test('should handle request timeout', async () => {
      socketClient.requestTimeout = 100;

      mockSocket.emit.mockImplementation(() => {
        // Don't send response, let it timeout
      });

      await expect(socketClient.sendRequest('/api/actors', {})).rejects.toThrow(
        'Request timeout after 100ms'
      );
    });
  });

  describe('getConnectionDiagnostics', () => {
    test('should return comprehensive diagnostics', () => {
      socketClient.connectionAttempts = 3;
      socketClient.lastConnectionAttempt = '2024-01-01T00:00:00Z';
      socketClient.lastError = {
        type: 'timeout',
        message: 'Connection timeout',
        troubleshooting: ['Check network']
      };
      socketClient.errorHistory = [
        { type: 'timeout', message: 'Timeout 1' },
        { type: 'connection_refused', message: 'Refused' }
      ];

      const diagnostics = socketClient.getConnectionDiagnostics();

      expect(diagnostics.status.connected).toBe(false);
      expect(diagnostics.statistics.connectionAttempts).toBe(3);
      expect(diagnostics.lastError.type).toBe('timeout');
      expect(diagnostics.errorHistory).toHaveLength(2);
    });
  });

  describe('getTroubleshootingSuggestions', () => {
    test('should provide suggestions based on connection state', () => {
      socketClient.isConnected = false;
      socketClient.connectionAttempts = 5;
      socketClient.lastError = {
        type: 'connection_refused',
        troubleshooting: ['Check if FoundryVTT is running']
      };

      const suggestions = socketClient.getTroubleshootingSuggestions();

      expect(suggestions).toContain('Socket is not connected to FoundryVTT');
      expect(suggestions).toContain('Last error: connection_refused');
      expect(suggestions).toContain('Check if FoundryVTT is running');
      expect(suggestions).toContain('Multiple connection attempts have failed');
    });
  });
});
