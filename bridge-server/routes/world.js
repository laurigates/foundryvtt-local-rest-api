/**
 * World API routes for the bridge server
 * Forwards world information requests to FoundryVTT module via socket.io
 */

import { Router } from 'express';
import { sendModuleRefusal } from '../lib/module-errors.js';

export function createWorldRouter(socketClient) {
  const router = Router();

  /**
   * Get world information
   * GET /api/world
   */
  router.get('/', async (req, res) => {
    try {
      const result = await socketClient.sendRequest('/api/world', {
        method: 'GET',
        headers: { 'x-api-key': req.apiKey }
      });

      res.json(result);
    } catch (error) {
      console.error('[WorldRouter] Error getting world info:', error.message);
      if (sendModuleRefusal(res, error)) return;
      res.status(500).json({
        success: false,
        error: 'Internal Server Error',
        message: 'Failed to communicate with FoundryVTT server'
      });
    }
  });

  return router;
}