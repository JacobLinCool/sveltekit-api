import type { RequestEvent, ServerLoadEvent } from "@sveltejs/kit";
import { json } from "@sveltejs/kit";
import { log } from "./log.js";

/**
 * Transform a server-side `load` function into an API endpoint
 * @param id The route ID to use for the original `load` function
 * @param load The original `load` function
 * @param evt The request event
 * @example
 * ```ts
 * // file: src/routes/api/problem/[...id]/+server.ts
 * import { load2api } from "sveltekit-api";
 * import { load } from "$routes/problem/[...id]/+page.server";
 *
 * export const GET = async (evt) => load2api("/problem/[...id]", load, evt);
 * ```
 */
export async function load2api<Evt extends RequestEvent, RouteID extends string | null, Returns>(
	id: RouteID,
	load: (evt: ServerLoadEvent<never, never, RouteID>) => Returns,
	evt: Evt,
) {
	const loader = {
		...evt,
		route: { id },
		depends: () => undefined,
		parent: async () => ({} as never),
	};

	log(evt.route.id, "=>", id);

	const data = await load(loader as never);

	return json(await recursive_await(data));
}

function recursive_await(obj: unknown): unknown {
	if (obj instanceof Promise) {
		return obj.then(recursive_await);
	} else if (obj instanceof Array) {
		return Promise.all(obj.map(recursive_await));
	} else if (obj instanceof Object) {
		const keys = Object.keys(obj);
		const values = Object.values(obj);
		return Promise.all(values.map(recursive_await)).then((values) => {
			const returns: Record<string, unknown> = {};
			for (let i = 0; i < keys.length; i++) {
				returns[keys[i]] = values[i];
			}
			return returns;
		});
	} else {
		return obj;
	}
}
