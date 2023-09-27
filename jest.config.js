/** @type {import('ts-jest').JestConfigWithTsJest} */
module.exports = {
  testEnvironment: "node",
  setupFilesAfterEnv: ["<rootDir>/test/set-up-jest.ts"],
  transform: {
    "^.+\\.(t|j)sx?$": "@swc/jest",
  },
};
