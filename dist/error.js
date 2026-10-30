import { error as e } from "@sveltejs/kit";
export function error(status, message) {
    try {
        return e(status, message);
    }
    catch (error) {
        return error;
    }
}
