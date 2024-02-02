# SvelteKit-API

Handles all kinds of SvelteKit data flows in one place, and automatically generate OpenAPI documentation.

## Features

-   [x] `API`: Manage API endpoints and automatically generate OpenAPI documentation
-   [x] `load2api`: Transform a server-side `load` function into an API endpoint
-   [x] `tree`: Build a tree of endpoint routes

## Installation

```bash
pnpm i -D sveltekit-api
```

## Projects using SvelteKit-API

These projects are using SvelteKit-API and can be used as examples:

-   [WASM OJ Wonderland](https://github.com/wasm-oj/wonderland): A SvelteKit-based online judge system core.
-   [PEA](https://github.com/JacobLinCool/pea): A serverless email authentication and verification service.
-   Add your project here by submitting a pull request!

## Usage

### `API`

Add `$api` to your `svelte.config.js`:

```js
/** @type {import('@sveltejs/kit').Config} */
const config = {
    kit: {
        alias: {
            "$api/*": "./src/api/*",
        },
    },
};
```

Create the API endpoints in the structure like [`src/api`](./src/api).

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
// file: src/api/post/POST.ts
import { z } from "sveltekit-api";
import { posts, type Post } from "db";

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

export default async function (input: z.infer<typeof Input>): Promise<z.infer<typeof Output>> {
    const id = Math.random().toString(36).substring(2);
    const date = new Date().toISOString();
    const post = { id, date, ...input };

    posts.set(id, post);

    return post;
}
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
