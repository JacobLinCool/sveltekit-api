import { error, json } from "@sveltejs/kit";
import { fromZodError } from "zod-validation-error";
import { log as _log } from "./log.js";
import { OpenAPIRegistry, OpenApiGeneratorV3 } from "./openapi.js";
import { recursive_await } from "./utils.js";
import { z } from "./zod.js";
const log = _log.extend("api");
async function decode_json(request, body) {
    try {
        const value = await request.json();
        if (typeof value === "object") {
            Object.assign(body, value);
        }
    }
    catch {
        throw error(400, "Invalid JSON body");
    }
}
function append_form_value(body, key, value) {
    const existing = body[key];
    if (!existing) {
        body[key] = value;
    }
    else if (Array.isArray(existing)) {
        existing.push(value);
    }
    else {
        body[key] = [existing, value];
    }
}
async function decode_body(request, body) {
    const content_type = request.headers.get("content-type") ?? "";
    if (content_type.startsWith("application/json")) {
        await decode_json(request, body);
    }
    else if (content_type.startsWith("application/x-www-form-urlencoded") ||
        content_type.startsWith("multipart/form-data")) {
        const form = await request.formData();
        for (const [key, value] of form.entries()) {
            append_form_value(body, key, value);
        }
    }
    else if (content_type.startsWith("text/plain")) {
        body.text = await request.text();
    }
    else if (content_type.startsWith("application/octet-stream")) {
        body.buffer = await request.arrayBuffer();
    }
}
export const METHOD = /^(GET|POST|PUT|DELETE|PATCH|OPTIONS)$/;
export class Endpoint {
    constructor({ Param, Query, Input, Output, Stream, Error, Modifier, } = {}) {
        this.Param = Param;
        this.Query = Query;
        this.Input = Input;
        this.Output = Output;
        this.Stream = Stream;
        this.Error = Error;
        this.Modifier = Modifier;
    }
    handle(f) {
        this.default = f;
        return this;
    }
    Param;
    Query;
    Input;
    Output;
    Stream;
    Error;
    Modifier;
    // @ts-expect-error default handler throws error
    default = () => {
        throw new Error("Route handler not defined");
    };
}
export class API {
    routes;
    config;
    base;
    register;
    constructor(routes, config, base = "/api", register = () => undefined) {
        this.routes = Object.fromEntries(Object.entries(routes)
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
        }));
        log("routes: %O", this.routes);
        this.config = config;
        log("config: %O", this.config);
        this.base = base;
        log("base: %s", this.base);
        this.register = register;
    }
    async handle(evt, { cors = true, fallback = {
        body: {},
        query: {},
        param: {},
    }, verify = true, } = {}) {
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
                        "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, PATCH, OPTIONS",
                        "Access-Control-Allow-Headers": "Content-Type, Authorization",
                    }
                    : {},
            });
        }
        const route = this.routes[`${evt.route.id.replace(/\(.+\)\//g, "").replace(this.base, ".")}/${evt.request.method.toUpperCase()}`];
        if (!route) {
            throw error(404, "Route not found");
        }
        let module = (await route());
        if (!module || typeof module !== "object" || !("default" in module)) {
            throw error(404, "Route not found");
        }
        if (module.default instanceof Endpoint) {
            module = module.default;
        }
        else if (typeof module.default === "function") {
            // whole module is an endpoint
        }
        else {
            throw error(404, "Route type not supported");
        }
        const param = await this.parse_param(evt, module, fallback.param);
        const query = await this.parse_query(evt, module, fallback.query);
        const body = await this.parse_body(evt, module, fallback.body);
        if (!module.default) {
            throw error(500, "Route handler not defined");
        }
        const output = await module.default({ ...body, ...query, ...param }, evt);
        const CORS = {
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, PATCH, OPTIONS",
            "Access-Control-Allow-Headers": "Content-Type, Authorization",
        };
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
        if (output instanceof ArrayBuffer) {
            const res = new Response(output, {
                headers: {
                    "Content-Type": "application/octet-stream",
                    ...(cors ? CORS : {}),
                },
            });
            return res;
        }
        else {
            const out = await recursive_await(verify ? await this.parse_output(output, module) : output);
            const res = json(out, {
                headers: cors ? CORS : {},
            });
            return res;
        }
    }
    async parse(id, evt, { fallback = {
        body: {},
        query: {},
        param: {},
    }, } = {}) {
        const module = typeof id === "string" ? await this.parse_module(id) : id;
        const param = await this.parse_param(evt, module, fallback.param);
        const query = await this.parse_query(evt, module, fallback.query);
        const body = await this.parse_body(evt, module, fallback.body);
        return { ...body, ...query, ...param };
    }
    handlers() {
        return {
            GET: async (evt) => this.handle(evt),
            POST: async (evt) => this.handle(evt),
            PUT: async (evt) => this.handle(evt),
            DELETE: async (evt) => this.handle(evt),
            PATCH: async (evt) => this.handle(evt),
            OPTIONS: async (evt) => this.handle(evt),
        };
    }
    async openapi(evt) {
        const registry = new OpenAPIRegistry();
        for (const route of Object.keys(this.routes)) {
            const module = await this.parse_module(route);
            const config = module.modifier({
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                method: module.method.toLowerCase(),
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
                                        schema: module.output,
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
                                        schema: module.stream,
                                    },
                                },
                            },
                        }
                        : undefined),
                    ...(module.query || module.param || module.body
                        ? {
                            "400": {
                                description: "Invalid input (path parameters, query string, or body)",
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
                    ...(Object.fromEntries(module.errors.map((error) => [
                        error.status,
                        {
                            description: error.body.message,
                        },
                    ])) ?? {}),
                },
            });
            registry.registerPath(config);
        }
        this.register(registry);
        const generator = new OpenApiGeneratorV3(registry.definitions);
        const openapi = generator.generateDocument(evt
            ? {
                servers: [
                    {
                        url: evt.url.origin,
                    },
                ],
                ...this.config,
            }
            : this.config);
        log("openapi: %O", openapi);
        return openapi;
    }
    async parse_body(evt, module, fallback) {
        let body = { ...fallback };
        // GET, HEAD, DELETE, OPTIONS have no body
        const method = evt.request.method.toUpperCase();
        if (["GET", "HEAD", "DELETE", "OPTIONS"].includes(method)) {
            return body;
        }
        await decode_body(evt.request.clone(), body);
        log("body: %O", body);
        const validator = "Input" in module && module.Input instanceof z.ZodObject ? module.Input : z.object({});
        const validation = validator.safeParse(body);
        if (!validation.success) {
            throw error(400, `Invalid body.\n${fromZodError(validation.error).message}`);
        }
        else {
            body = validation.data;
        }
        return body;
    }
    async parse_query(evt, module, fallback) {
        let query = { ...fallback };
        for (const [key, value] of evt.url.searchParams.entries()) {
            if (query[key]) {
                const existing = query[key];
                if (Array.isArray(existing)) {
                    existing.push(value);
                }
                else {
                    query[key] = [query[key], value];
                }
            }
            else {
                query[key] = value;
            }
        }
        log("query: %O", query);
        const validator = "Query" in module && module.Query instanceof z.ZodObject ? module.Query : z.object({});
        const validation = validator.safeParse(query);
        if (!validation.success) {
            throw error(400, `Invalid query.\n${fromZodError(validation.error).message}`);
        }
        else {
            query = validation.data;
        }
        return query;
    }
    async parse_param(evt, module, fallback) {
        let param = { ...fallback, ...evt.params };
        log("param: %O", param);
        const validator = "Param" in module && module.Param instanceof z.ZodObject ? module.Param : z.object({});
        const validation = validator.safeParse(param);
        if (!validation.success) {
            throw error(400, `Invalid param.\n${fromZodError(validation.error).message}`);
        }
        else {
            param = validation.data;
        }
        return param;
    }
    async parse_output(out, module, fallback) {
        let output = Array.isArray(out)
            ? out
            : {
                ...fallback,
                ...(typeof out === "object" ? out : undefined),
            };
        const validator = "Output" in module && module.Output instanceof z.ZodType ? module.Output : z.object({});
        const validation = await validator.safeParseAsync(await recursive_await(output));
        if (!validation.success) {
            log.extend("error")("output: %O failed validation: %O", output, validation.error);
            throw error(500, "Output validation failed. Please report this error to the developer.");
        }
        else {
            output = validation.data;
        }
        return output;
    }
    async parse_module(id) {
        const handler = this.routes[id];
        const parts = id.split("/");
        const path = parts
            .slice(0, -1)
            .join("/")
            .replace(/^\./, this.base)
            .replace(/\[(\.{3})?(.+?)\]/g, "{$2}")
            .replace(/\(.+\)\//g, "");
        const method = parts[parts.length - 1].toUpperCase();
        let module = (await handler());
        if (!module || typeof module !== "object") {
            throw new Error(`Route ${id} is not a module`);
        }
        if (module.default instanceof Endpoint) {
            module = module.default;
        }
        else if (typeof module.default === "function") {
            // whole module is an endpoint
        }
        else {
            throw new Error(`Route ${id} is not a module`);
        }
        const body = "Input" in module && module.Input instanceof z.ZodType ? module.Input : undefined;
        const query = "Query" in module && module.Query instanceof z.ZodType ? module.Query : z.object({});
        const param = "Param" in module && module.Param instanceof z.ZodType ? module.Param : z.object({});
        const output = "Output" in module && module.Output instanceof z.ZodType ? module.Output : undefined;
        const stream = "Stream" in module && module.Stream instanceof z.ZodType ? module.Stream : undefined;
        const errors = "Error" in module && module.Error && typeof module.Error === "object"
            ? Object.values(module.Error)
            : [];
        const modifier = "Modifier" in module && typeof module.Modifier === "function"
            ? module.Modifier
            : (r) => r;
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
