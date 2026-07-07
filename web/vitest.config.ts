import { defineConfig } from 'vitest/config'

// Node-environment unit tests for pure logic (no DOM). Later batches add focused
// tests for RLS helpers, numbering, PM date math, validation — all pure `.test.ts`.
// If a batch ever needs component (DOM) tests, add jsdom + testing-library then.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
})
