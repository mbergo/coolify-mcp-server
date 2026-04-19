/**
 * Bearer-token auth middleware for the SSE connector.
 *
 * Enforcement rules:
 *   • Public paths (GET '/', GET '/api/status') always allowed
 *   • Everything else requires `Authorization: Bearer <CONNECTOR_AUTH_TOKEN>`
 *     when the env var is set
 *   • If the env var is unset, the caller should bind to 127.0.0.1 only
 *     (server.ts enforces that); the middleware becomes a no-op then
 */

import type { NextFunction, Request, Response } from "express";

const PUBLIC_PATHS = new Set<string>(["/", "/api/status"]);

export interface AuthMiddlewareOptions {
  token: string | null;
  publicPaths?: Iterable<string>;
}

export function makeAuthMiddleware(opts: AuthMiddlewareOptions) {
  const token = opts.token;
  const publics = new Set<string>([...PUBLIC_PATHS, ...(opts.publicPaths ?? [])]);

  return function authMiddleware(req: Request, res: Response, next: NextFunction): void {
    if (!token) {
      next();
      return;
    }

    if (publics.has(req.path)) {
      next();
      return;
    }

    const header = req.headers.authorization ?? "";
    const expected = `Bearer ${token}`;

    if (header.length !== expected.length || header !== expected) {
      res.status(401).json({ error: "unauthorized" });
      return;
    }

    next();
  };
}
