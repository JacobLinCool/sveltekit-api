export type ApiEndpoint = { [key: string]: ApiEndpoint | boolean };

/**
 * Build a tree of endpoints from the return value of `import.meta.glob()`
 * @param globs The return value of `import.meta.glob()`
 * @example
 * ```ts
 * import { tree } from "sveltekit-api";
 * import { json } from "@sveltejs/kit";
 *
 * export const prerender = true;
 *
 * export const GET = async () => {
 *     return json(await tree(import.meta.glob(".\/**\/*\/+server.ts")));
 * };
 * ```
 */
export async function tree(globs: Record<string, () => Promise<unknown>>) {
	const routes = await Promise.all(
		Object.entries(
			globs as unknown as Record<
				string,
				() => Promise<Record<string, () => Promise<unknown>>>
			>,
		).map(([path, load]) => {
			return Promise.all([
				path.replace(/^\.\//, "").replace("/+server.ts", ""),
				load().then((mod) =>
					Object.keys(mod).filter((key) =>
						key.match(/^(GET|POST|PUT|DELETE|PATCH|HEAD|OPTIONS)$/),
					),
				),
			]);
		}),
	);

	const tree = routes.reduce((tree, route) => {
		const parts = route[0].split("/").filter(Boolean);
		let node = tree;
		for (let part of parts) {
			part = part.replace(/\[\.\.\.(.+)\]/, "[$1]");
			if (!node[part]) {
				node[part] = {};
			}
			const next = node[part];
			if (typeof next !== "boolean") {
				node = next;
			}
		}
		Object.assign(node, Object.fromEntries(route[1].map((method) => [method, true])));

		return tree;
	}, {} as ApiEndpoint);

	return tree;
}
