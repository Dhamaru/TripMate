import { Request, Response, NextFunction, RequestHandler } from "express";

/**
 * Express 4 doesn't forward a rejected promise from an async route handler
 * to next() automatically -- every controller re-implemented the same
 * `try { ... } catch (error) { next(error); }` boilerplate by hand (93
 * occurrences across 14 files) to cover this. Wrap the handler at route
 * registration instead; any throw/rejection inside it lands in next().
 */
export function asyncHandler(fn: RequestHandler): RequestHandler {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}
