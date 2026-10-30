---
"sveltekit-api": minor
---

Upgrade dependencies and migrate to SvelteKit 3, Svelte 5, and Zod 4.

This release introduces breaking changes for the 0.x series:

- Require Node.js 22.17 or newer, SvelteKit 3.1.1 or newer, and Svelte 5.57.3 or newer.
- Use Zod 4 schemas and the updated OpenAPI generator. Replace `z.ZodSchema` annotations with `z.ZodType`.
- Resolve nested promises before output validation while preserving Date values for schema transforms.

Update the example app, README, and development tooling for Vite 8, ESLint 10, and TypeScript 7 checking with the TypeScript 6 compatibility API.
