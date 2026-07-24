import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  base: '/finance-planner/',
  test: {
    setupFiles: ['tests/setup.ts'],
  },
})
