import { Endpoint } from "$lib/api.js";
import { z } from "$lib/index.js";

export const Param = z.object({ param: z.string() });
export const Output = z.object({
	param: z.string(),
	date: z
		.instanceof(Date)
		.transform((d) => d.toISOString())
		// in this case, our custom zod isn't able to detect it as a string
		// so, in order to have a consistent schema spec
		// we have to tell it manually ⬇︎
		.openapi({ type: "string" }),
});

export default new Endpoint({ Param, Output }).handle(async ({ param }) => {
	return {
		param,
		date: new Date(),
	};
});
