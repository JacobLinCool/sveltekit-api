# SvelteKit-API

Handles all kinds of SvelteKit data flows in one place, and automatically generate OpenAPI documentation.

## Features

- [x] `API`: Manage API endpoints and automatically generate OpenAPI documentation

## Installation

```bash
pnpm i -D sveltekit-api
```

## Projects using SvelteKit-API

These projects are using SvelteKit-API and can be used as examples:

- [WASM OJ Wonderland](https://github.com/wasm-oj/wonderland): A SvelteKit-based online judge system core.
- [PEA](https://github.com/JacobLinCool/pea): A serverless email authentication and verification service.
- Add your project here by submitting a pull request!

## Usage

### `API`

Requires Node.js 22.17 or newer, SvelteKit 3, and Svelte 5. Schemas use Zod 4.

Add a subpath import to your `package.json`:

```json
{
  "imports": {
    "#api": "./src/api/index.ts"
  }
}
```

Configure SvelteKit in `vite.config.ts`:

```ts
import adapter from "@sveltejs/adapter-auto";
import { sveltekit } from "@sveltejs/kit/vite";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [sveltekit({ adapter: adapter() })],
});
```

Create the API endpoints in the structure like [`src/api`](./src/api).

```ts
// for example:
src
├── api
│   ├── index.ts
│   └── post
│       ├── GET.ts
│       ├── POST.ts
│       ├── [...id]
│       │   └── GET.ts
│       └── search
│           └── GET.ts
├── lib
│   └── ...
└── routes
    └── ...
```

```ts
// file: src/api/index.ts
import { API } from "sveltekit-api";

export default new API(import.meta.glob("./**/*.ts"), {
  openapi: "3.0.0",
  info: {
    title: "Simple Post API",
    version: "1.0.0",
    description: "An example API",
  },
});
```

```ts
// file: src/api/post/[...id]/PUT.ts
import { Endpoint, z, error } from "sveltekit-api";
import { posts, type Post } from "../../db.js";

export const Query = z.object({
  password: z.string().optional(),
});

export const Param = z.object({
  id: z.string(),
});

export const Input = z.object({
  title: z.string(),
  content: z.string(),
  author: z.string(),
});

export const Output = z.object({
  id: z.string(),
  title: z.string(),
  content: z.string(),
  author: z.string(),
  date: z.string(),
}) satisfies z.ZodType<Post>;

export const Error = {
  404: error(404, "Post not found"),
  403: error(403, "Forbidden"),
};

export default new Endpoint({ Param, Query, Input, Output, Error }).handle(async (param) => {
  const post = posts.get(param.id);

  if (!post) {
    throw Error[404];
  }

  if (post.password && post.password !== param.password) {
    throw Error[403];
  }

  post.title = param.title;
  post.content = param.content;
  post.author = param.author;

  return post;
});
```

Call the API handler and OpenAPI generator in your routes like [`src/routes/api`](./src/routes/api).

```ts
// file: src/routes/+server.ts
import api from "#api";
import { json } from "@sveltejs/kit";

export const prerender = true;

export const GET = async (evt) => json(await api.openapi(evt));
```

```ts
// file: src/routes/api/post/+server.ts
import api from "#api";

export const GET = async (evt) => api.handle(evt);
export const POST = async (evt) => api.handle(evt);
export const OPTIONS = async (evt) => api.handle(evt);
```

## Development

Use pnpm 12.16.1 (`corepack enable` and `corepack prepare pnpm@12.16.1 --activate`), then run:

```bash
pnpm install
pnpm check
pnpm lint
pnpm build
```

Type checking uses TypeScript 7 through `@typescript/native` and `svelte-check --tsgo`. TypeScript 6 remains installed as the compatibility API required by Svelte and ESLint tooling.
