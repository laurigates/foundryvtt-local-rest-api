export default {
  testEnvironment: 'node',
  transform: {},
  testTimeout: 30000,
  setupFilesAfterEnv: ['<rootDir>/tests/setup.js'],
  // Floor just below the measured coverage (2026-11-24, `npm run test:coverage`:
  // statements 78.57-78.93, branches 71.12-71.42, functions 84.7, lines
  // 77.53-77.93 across two runs; the run-to-run spread is why the floor sits
  // about a point below) so CI catches a drop. Raise it when coverage rises.
  coverageThreshold: {
    global: {
      branches: 70,
      functions: 83,
      lines: 76,
      statements: 77
    }
  }
};
