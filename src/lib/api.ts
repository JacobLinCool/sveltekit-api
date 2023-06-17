import { fromZodError } from "zod-validation-error";
import { OpenAPIRegistry, OpenApiGeneratorV3 } from "@asteasolutions/zod-to-openapi";
import type { OpenAPIObjectConfig } from "@asteasolutions/zod-to-openapi/dist/v3.0/openapi-generator.js";
import { error, HttpError, json } from "@sveltejs/kit";
import type { RequestEvent } from "@sveltejs/kit";
import { log as _log } from "./log.js";
import { z } from "./zod.js";

const log = _log.extend("api");

export const METHOD = /^(GET|POST|PUT|DELETE|PATCH|OPTIONS)$/;

export class API {
	public routes: Record<string, () => Promise<unknown>>;
	public config: OpenAPIObjectConfig;
	public base: string;

	constructor(
		routes: Record<string, () => Promise<unknown>>,
		config: OpenAPIObjectConfig,
		base = "/api",
	) {
		this.routes = Object.fromEntries(
			Object.entries(routes)
				.filter(([route]) => {
					const parts = route.split("/");
					const last = parts[parts.length - 1].split(".")[0];
					return METHOD.test(last);
				})
				.map(([route, load]) => {
					const parts = route.split("/");
					const last = parts[parts.length - 1].split(".")[0];
					parts[parts.length - 1] = last;
					const id = parts.join("/");
					return [id, load];
				}),
		);
		log("routes: %O", this.routes);
		this.config = config;
		log("config: %O", this.config);
		this.base = base;
		log("base: %s", this.base);
	}

	async handle(evt: RequestEvent, { cors = true } = {}): Promise<Response> {
		if (!evt.route.id) {
			throw error(500, "No Route");
		}
		log("route id: %s", evt.route.id);

		// handle OPTIONS
		if (evt.request.method.toUpperCase() === "OPTIONS") {
			return new Response(null, {
				headers: cors
					? {
							"Access-Control-Allow-Origin": "*",
							"Access-Control-Allow-Methods":
								"GET, POST, PUT, DELETE, PATCH, OPTIONS",
					  }
					: {},
			});
		}

		const route =
			this.routes[
				`${evt.route.id.replace(this.base, ".")}/${evt.request.method.toUpperCase()}`
			];
		if (!route) {
			throw error(404, "Route not found");
		}

		const module = await route();
		if (
			!module ||
			typeof module !== "object" ||
			!("default" in module) ||
			typeof module.default !== "function"
		) {
			throw error(404, "Route not found");
		}

		const param = await this.parse_param(evt, module);
		const query = await this.parse_query(evt, module);
		const body = await this.parse_body(evt, module);

		const output = await module.default({ ...body, ...query, ...param });

		const res = json(output, {
			headers: cors
				? {
						"Access-Control-Allow-Origin": "*",
						"Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, PATCH, OPTIONS",
				  }
				: {},
		});

		return res;
	}

	handlers() {
		return {
			GET: async (evt: RequestEvent) => this.handle(evt),
			POST: async (evt: RequestEvent) => this.handle(evt),
			PUT: async (evt: RequestEvent) => this.handle(evt),
			DELETE: async (evt: RequestEvent) => this.handle(evt),
			PATCH: async (evt: RequestEvent) => this.handle(evt),
			OPTIONS: async (evt: RequestEvent) => this.handle(evt),
		};
	}

	async openapi(evt?: RequestEvent) {
		const registry = new OpenAPIRegistry();

		for (const route of Object.keys(this.routes)) {
			const module = await this.parse_module(route);

			registry.registerPath({
				// eslint-disable-next-line @typescript-eslint/no-explicit-any
				method: module.method.toLowerCase() as any,
				path: module.path,
				request: {
					params: module.param,
					query: module.query,
					body: module.body
						? {
								description: "",
								content: {
									"application/json": {
										schema: module.body,
									},
									"application/x-www-form-urlencoded": {
										schema: module.body,
									},
									"multipart/form-data": {
										schema: module.body,
									},
								},
						  }
						: undefined,
				},
				responses: {
					...(module.output
						? {
								"200": {
									description: "",
									content: {
										"application/json": {
											schema: module.output as never,
										},
									},
								},
						  }
						: undefined),
					...(Object.fromEntries(
						module.errors.map((error) => [
							error.status,
							{
								description: error.body.message,
							},
						]),
					) ?? {}),
				},
			});
		}

		const generator = new OpenApiGeneratorV3(registry.definitions);
		const openapi = generator.generateDocument(
			evt
				? {
						...this.config,
						servers: [
							{
								url: evt.url.origin,
							},
						],
				  }
				: this.config,
		);
		log("openapi: %O", openapi);
		return openapi;
	}

