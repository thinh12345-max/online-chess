import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Debug and utility scripts (not part of production code):
    "debug-6f.cjs",
    "debug-6f-v2.cjs",
    "debug-6f-v3.cjs",
    "debug-6f.mjs",
    "debug-poll.cjs",
    "debug-realtime.cjs",
    "run-all.sh",
    "run-all.ps1",
    "doit.sh",
    "run-log.sh",
    "run-wrapper.sh",
    "run-build.sh",
    "run-build.ps1",
    "run-build.js",
    "run-tests.js",
    "kill-server.js",
    "kill-server.ps1",
  ]),
]);

export default eslintConfig;
