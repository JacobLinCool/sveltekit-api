# SvelteKit-API

Utilities to create API endpoints in SvelteKit.

Mapping UI-first SvelteKit routes to API endpoints is a common task. This package provides utilities to make this easier.

## Features

- [x] `load2api`: Transform a server-side `load` function into an API endpoint
- [x] `tree`: Build a tree of endpoint routes

## Installation

```bash
pnpm i -D sveltekit-api
```

## Usage

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
    return json(await tree(import.meta.glob(".\/**\/*\/+server.ts")));
};
```
