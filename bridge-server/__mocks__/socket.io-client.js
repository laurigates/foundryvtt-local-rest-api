// Mock for socket.io-client
import { jest } from '@jest/globals';

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

// Named exports
export { io, mockSocket };

// Default export
export default io;