import { Request, Response, NextFunction } from "express";
import { AnyZodObject, ZodError } from "zod";
import { BadRequestError } from "../errors";

export const validate =
  (schema: AnyZodObject) => async (req: Request, res: Response, next: NextFunction) => {
    try {
      const parsed = await schema.parseAsync({
        body: req.body,
        query: req.query,
        params: req.params,
      });
      // Replace with Zod's stripped output — schemas only declare the
      // keys they validate, so anything else on req.body/query/params
      // must not silently pass through to controllers.
      if ("body" in parsed) req.body = parsed.body;
      if ("query" in parsed) req.query = parsed.query as typeof req.query;
      if ("params" in parsed) req.params = parsed.params as typeof req.params;
      next();
    } catch (error) {
      if (error instanceof ZodError) {
        return next(new BadRequestError(error.errors.map((e) => e.message).join(", ")));
      }
      next(error);
    }
  };
