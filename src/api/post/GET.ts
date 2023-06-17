import { z } from "$lib/index.js";
import { posts } from "../db.js";

export const Output = z.object({
	count: z.number().nonnegative(),
});

export default async function () {
	return {
		count: posts.size,
	};
}
