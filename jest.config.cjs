module.exports = {
  preset: "ts-jest",
  testEnvironment: "jsdom",
  roots: ["<rootDir>/tests"],
  collectCoverageFrom: ["src/**/*.ts"],
  coveragePathIgnorePatterns: ["/visual.ts$"],
  moduleFileExtensions: ["ts", "js"],
  testMatch: ["**/*.test.ts"]
};
