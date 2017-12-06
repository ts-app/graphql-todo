module.exports = {
  "verbose": true,
  "transform": {
    ".(ts|tsx)": "<rootDir>/node_modules/ts-jest/preprocessor.js"
  },
  "testMatch": [
    "**/tests/**/*.test.ts?(x)"
  ],
  "coverageDirectory": "dist/coverage",
  "collectCoverageFrom": [
    "src/**/*.{ts,tsx,js,jsx}"
  ],
  "mapCoverage": true,
  "moduleFileExtensions": [
    "ts",
    "tsx",
    "js",
    "json"
  ],
  "globals": {
    "ts-jest": {
      "skipBabel": true,
      "tsConfigFile": "tsconfig.json"
    }
  },
  "testEnvironment": "node"
};
