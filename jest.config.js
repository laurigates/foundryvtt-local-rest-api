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
  // Floor at the measured coverage (2026-11: statements 31.9, branches 28.3,
  // functions 26.0, lines 32.9) so CI catches a drop. The earlier 50% target
  // had never been met: CI failed before reaching the coverage step.
  coverageThreshold: {
    global: {
      branches: 28,
      functions: 26,
      lines: 32,
      statements: 31
    }
  },
  setupFilesAfterEnv: ['<rootDir>/tests/setup.js'],
  testTimeout: 10000,
  verbose: true,
  testEnvironmentOptions: {
    url: 'http://localhost'
  }
};