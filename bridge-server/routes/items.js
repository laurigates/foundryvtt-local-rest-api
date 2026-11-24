/**
 * Items API routes for the bridge server
 * Forwards requests to FoundryVTT module via socket.io
 */

import { Router } from 'express';
import { sendModuleRefusal } from '../lib/module-errors.js';

export function createItemsRouter(socketClient) {
  const router = Router();

  /**
   * Search for items
   * GET /api/items?query=name&type=weapon&rarity=rare&limit=50
   */
  router.get('/', async (req, res) => {
    try {
      const result = await socketClient.sendRequest('/api/items', {
        method: 'GET',
        query: req.query,
        headers: { 'x-api-key': req.apiKey }
      });

      res.json(result);
    } catch (error) {
      console.error('[ItemsRouter] Error searching items:', error.message);
      if (sendModuleRefusal(res, error)) return;
      res.status(500).json({
        success: false,
        error: 'Internal Server Error',
        message: 'Failed to communicate with FoundryVTT server'
      });
    }
  });

  /**
   * Get specific item by ID
   * GET /api/items/:id
   */
  router.get('/:id', async (req, res) => {
    try {
      const result = await socketClient.sendRequest(`/api/items/${req.params.id}`, {
        method: 'GET',
        params: req.params,
        headers: { 'x-api-key': req.apiKey }
      });

      res.json(result);
    } catch (error) {
      console.error(`[ItemsRouter] Error getting item ${req.params.id}:`, error.message);
      if (sendModuleRefusal(res, error)) return;

      // Handle specific errors from FoundryVTT
      if (error.message.includes('Item not found') || error.message.includes('404')) {
        res.status(404).json({
          success: false,
          error: 'Item Not Found',
          message: `Item with ID ${req.params.id} does not exist`
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
