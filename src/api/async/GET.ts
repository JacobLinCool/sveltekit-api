import { Endpoint, z } from "#lib/index.js";

export const Output = z.object({
	data: z.number(),
});

export default new Endpoint({ Output }).handle(async () => {
	return {
		data: await new Promise<number>((resolve) => {
			setTimeout(() => {
				resolve(Math.random());
			}, 1000);
		}),
	};
});
