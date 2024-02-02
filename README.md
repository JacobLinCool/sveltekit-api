# SvelteKit-API

Handles all kinds of SvelteKit data flows in one place, and automatically generate OpenAPI documentation.

## Features

- [x] `API`: Manage API endpoints and automatically generate OpenAPI documentation
- [x] `load2api`: Transform a server-side `load` function into an API endpoint
- [x] `tree`: Build a tree of endpoint routes

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

Add `$api` to your `svelte.config.js`:

```js
/** @type {import('@sveltejs/kit').Config} */
const config = {
  kit: {
    alias: {
      "$api": "./src/api",
    },
  },
};
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
}) satisfies z.ZodSchema<Post>;

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
import api from "$api";
import { json } from "@sveltejs/kit";

export const prerender = true;

export const GET = async (evt) => json(await api.openapi(evt));
```

```ts
// file: src/routes/api/post/+server.ts
import api from "$api";

export const GET = async (evt) => api.handle(evt);
export const POST = async (evt) => api.handle(evt);
export const OPTIONS = async (evt) => api.handle(evt);
```

### `load2api`

Transforms a server-side `load` function into an API endpoint in a single line.

```ts
// file: src/routes/api/problem/[...id]/+server.ts
import { load2api } from "sveltekit-api";
import { load } from "$routes/problem/[...id]/+page.server";

export const GET = async (evt) => load2api("/problem/[...id]", load, evt);
```

### `tree`

Build a self-explanatory tree of API endpoints.

```ts
import { tree } from "sveltekit-api";
import { json } from "@sveltejs/kit";

export const prerender = true;

export const GET = async () => {
  return json(await tree(import.meta.glob("./**/*/+server.ts")));
};
```
