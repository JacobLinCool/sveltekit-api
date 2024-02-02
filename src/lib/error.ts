import type { HttpError } from "@sveltejs/kit";
import { error as e } from "@sveltejs/kit";

export function error(status: number, message: string): HttpError {
	try {
		return e(status, message);
	} catch (error) {
		return error as HttpError;
	}
}