	protected async parse_body(
		evt: RequestEvent,
		module: object,
	): Promise<Record<string, unknown>> {
		const body: Record<string, unknown> = {};

		// JSON body
		if (evt.request.headers.get("content-type")?.startsWith("application/json")) {
			try {
				const json = await evt.request.json();
				if (typeof json === "object") {
					Object.assign(body, json);
				}
			} catch {
				throw error(400, "Invalid JSON body");
			}
		}
		// Form body
		else if (
			evt.request.headers
				.get("content-type")
				?.startsWith("application/x-www-form-urlencoded") ||
			evt.request.headers.get("content-type")?.startsWith("multipart/form-data")
		) {
			const form = await evt.request.formData();
			for (const [key, value] of form.entries()) {
				if (body[key]) {
					const existing = body[key];
					if (Array.isArray(existing)) {
						existing.push(value);
					} else {
						body[key] = [body[key], value];
					}
				} else {
					body[key] = value;
				}
			}
		}
		// Text body
		else if (evt.request.headers.get("content-type")?.startsWith("text/plain")) {
			const text = await evt.request.text();
			body.text = text;
		}
		// Binary body
		else if (evt.request.headers.get("content-type")?.startsWith("application/octet-stream")) {
			const buffer = await evt.request.arrayBuffer();
			body.buffer = buffer;
		}

		log("body: %O", body);

		const validator =
			"Input" in module && module.Input instanceof z.ZodObject ? module.Input : z.object({});
		const validation = validator.safeParse(body);
		if (!validation.success) {
			throw error(400, `Invalid body.\n${fromZodError(validation.error).message}`);
		}

		return body;
	}

	protected async parse_query(
		evt: RequestEvent,
		module: object,
	): Promise<Record<string, unknown>> {
		const query: Record<string, unknown> = {};

		for (const [key, value] of evt.url.searchParams.entries()) {
			if (query[key]) {
				const existing = query[key];
				if (Array.isArray(existing)) {
					existing.push(value);
				} else {
					query[key] = [query[key], value];
				}
			} else {
				query[key] = value;
			}
		}

		log("query: %O", query);

		const validator =
			"Query" in module && module.Query instanceof z.ZodObject ? module.Query : z.object({});
		const validation = validator.safeParse(query);
		if (!validation.success) {
			throw error(400, `Invalid query.\n${fromZodError(validation.error).message}`);
		}

		return query;
	}

	protected async parse_param(
		evt: RequestEvent,
		module: object,
	): Promise<Record<string, unknown>> {
		const param = evt.params;

		log("param: %O", param);

		const validator =
			"Param" in module && module.Param instanceof z.ZodObject ? module.Param : z.object({});
		const validation = validator.safeParse(param);
		if (!validation.success) {
			throw error(400, `Invalid param.\n${fromZodError(validation.error).message}`);
		}

		return param;
	}

	protected async parse_module(id: string): Promise<{
		path: string;
		method: string;
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		body?: z.ZodObject<any>;
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		query: z.ZodObject<any>;
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		param: z.ZodObject<any>;
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		output?: z.ZodObject<any>;
		errors: HttpError[];
	}> {
		const handler = this.routes[id];
		const parts = id.split("/");
		const path = parts
			.slice(0, -1)
			.join("/")
			.replace(/^\./, this.base)
			.replace(/\[(?:\.{3})?(.+)\]/g, "{$1}");
		const method = parts[parts.length - 1].toUpperCase();

		const module = await handler();
		if (!module || typeof module !== "object") {
			throw new Error(`Route ${id} is not a module`);
		}

		const body =
			"Input" in module && module.Input instanceof z.ZodObject ? module.Input : undefined;
		const query =
			"Query" in module && module.Query instanceof z.ZodObject ? module.Query : z.object({});
		const param =
			"Param" in module && module.Param instanceof z.ZodObject ? module.Param : z.object({});
		const output =
			"Output" in module && module.Output instanceof z.ZodObject ? module.Output : undefined;
		const errors =
			"Error" in module && module.Error && typeof module.Error === "object"
				? Object.values(module.Error)
				: [];

		return {
			path,
			method,
			body,
			query,
			param,
			output,
			errors,
		};
	}
}
