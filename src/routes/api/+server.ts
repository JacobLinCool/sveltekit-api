import api from "$api/index.js";
import { json } from "@sveltejs/kit";

export const prerender = true;

export const GET = async (evt) => json(await api.openapi(evt));
