import { Endpoint, z } from "$lib/index.js";
import { posts, type Post } from "../db.js";

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
	password: z.string().optional(),
}) satisfies z.ZodSchema<Post>;

export default new Endpoint({ Input, Output }).handle(async (input) => {
	const id = Math.random().toString(36).substring(2);
	const date = new Date().toISOString();
	const post = { id, date, ...input };

	posts.set(id, post);

	return post;
});
