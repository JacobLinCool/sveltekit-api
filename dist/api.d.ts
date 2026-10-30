import type { OpenAPIObjectConfig } from "@asteasolutions/zod-to-openapi/dist/v3.0/openapi-generator.js";
import type { HttpError, RequestEvent } from "@sveltejs/kit";
import type { Simplify } from "type-fest";
import type { RouteConfig } from "./openapi.js";
import { OpenAPIRegistry } from "./openapi.js";
import { z } from "./zod.js";
export declare const METHOD: RegExp;
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
export interface APIRoute<P extends z.ZodType = z.ZodObject<Record<never, never>>, Q extends z.ZodType = z.ZodObject<Record<never, never>>, I extends z.ZodType = z.ZodObject<Record<never, never>>, O extends z.ZodType = z.ZodObject<Record<never, never>>, S extends z.ZodType = z.ZodObject<Record<never, never>>, E extends Record<string, HttpError> = Record<string, HttpError>> {
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
    Modifier?: RouteModifier;
    /**
     * Handler
     */
    default?: Function;
}
export declare class Endpoint<P extends z.ZodType = z.ZodObject<Record<never, never>>, Q extends z.ZodType = z.ZodObject<Record<never, never>>, I extends z.ZodType = z.ZodObject<Record<never, never>>, O extends z.ZodType = z.ZodObject<Record<never, never>>, S extends z.ZodType = z.ZodObject<Record<never, never>>, E extends Record<string, HttpError> = Record<string, HttpError>, H extends (input: Simplify<z.infer<I> & z.infer<Q> & z.infer<P>>, evt: RequestEvent) => Promise<z.input<O>> = (input: Simplify<z.infer<I> & z.infer<Q> & z.infer<P>>, evt: RequestEvent) => Promise<z.input<O>>> implements APIRoute<P, Q, I, O, S, E> {
    constructor({ Param, Query, Input, Output, Stream, Error, Modifier, }?: APIRoute<P, Q, I, O, S, E>);
    handle(f: H): this;
    Param?: P;
    Query?: Q;
    Input?: I;
    Output?: O;
    Stream?: S;
    Error?: E;
    Modifier?: RouteModifier;
    default: H;
}
export declare class API {
    routes: Record<string, () => Promise<unknown>>;
    config: OpenAPIObjectConfig;
    base: string;
    register: (registry: OpenAPIRegistry) => void;
    constructor(routes: Record<string, () => Promise<unknown>>, config: OpenAPIObjectConfig, base?: string, register?: (registry: OpenAPIRegistry) => void);
    handle(evt: RequestEvent, { cors, fallback, verify, }?: Partial<HandleOptions>): Promise<Response>;
    /**
     * Parse inputs from request event
     * @param module API route module, e.g. `import * as route from "./user/[id]/GET"`
     * @param evt Request event
     * @param extra Fallback inputs, ...
     * @returns Parsed inputs
     */
    parse<T extends APIRoute>(module: T, evt: RequestEvent, extra?: {
        fallback?: {
            body?: T["Input"] extends z.ZodType ? Partial<z.infer<T["Input"]>> : never;
            query?: T["Query"] extends z.ZodType ? Partial<z.infer<T["Query"]>> : never;
            param?: T["Param"] extends z.ZodType ? Partial<z.infer<T["Param"]>> : never;
        };
    }): Promise<Simplify<(T["Input"] extends z.ZodType ? z.infer<T["Input"]> : Record<never, never>) & (T["Query"] extends z.ZodType ? z.infer<T["Query"]> : Record<never, never>) & (T["Param"] extends z.ZodType ? z.infer<T["Param"]> : Record<never, never>)>>;
    /**
     * Parse inputs from request event
     * @param id API route ID with method, e.g. `./user/[id]/GET`
     * @param evt Request event
     * @param extra Fallback inputs, ...
     * @returns Parsed inputs
     */
    parse(id: string, evt: RequestEvent, extra?: {
        fallback?: Partial<Record<"body" | "query" | "param", Record<never, never>>>;
    }): Promise<{
        [x: string]: unknown;
    }>;
    handlers(): {
        GET: (evt: RequestEvent) => Promise<Response>;
        POST: (evt: RequestEvent) => Promise<Response>;
        PUT: (evt: RequestEvent) => Promise<Response>;
        DELETE: (evt: RequestEvent) => Promise<Response>;
        PATCH: (evt: RequestEvent) => Promise<Response>;
        OPTIONS: (evt: RequestEvent) => Promise<Response>;
    };
    openapi(evt?: RequestEvent): Promise<object>;
    protected parse_body(evt: RequestEvent, module: object, fallback?: Record<never, never>): Promise<Record<string, unknown>>;
    protected parse_query(evt: RequestEvent, module: object, fallback?: Record<never, never>): Promise<Record<string, unknown>>;
    protected parse_param(evt: RequestEvent, module: object, fallback?: Record<never, never>): Promise<Record<string, unknown>>;
    protected parse_output(out: unknown, module: object, fallback?: Record<never, never>): Promise<unknown>;
    protected parse_module(id: string): Promise<{
        path: string;
        method: string;
        body?: z.ZodObject<any>;
        query: z.ZodObject<any>;
        param: z.ZodObject<any>;
        output?: z.ZodObject<any>;
        stream?: z.ZodObject<any>;
        errors: HttpError[];
        modifier: RouteModifier;
    }>;
}
