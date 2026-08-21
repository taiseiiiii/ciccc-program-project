/**
 * An error carrying an HTTP status code. Throw these from controllers/services
 * and the central error handler will translate them into a JSON response.
 */
export class HttpError extends Error {
  readonly statusCode: number;
  readonly details?: unknown;

  constructor(statusCode: number, message: string, details?: unknown) {
    super(message);
    this.name = "HttpError";
    this.statusCode = statusCode;
    this.details = details;
  }

  static badRequest(message = "Bad Request", details?: unknown): HttpError {
    return new HttpError(400, message, details);
  }

  static unauthorized(message = "Unauthorized"): HttpError {
    return new HttpError(401, message);
  }

  static forbidden(message = "Forbidden"): HttpError {
    return new HttpError(403, message);
  }

  static notFound(message = "Not Found"): HttpError {
    return new HttpError(404, message);
  }

  static unprocessable(message = "Unprocessable Entity", details?: unknown): HttpError {
    return new HttpError(422, message, details);
  }

  static tooManyRequests(message = "Too Many Requests"): HttpError {
    return new HttpError(429, message);
  }

  static badGateway(message = "Bad Gateway"): HttpError {
    return new HttpError(502, message);
  }

  static serviceUnavailable(message = "Service Unavailable"): HttpError {
    return new HttpError(503, message);
  }

  static gatewayTimeout(message = "Gateway Timeout"): HttpError {
    return new HttpError(504, message);
  }
}
