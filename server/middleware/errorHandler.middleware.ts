import { Request, Response, NextFunction } from "express";
import { AppError } from "../errors";
import logger from "../logger";
import { config } from "../config";

export const errorHandler = (err: Error, req: Request, res: Response, _next: NextFunction) => {
  const statusCode = err instanceof AppError ? err.statusCode : 500;
  const isAuthError = statusCode === 401 || statusCode === 403;

  logger.error("ERROR", {
    message: err.message,
    stack: config.NODE_ENV !== "production" && !isAuthError ? err.stack : undefined,
    requestId: req.requestId,
    path: req.path,
  });

  if (err instanceof AppError) {
    return res.status(err.statusCode).json({
      success: false,
      error: err.message,
      code: (err as any).code,
      requestId: req.requestId,
    });
  }

  // Malformed ObjectId in a URL (e.g. /trips/undefined) can't match a record:
  // 404. A cast failure on any other field is bad input: 400.
  if (err.name === "CastError") {
    const isId = (err as any).path === "_id";
    return res.status(isId ? 404 : 400).json({
      success: false,
      error: isId ? "Not found" : "Invalid value",
      code: isId ? "NOT_FOUND" : "INVALID_INPUT",
      requestId: req.requestId,
    });
  }

  // Upload limits (file too large, too many files, oversized form field) are
  // the client's fault, not a server error.
  if (err.name === "MulterError") {
    const tooLarge = /^LIMIT_(FILE_SIZE|FIELD_VALUE)$/.test((err as any).code);
    return res.status(tooLarge ? 413 : 400).json({
      success: false,
      error: tooLarge ? "That file or field is too large." : err.message,
      code: (err as any).code,
      requestId: req.requestId,
    });
  }

  // Mongoose ValidationError
  if (err.name === "ValidationError") {
    return res.status(400).json({
      success: false,
      error: "Validation failed",
      code: "VALIDATION_ERROR",
      requestId: req.requestId,
    });
  }

  // Errors from body-parser/express itself (e.g. PayloadTooLargeError,
  // entity.parse.failed) carry their own status/statusCode — honor it
  // instead of always collapsing to a generic 500.
  const nativeStatus = (err as any).status ?? (err as any).statusCode;
  if (typeof nativeStatus === "number" && nativeStatus >= 400 && nativeStatus < 500) {
    return res.status(nativeStatus).json({
      success: false,
      error: err.message || "Request error",
      code: (err as any).type || "REQUEST_ERROR",
      requestId: req.requestId,
    });
  }

  // Default 500
  return res.status(500).json({
    success: false,
    error: config.NODE_ENV === "production" ? "Internal server error" : err.message,
    code: "INTERNAL_ERROR",
    requestId: req.requestId,
  });
};
