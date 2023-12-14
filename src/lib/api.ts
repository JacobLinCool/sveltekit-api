import type { Simplify } from "type-fest";
import { fromZodError } from "zod-validation-error";
import type { OpenAPIObjectConfig } from "@asteasolutions/zod-to-openapi/dist/v3.0/openapi-generator.js";
import { error, json } from "@sveltejs/kit";
import type { HttpError } from "@sveltejs/kit";
import type { RequestEvent } from "@sveltejs/kit";
import { log as _log } from "./log.js";
import { OpenAPIRegistry, OpenApiGeneratorV3 } from "./openapi.js";
import type { RouteConfig } from "./openapi.js";
import { recursive_await } from "./utils.js";
import { z } from "./zod.js";

const log = _log.extend("api");

export const METHOD = /^(GET|POST|PUT|DELETE|PATCH|OPTIONS)$/;

/**
 * Modify route config after parsing input-ouput shapes.
 * Useful for adding custom tags, etc.
 *
 * @param r Route config
 * @returns Modified route config
 * @example
 * ```ts
 * export const Modifier: RouteModifier = (r) => {
 *     r.tags = ["Tag"];
 *     r.operationId = "customOperationId";
 *     r.security = [{ bearerAuth: [] }];
 *     return r;
 * };
 * ```
 */
export type RouteModifier = (r: RouteConfig) => RouteConfig;

export interface HandleOptions {
	/**
	 * Enable CORS headers
	 */
	cors: boolean;
	/**
	 * Fallback values for missing input shapes, will be validated against
	 */
	fallback: Partial<Record<"body" | "query" | "param", Record<never, never>>>;
	/**
	 * Verify and strip unknown properties from output, useful for preventing accidental exposure of sensitive data
	 */
	verify: boolean;
}

export interface APIRoute<
	P extends z.ZodObject<Record<never, never>> = z.ZodObject<Record<never, never>>,
	Q extends z.ZodObject<Record<never, never>> = z.ZodObject<Record<never, never>>,
	I extends z.ZodObject<Record<never, never>> = z.ZodObject<Record<never, never>>,
	O extends z.ZodObject<Record<never, never>> = z.ZodObject<Record<never, never>>,
	S extends z.ZodObject<Record<never, never>> = z.ZodObject<Record<never, never>>,
	E extends Partial<{ [x: string]: HttpError }> = Partial<{ [x: string]: HttpError }>,
> {
	/**
	 * Path parameters
	 */
	Param?: P;
	/**
	 * Query string parameters
	 */
	Query?: Q;
	/**
	 * Body
	 */
	Input?: I;
	/**
	 * Returning data
	 */
	Output?: O;
	/**
	 * Event stream data
	 */
	Stream?: S;
	/**
	 * Possible errors
	 */
	Error?: E;
	/**
	 * OpenAPI route config modifier
	 */
	// eslint-disable-next-line @typescript-eslint/ban-types
	Modifier?: RouteModifier;
	/**
	 * Handler
	 */
	// eslint-disable-next-line @typescript-eslint/ban-types
	default?: Function;
}

export class API {
	public routes: Record<string, () => Promise<unknown>>;
	public config: OpenAPIObjectConfig;
	public base: string;
	public register: (registry: OpenAPIRegistry) => void;

	constructor(
		routes: Record<string, () => Promise<unknown>>,
		config: OpenAPIObjectConfig,
		base = "/api",
		register: (registry: OpenAPIRegistry) => void = () => undefined,
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

		this.register = register;
	}

	async handle(
		evt: RequestEvent,
		{
			cors = true,
			fallback = {
				body: {},
				query: {},
				param: {},
			},
			verify = true,
		}: Partial<HandleOptions> = {},
	): Promise<Response> {
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
							"Access-Control-Allow-Headers": "Content-Type, Authorization",
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

		const param = await this.parse_param(evt, module, fallback.param);
		const query = await this.parse_query(evt, module, fallback.query);
		const body = await this.parse_body(evt, module, fallback.body);

		const output = await module.default({ ...body, ...query, ...param }, evt);

		const CORS = {
			"Access-Control-Allow-Origin": "*",
			"Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, PATCH, OPTIONS",
			"Access-Control-Allow-Headers": "Content-Type, Authorization",
		} as const;

		if (output instanceof Response) {
			if (cors) {
				for (const [key, value] of Object.entries(CORS)) {
					output.headers.set(key, value);
				}
			}

			return output;
		}

		// ReadableStream for Server-Sent Events
		if (output instanceof ReadableStream) {
			const res = new Response(output, {
				headers: {
					"Content-Type": "text/event-stream",
					"Cache-Control": "no-cache",
					Connection: "keep-alive",
					...(cors ? CORS : {}),
				},
			});
			return res;
		}

		if (output instanceof Response) {
			return output;
		} else if (output instanceof ArrayBuffer) {
			const res = new Response(output, {
				headers: {
					"Content-Type": "application/octet-stream",
					...(cors ? CORS : {}),
				},
			});
			return res;
		} else {
			const out = await recursive_await(
				verify ? await this.parse_output(output, module) : output,
			);
			const res = json(out, {
				headers: cors ? CORS : {},
			});

			return res;
		}
	}

