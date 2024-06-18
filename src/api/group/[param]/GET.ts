import { Endpoint } from "$lib/api.js";
import { z } from "$lib/index.js";
import { json } from "@sveltejs/kit";

export const Param = z.object({ param: z.string() });

export default new Endpoint({ Param }).handle(async (params) => {
	return json(params);
});
