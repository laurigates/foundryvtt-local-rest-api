/**
 * Scenes API routes for the bridge server
 * Forwards scene requests to FoundryVTT module via socket.io
 */

import { Router } from 'express';
import { sendModuleRefusal } from '../lib/module-errors.js';

export function createScenesRouter(socketClient) {
  const router = Router();

  /**
   * Get current active scene
   * GET /api/scenes/current
   */
  router.get('/current', async (req, res) => {
    try {
      const result = await socketClient.sendRequest('/api/scenes/current', {
        method: 'GET',
        headers: { 'x-api-key': req.apiKey }
      });

      res.json(result);
    } catch (error) {
      console.error('[ScenesRouter] Error getting current scene:', error.message);
      if (sendModuleRefusal(res, error)) return;
      res.status(500).json({
        success: false,
        error: 'Internal Server Error',
        message: 'Failed to communicate with FoundryVTT server'
      });
    }
  });

  /**
   * Get specific scene by ID
   * GET /api/scenes/:id
   */
  router.get('/:id', async (req, res) => {
    try {
      const result = await socketClient.sendRequest(`/api/scenes/${req.params.id}`, {
        method: 'GET',
        params: req.params,
        headers: { 'x-api-key': req.apiKey }
      });

      res.json(result);
    } catch (error) {
      console.error(`[ScenesRouter] Error getting scene ${req.params.id}:`, error.message);
      if (sendModuleRefusal(res, error)) return;
      
      // Handle specific errors from FoundryVTT
      if (error.message.includes('Scene not found') || error.message.includes('404')) {
        res.status(404).json({
          success: false,
          error: 'Scene Not Found',
          message: `Scene with ID ${req.params.id} does not exist`
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

  /**
   * Search for scenes
   * GET /api/scenes?query=name&limit=50
   */
  router.get('/', async (req, res) => {
    try {
      const result = await socketClient.sendRequest('/api/scenes', {
        method: 'GET',
        query: req.query,
        headers: { 'x-api-key': req.apiKey }
      });

      res.json(result);
    } catch (error) {
      console.error('[ScenesRouter] Error searching scenes:', error.message);
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