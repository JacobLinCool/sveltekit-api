import { Endpoint, z } from "$lib/index.js";
import { posts } from "../db.js";

export const Output = z.object({
	count: z.number().nonnegative(),
});

export default new Endpoint({ Output }).handle(async () => {
	return {
		count: posts.size,
	};
});
