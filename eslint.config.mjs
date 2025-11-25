import tseslint from "@typescript-eslint/eslint-plugin";
import tsParser from "@typescript-eslint/parser";
import solid from "eslint-plugin-solid";

const tsConfigs = tseslint.configs["flat/recommended-type-checked"].map((config) => {
  if (config.languageOptions) {
    return {
      ...config,
      languageOptions: {
        ...config.languageOptions,
        parser: tsParser,
        parserOptions: {
          ...config.languageOptions.parserOptions,
          project: "./tsconfig.json",
          tsconfigRootDir: import.meta.dirname,
          sourceType: "module",
        },
      },
    };
  }
  return config;
});

export default [
  {
    ignores: ["node_modules/**", "dist/**", ".vinxi/**", ".output/**", "public/**", "pnpm-lock.yaml"],
  },
  ...tsConfigs,
  {
    files: ["**/*.ts", "**/*.tsx"],
    plugins: { solid },
    rules: {
      ...solid.configs["flat/typescript"].rules,
      "solid/no-destructure": "error",
      "@typescript-eslint/no-unused-vars": ["warn", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
      "@typescript-eslint/no-misused-promises": ["error", { checksVoidReturn: false }],
    },
  },
];
