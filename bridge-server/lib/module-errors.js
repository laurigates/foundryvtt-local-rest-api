/**
 * HTTP statuses for refusals the module answers with.
 *
 * SocketMessageHandler.createErrorResponse sends `error: 'Unauthorized'` for a
 * rejected API key and `error: 'Forbidden'` when the answering user's role or
 * document permission is too low; FoundrySocketClient.handleApiResponse puts
 * that string in `error.code`.
 */

const REFUSAL_STATUS = {
  Unauthorized: 401,
  Forbidden: 403
};

/**
 * Answer a module refusal with its HTTP status.
 * @returns {boolean} true when the response was sent
 */
export function sendModuleRefusal(res, error) {
  const status = REFUSAL_STATUS[error?.code];
  if (!status) return false;
  res.status(status).json({
    success: false,
    error: error.code,
    message: error.message
  });
  return true;
}
