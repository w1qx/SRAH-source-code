/**
 * Zod at the boundary — called MANUALLY in every handler, not hidden in middleware.
 *
 * The explicitness is the point: reading a route, you can see exactly what shape it
 * accepts. Nothing untrusted reaches a service without passing through here.
 */
import type { Request } from 'express';
import type { ZodSchema, ZodTypeDef } from 'zod';
import { ApiError } from './api-error';

function parse<T>(schema: ZodSchema<T, ZodTypeDef, unknown>, data: unknown, source: string): T {
  const result = schema.safeParse(data);
  if (!result.success) {
    throw ApiError.badRequest(`Invalid request ${source}.`, {
      issues: result.error.issues.map((issue) => ({
        path: issue.path.join('.'),
        message: issue.message,
      })),
    });
  }
  return result.data;
}

export function parseBody<T>(schema: ZodSchema<T, ZodTypeDef, unknown>, req: Request): T {
  return parse(schema, req.body, 'body');
}

export function parseParams<T>(schema: ZodSchema<T, ZodTypeDef, unknown>, req: Request): T {
  return parse(schema, req.params, 'parameters');
}

export function parseQuery<T>(schema: ZodSchema<T, ZodTypeDef, unknown>, req: Request): T {
  return parse(schema, req.query, 'query');
}

/**
 * Validate data crossing an INBOUND trust boundary that is not HTTP — specifically, the
 * LLM's output. The model is not a trusted source; whatever it emits gets validated
 * exactly like a request body before it is allowed anywhere near the database.
 */
export function parseUntrusted<T>(
  schema: ZodSchema<T, ZodTypeDef, unknown>,
  data: unknown,
): { ok: true; data: T } | { ok: false; issues: string[] } {
  const result = schema.safeParse(data);
  if (result.success) return { ok: true, data: result.data };
  return {
    ok: false,
    issues: result.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`),
  };
}
