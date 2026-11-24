/**
 * Actors API routes for the bridge server
 * Forwards requests to FoundryVTT module via socket.io
 */

import { Router } from 'express';
import { sendModuleRefusal } from '../lib/module-errors.js';

export function createActorsRouter(socketClient) {
  const router = Router();

  /**
   * Search for actors
   * GET /api/actors?query=name&type=character&limit=10
   */
  router.get('/', async (req, res) => {
    try {
      const result = await socketClient.sendRequest('/api/actors', {
        method: 'GET',
        query: req.query,
        headers: { 'x-api-key': req.apiKey }
      });

      res.json(result);
    } catch (error) {
      console.error('[ActorsRouter] Error searching actors:', error.message);
      if (sendModuleRefusal(res, error)) return;
      // The module rejects bad input (e.g. limit > 100) with error
      // 'Validation Error'; the socket client puts that in error.code.
      if (error.code === 'Validation Error') {
        return res.status(400).json({
          success: false,
          error: 'Bad Request',
          message: error.message
        });
      }
      res.status(500).json({
        success: false,
        error: 'Internal Server Error',
        message: 'Failed to communicate with FoundryVTT server'
      });
    }
  });

  /**
   * Get specific actor by ID
   * GET /api/actors/:id
   */
  router.get('/:id', async (req, res) => {
    try {
      const result = await socketClient.sendRequest(`/api/actors/${req.params.id}`, {
        method: 'GET',
        params: req.params,
        headers: { 'x-api-key': req.apiKey }
      });

      res.json(result);
    } catch (error) {
      console.error(`[ActorsRouter] Error getting actor ${req.params.id}:`, error.message);
      if (sendModuleRefusal(res, error)) return;

      // Handle specific errors from FoundryVTT
      if (error.message.includes('Actor not found') || error.message.includes('404')) {
        res.status(404).json({
          success: false,
          error: 'Actor Not Found',
          message: `Actor with ID ${req.params.id} does not exist`
        });
      } else {
        res.status(500).json({
          success: false,
          error: 'Internal Server Error',
          message: 'Failed to communicate with FoundryVTT server'
        });
      }
    }
  });

  return router;
}
