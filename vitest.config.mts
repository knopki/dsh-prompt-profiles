import { defineConfig } from "vitest/config";

// Remote-tier specs only: the node:test suites keep test/*.mjs; the platform
// harness (vitest via @deepseek-ai/dsh-client-test-runtime) runs the
// Remote-mount bench under test/remote/.
export default defineConfig({
  test: {
    include: ["test/remote/**/*.spec.mjs"],
    environment: "node",
  },
});
