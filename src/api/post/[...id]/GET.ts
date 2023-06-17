import { z } from "$lib/index.js";
import { error } from "@sveltejs/kit";
import { posts, type Post } from "../../db.js";

export const Param = z.object({
	id: z.string(),
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
};

export default async function (param: z.infer<typeof Param>): Promise<z.infer<typeof Output>> {
	const post = posts.get(param.id);

	if (!post) {
		throw Error[404];
	}

	return post;
}
