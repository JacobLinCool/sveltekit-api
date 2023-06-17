import { z } from "$lib/index.js";
import { posts, type Post } from "../../db.js";

export const Query = z.object({
	q: z.string(),
});

export const Output = z.object({
	posts: z.array(
		z.object({
			id: z.string(),
			title: z.string(),
			content: z.string(),
			author: z.string(),
			date: z.string(),
		}),
	),
}) satisfies z.ZodSchema<{ posts: Post[] }>;

export default async function (query: z.infer<typeof Query>): Promise<z.infer<typeof Output>> {
	const q = query.q.toLowerCase();

	const results = [...posts.values()].filter(
		(post) =>
			q &&
			(post.title.toLowerCase().includes(q) ||
				post.content.toLowerCase().includes(q) ||
				post.author.toLowerCase().includes(q)),
	);

	return { posts: results };
}
