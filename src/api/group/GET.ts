import { json } from "@sveltejs/kit";

export default function () {
	return json({ status: "ok" });
}
