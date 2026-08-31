/** @type {import('jest').Config} */
module.exports = {
  testEnvironment: 'jest-environment-jsdom',
  transform: {
    '^.+\\.(ts|tsx|js|jsx)$': ['babel-jest', { configFile: './babel.config.jest.js' }],
  },
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
    '\\.(css|less|scss|sass)$': 'identity-obj-proxy',
    '\\.(svg|png|jpg|jpeg|gif|webp)$': '<rootDir>/src/__mocks__/fileMock.js',
  },
  testMatch: ['**/__tests__/**/*.test.(ts|tsx)', '**/*.test.(ts|tsx)'],
  transformIgnorePatterns: [
    'node_modules/(?!(@testing-library|recharts|d3-.*|internmap)/)',
  ],
  collectCoverageFrom: [
    'src/components/**/*.{ts,tsx}',
    'src/lib/tradeUtils.ts',
    'src/store/filtersSlice.ts',
    '!src/**/*.d.ts',
  ],
};
