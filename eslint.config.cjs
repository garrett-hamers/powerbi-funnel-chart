const tseslint = require("@typescript-eslint/eslint-plugin");
const parser = require("@typescript-eslint/parser");

module.exports = [
  {
    files: ["src/**/*.ts", "tests/**/*.ts"],
    languageOptions: {
      parser,
      parserOptions: {
        ecmaVersion: 2020,
        sourceType: "module"
      }
    },
    plugins: {
      "@typescript-eslint": tseslint
    },
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-unused-vars": ["error", { "argsIgnorePattern": "^_" }],
      "no-console": "error",
      "no-eval": "error"
    }
  }
];
