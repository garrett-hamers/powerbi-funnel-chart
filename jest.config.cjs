module.exports = {
  preset: "ts-jest",
  testEnvironment: "jsdom",
  roots: ["<rootDir>/tests"],
  collectCoverageFrom: ["src/**/*.ts"],
  coveragePathIgnorePatterns: ["/visual.ts$"],
  moduleFileExtensions: ["ts", "js"],
  moduleNameMapper: {
    "\\.css$": "<rootDir>/tests/styleMock.cjs",
    "^powerbi-visuals-utils-formattingutils$": "<rootDir>/tests/formattingUtilsMock.cjs"
  },
  testMatch: ["**/*.test.ts"]
};
