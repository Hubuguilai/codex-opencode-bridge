export class BridgeError extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export const invalid = (message) => new BridgeError(400, 'invalid_request', message);
export const unsupported = (message) => new BridgeError(422, 'unsupported_feature', message);
export function publicError(error) {
  if (error instanceof BridgeError) return error;
  if (['AbortError', 'TimeoutError'].includes(error?.name)) {
    return new BridgeError(504, 'request_cancelled', 'Request cancelled or deadline exceeded.');
  }
  // Never reflect upstream payloads, paths or credentials into responses/logs.
  return new BridgeError(502, 'upstream_error', 'OpenCode request failed. Check runtime availability.');
}