	/**
	 * Parse inputs from request event
	 * @param module API route module, e.g. `import * as route from "./user/[id]/GET"`
	 * @param evt Request event
	 * @param extra Fallback inputs, ...
	 * @returns Parsed inputs
	 */
	async parse<T extends APIRoute>(
		module: T,
		evt: RequestEvent,
		extra?: {
			fallback?: {
				body?: T["Input"] extends z.ZodType ? Partial<z.infer<T["Input"]>> : never;
				query?: T["Query"] extends z.ZodType ? Partial<z.infer<T["Query"]>> : never;
				param?: T["Param"] extends z.ZodType ? Partial<z.infer<T["Param"]>> : never;
			};
		},
	): Promise<
		Simplify<
			(T["Input"] extends z.ZodType ? z.infer<T["Input"]> : Record<never, never>) &
				(T["Query"] extends z.ZodType ? z.infer<T["Query"]> : Record<never, never>) &
				(T["Param"] extends z.ZodType ? z.infer<T["Param"]> : Record<never, never>)
		>
	>;
	/**
	 * Parse inputs from request event
	 * @param id API route ID with method, e.g. `./user/[id]/GET`
	 * @param evt Request event
	 * @param extra Fallback inputs, ...
	 * @returns Parsed inputs
	 */
	async parse(
		id: string,
		evt: RequestEvent,
		extra?: {
			fallback?: Partial<Record<"body" | "query" | "param", Record<never, never>>>;
		},
	): Promise<{ [x: string]: unknown }>;
	async parse(
		id: string | APIRoute,
		evt: RequestEvent,
		{
			fallback = {
				body: {},
				query: {},
				param: {},
			} as Partial<Record<"body" | "query" | "param", Record<never, never>>>,
		} = {},
	): Promise<{ [x: string]: unknown }> {
		const module = typeof id === "string" ? await this.parse_module(id) : id;
		const param = await this.parse_param(evt, module, fallback.param);
		const query = await this.parse_query(evt, module, fallback.query);
		const body = await this.parse_body(evt, module, fallback.body);
		return { ...body, ...query, ...param };
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

			const config = module.modifier({
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
					...(module.stream
						? {
								"200": {
									description: "",
									content: {
										"text/event-stream": {
											schema: module.stream as never,
										},
									},
								},
						  }
						: undefined),
					...(module.query || module.param || module.body
						? {
								"400": {
									description:
										"Invalid input (path parameters, query string, or body)",
									content: {
										"application/json": {
											schema: z.object({
												message: z.string(),
											}),
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

			registry.registerPath(config);
		}

		this.register(registry);

		const generator = new OpenApiGeneratorV3(registry.definitions);
		const openapi = generator.generateDocument(
			evt
				? {
						servers: [
							{
								url: evt.url.origin,
							},
						],
						...this.config,
				  }
				: this.config,
		);
		log("openapi: %O", openapi);
		return openapi;
	}

	protected async parse_body(
		evt: RequestEvent,
		module: object,
		fallback?: Record<never, never>,
	): Promise<Record<string, unknown>> {
		const body: Record<string, unknown> = { ...fallback };

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
		fallback?: Record<never, never>,
	): Promise<Record<string, unknown>> {
		const query: Record<string, unknown> = { ...fallback };

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
		fallback?: Record<never, never>,
	): Promise<Record<string, unknown>> {
		const param = { ...fallback, ...evt.params };

		log("param: %O", param);

		const validator =
			"Param" in module && module.Param instanceof z.ZodObject ? module.Param : z.object({});
		const validation = validator.safeParse(param);
		if (!validation.success) {
			throw error(400, `Invalid param.\n${fromZodError(validation.error).message}`);
		}

		return param;
	}

	protected async parse_output(
		out: unknown,
		module: object,
		fallback?: Record<never, never>,
	): Promise<Record<string, unknown>> {
		const output: Record<string, unknown> = {
			...fallback,
			...(typeof out === "object" ? out : undefined),
		};

		const validator =
			"Output" in module && module.Output instanceof z.ZodObject
				? module.Output
				: z.object({});
		const validation = await validator.spa(output);
		if (!validation.success) {
			log.extend("error")("output: %O failed validation: %O", output, validation.error);
			throw error(
				500,
				"Output validation failed. Please report this error to the developer.",
			);
		}

		return output;
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
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		stream?: z.ZodObject<any>;
		errors: HttpError[];
		modifier: RouteModifier;
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
		const stream =
			"Stream" in module && module.Stream instanceof z.ZodObject ? module.Stream : undefined;
		const errors =
			"Error" in module && module.Error && typeof module.Error === "object"
				? Object.values(module.Error)
				: [];
		const modifier =
			"Modifier" in module && typeof module.Modifier === "function"
				? (module.Modifier as RouteModifier)
				: (r: RouteConfig) => r;

		return {
			path,
			method,
			body,
			query,
			param,
			output,
			stream,
			errors,
			modifier,
		};
	}
}
