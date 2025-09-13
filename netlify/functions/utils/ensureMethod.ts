import { HandlerEvent, HandlerResponse } from '@netlify/functions';

/**
 * Ensures the incoming request uses an allowed HTTP method.
 *
 * @param event - The Netlify handler event containing the HTTP method.
 * @param allowedMethods - List of permitted HTTP methods (e.g., 'GET', 'POST').
 * @returns A 405 response if the method is not allowed; otherwise, undefined.
 */
export function ensureMethod(
  event: HandlerEvent,
  ...allowedMethods: string[]
): HandlerResponse | undefined {
  if (!allowedMethods.includes(event.httpMethod)) {
    const allowed = allowedMethods.join(' or ');
    return {
      statusCode: 405,
      body: JSON.stringify({
        success: false,
        error: `Method ${event.httpMethod} not allowed. Use ${allowed}.`,
      }),
    };
  }
}
