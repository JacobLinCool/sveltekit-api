import { Endpoint, z } from "$lib/index.js";

export const Output = z.object({
	data: z.promise(z.number()).openapi({ type: "number" }),
});

export default new Endpoint({ Output }).handle(async () => {
	return {
		data: new Promise((resolve) => {
			setTimeout(() => {
				resolve(Math.random());
			}, 1000);
		}),
	};
});
