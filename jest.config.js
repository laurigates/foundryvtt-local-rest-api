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
  // Floor just below the measured coverage (2026-11-24, `npm run test:coverage`:
  // statements 54.77, branches 51.78, functions 53.96, lines 54.43) so CI
  // catches a drop. Raise it when coverage rises.
  coverageThreshold: {
    global: {
      branches: 51,
      functions: 53,
      lines: 54,
      statements: 54
    }
  },
  setupFilesAfterEnv: ['<rootDir>/tests/setup.js'],
  testTimeout: 10000,
  verbose: true,
  testEnvironmentOptions: {
    url: 'http://localhost'
  }
};