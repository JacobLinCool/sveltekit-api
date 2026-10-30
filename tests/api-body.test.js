import assert from "node:assert/strict";
import test from "node:test";
import { API, z } from "../dist/index.js";

const api = new API({}, { openapi: "3.0.0", info: { title: "Test", version: "1" } });

// Exercise the public handler so decoding, validation, and response serialization are covered.
async function handle(body, contentType, Input, fallback = {}) {
	const endpoint = new API(
		{ "./test/POST": async () => ({ Input, default: async (input) => input }) },
		api.config,
	);
	return endpoint.handle(
		/** @type {import('@sveltejs/kit').RequestEvent} */ ({
			route: { id: "/api/test" },
			params: {},
			url: new URL("http://localhost/api/test"),
			request: new Request("http://localhost/api/test", {
				method: "POST",
				body,
				headers: contentType ? { "content-type": contentType } : {},
			}),
		}),
		{ verify: false, fallback: { body: fallback } },
	);
}

test("JSON merges fallback fields and strips unknown fields", async () => {
	const response = await handle(
		JSON.stringify({ name: "new", secret: "hidden" }),
		"application/json; charset=utf-8",
		z.object({ name: z.string(), count: z.number() }),
		{ name: "old", count: 2 },
	);
	assert.deepEqual(await response.json(), { name: "new", count: 2 });
});

test("malformed JSON and invalid input retain HTTP 400 errors", async () => {
	for (const body of ["{", '{"name":1}']) {
		await assert.rejects(handle(body, "application/json", z.object({ name: z.string() })), {
			status: 400,
		});
	}
});

test("URL-encoded repeated values merge with fallback arrays", async () => {
	const response = await handle(
		"tag=first&tag=second",
		"application/x-www-form-urlencoded",
		z.object({ tag: z.array(z.string()) }),
		{ tag: ["fallback"] },
	);
	assert.deepEqual(await response.json(), { tag: ["fallback", "first", "second"] });
});

test("multipart repeated fields become arrays", async () => {
	const form = new FormData();
	form.append("tag", "first");
	form.append("tag", "second");
	const response = await handle(form, undefined, z.object({ tag: z.array(z.string()) }));
	assert.deepEqual(await response.json(), { tag: ["first", "second"] });
});

test("text and binary bodies are decoded", async () => {
	const text = await handle("hello", "text/plain", z.object({ text: z.string() }));
	assert.deepEqual(await text.json(), { text: "hello" });
	const binary = await handle(
		new Uint8Array([1, 2, 3]),
		"application/octet-stream",
		z.object({
			buffer: z.instanceof(ArrayBuffer).transform((value) => [...new Uint8Array(value)]),
		}),
	);
	assert.deepEqual(await binary.json(), { buffer: [1, 2, 3] });
});

test("unsupported content types preserve fallback values", async () => {
	const response = await handle("ignored", "application/xml", z.object({ name: z.string() }), {
		name: "fallback",
	});
	assert.deepEqual(await response.json(), { name: "fallback" });
});
