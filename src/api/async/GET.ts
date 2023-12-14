import { z } from "$lib/index.js";

export const Output = z.object({
	data: z.promise(z.number()).openapi({ type: "number" }),
});

export default async function () {
	return {
		data: new Promise((resolve) => {
			setTimeout(() => {
				resolve(Math.random());
			}, 1000);
		}),
	};
}
