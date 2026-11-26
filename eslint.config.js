import js from "@eslint/js";
import tseslint from "typescript-eslint";
import react from "eslint-plugin-react";
import reactHooks from "eslint-plugin-react-hooks";
import jsxA11y from "eslint-plugin-jsx-a11y";
import prettier from "eslint-config-prettier";

export default tseslint.config(
  {
    ignores: ["dist/**", "node_modules/**", "coverage/**", "client/dist/**", "**/*.d.ts"],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["server/**/*.ts"],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "module",
      globals: {
        process: "readonly",
        console: "readonly",
        __dirname: "readonly",
        Buffer: "readonly",
      },
    },
    rules: {
      // This is a big, already-shipping codebase — new hooks should catch
      // real bugs on changed files, not force a retroactive rewrite of
      // every pre-existing `any`, unused catch-binding, or `let` that a
      // previous author chose over `const` for readability. lint-staged
      // only runs this against files actually being committed, so none of
      // this blocks work on files nobody's touching.
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-unused-vars": [
        "warn",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      "no-empty": ["warn", { allowEmptyCatch: true }],
      "prefer-const": "warn",
      "@typescript-eslint/no-namespace": "warn",
      "@typescript-eslint/ban-ts-comment": "warn",
      "no-useless-escape": "warn",
      "no-useless-catch": "warn",
      "no-control-regex": "warn",
    },
  },
  {
    files: ["client/src/**/*.{ts,tsx}"],
    plugins: { react, "react-hooks": reactHooks, "jsx-a11y": jsxA11y },
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "module",
      parserOptions: { ecmaFeatures: { jsx: true } },
      globals: {
        window: "readonly",
        document: "readonly",
        navigator: "readonly",
        console: "readonly",
        fetch: "readonly",
        localStorage: "readonly",
        sessionStorage: "readonly",
      },
    },
    settings: { react: { version: "detect" } },
    rules: {
      ...react.configs.recommended.rules,
      ...reactHooks.configs.recommended.rules,
      "react/react-in-jsx-scope": "off", // Vite's React 18 JSX transform doesn't need it
      "react/prop-types": "off", // TypeScript covers this
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-unused-vars": [
        "warn",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      "jsx-a11y/anchor-is-valid": "warn",
      "prefer-const": "warn",
      "@typescript-eslint/no-namespace": "warn",
      "@typescript-eslint/ban-ts-comment": "warn",
      "no-empty": ["warn", { allowEmptyCatch: true }],
      "no-useless-escape": "warn",
      "no-useless-catch": "warn",
      "no-control-regex": "warn",
      // Real bug class (conditional/loop/callback hook calls) — kept as a
      // warning rather than off so it still surfaces, but not hard-blocking
      // the ~300-issue historical-debt baseline like the rest of this file.
      // The 4 pre-existing hits were a false positive (a plain async
      // function named `useMyLocation`, not an actual hook) and have been
      // renamed rather than suppressed — this rule should report zero
      // real hits going forward.
      "react-hooks/rules-of-hooks": "warn",
      "react/no-unescaped-entities": "warn",
      "react/no-unknown-property": "warn",
      // eslint-plugin-react-hooks's newer React Compiler diagnostics,
      // pulled in as errors by its recommended config. 28 hits for
      // set-state-in-effect specifically is real, pre-existing signal
      // worth a dedicated look (each one is a component that could
      // double-render) — downgraded here so it doesn't block commits on
      // files that only happen to share a module with one of these, same
      // historical-debt treatment as the rest of this file.
      "react-hooks/set-state-in-effect": "warn",
      "react-hooks/immutability": "warn",
      "react-hooks/refs": "warn",
      "react-hooks/purity": "warn",
      "@typescript-eslint/no-empty-object-type": "warn",
    },
  },
  {
    // tests/** matches neither the server/** nor client/src/** globs above,
    // so it was falling through to tseslint's strict recommended defaults
    // — every existing test file that needed `any` (mocking a Mongoose
    // model, casting a private method) worked around it with a per-line
    // eslint-disable-next-line comment instead. That doesn't scale for a
    // regression suite with dozens of loosely-typed mock/fetch-response
    // shapes (tests/backend/fixall-batch.test.ts, tests/e2e/*.spec.ts) —
    // same relaxation the app code already gets, scoped to tests only.
    files: ["tests/**/*.{ts,tsx}"],
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-unused-vars": [
        "warn",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
    },
  },
  prettier,
);
