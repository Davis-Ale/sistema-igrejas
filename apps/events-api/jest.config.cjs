module.exports = {
  rootDir: ".",
  preset: "ts-jest/presets/default-esm",
  testEnvironment: "node",
  testMatch: [
    "<rootDir>/test/**/*.e2e-spec.ts"
  ],
  extensionsToTreatAsEsm: [
    ".ts"
  ],
  transform: {
    "^.+\\.ts$": [
      "ts-jest",
      {
        useESM: true,
        tsconfig: "<rootDir>/tsconfig.test.json"
      }
    ]
  },
  moduleNameMapper: {
    "^@sistema-igrejas/(.*)$":
      "<rootDir>/../../packages/$1/src/index.ts",
    "^(\\.{1,2}/.*)\\.js$": "$1"
  },
  testTimeout: 120000,
  maxWorkers: 1,
  detectOpenHandles: true,
  clearMocks: true
};
