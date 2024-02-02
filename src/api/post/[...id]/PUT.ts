import { Endpoint, z } from "$lib/index.js";
import { error } from "@sveltejs/kit";
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
