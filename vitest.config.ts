import { defineConfig } from 'vitest/config';

export default defineConfig({
	test: {
		globals: true,
		testTimeout: 40000,
		hookTimeout: 40000,
		maxWorkers: 4,
		environment: 'node',
		include: ['test/*.test.ts']
	}
});
