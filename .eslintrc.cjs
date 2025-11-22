/** @type {import("eslint").Linter.Config} */
module.exports = {
  root: true,
  parser: "@typescript-eslint/parser",
  parserOptions: {
    ecmaVersion: "latest",
    sourceType: "module",
    project: "./tsconfig.json",
    tsconfigRootDir: __dirname
  },
  env: {
    browser: true,
    es2021: true,
    node: true
  },
  plugins: ["@typescript-eslint", "solid"],
  extends: [
    "eslint:recommended",
    "plugin:@typescript-eslint/recommended",
    "plugin:@typescript-eslint/recommended-requiring-type-checking",
    "plugin:solid/typescript"
  ],
  ignorePatterns: ["node_modules/", "dist/", ".output/", ".vinxi/", "public/", "pnpm-lock.yaml"],
  rules: {
    "solid/no-destructure": "error",
    "@typescript-eslint/no-unused-vars": ["warn", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
    "@typescript-eslint/explicit-function-return-type": "off",
    "@typescript-eslint/no-misused-promises": ["error", { checksVoidReturn: false }]
  }
};
