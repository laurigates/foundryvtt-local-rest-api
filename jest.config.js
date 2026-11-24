export default {
  testEnvironment: 'jsdom',
  transform: {
    '^.+\\.js$': 'babel-jest'
  },
  moduleFileExtensions: ['js'],
  transformIgnorePatterns: [],
  testMatch: [
    '**/tests/**/*.test.js',
    '**/__tests__/**/*.js'
  ],
  // bridge-server has its own Node-environment Jest config (npm test in bridge-server/)
  testPathIgnorePatterns: ['/node_modules/', '<rootDir>/bridge-server/'],
  collectCoverageFrom: [
    'scripts/**/*.js',
    '!scripts/build.js',
    '!**/node_modules/**',
    '!**/tests/**',
    '!tests/unit/socket-handler.test.js'
  ],
  coverageThreshold: {
    global: {
      branches: 50,
      functions: 50,
      lines: 50,
      statements: 50
    }
  },
  setupFilesAfterEnv: ['<rootDir>/tests/setup.js'],
  testTimeout: 10000,
  verbose: true,
  testEnvironmentOptions: {
    url: 'http://localhost'
  }
};