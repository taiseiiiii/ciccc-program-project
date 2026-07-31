/**
 * An error carrying an HTTP status code. Throw these from controllers/services
 * and the central error handler will translate them into a JSON response.
 */
export class HttpError extends Error {
  readonly statusCode: number;
  readonly details?: unknown;

  constructor(statusCode: number, message: string, details?: unknown) {
    super(message);
    this.name = 'HttpError';
    this.statusCode = statusCode;
    this.details = details;
  }

  static badRequest(message = 'Bad Request', details?: unknown): HttpError {
    return new HttpError(400, message, details);
  }

  static notFound(message = 'Not Found'): HttpError {
    return new HttpError(404, message);
  }
}
