/**
 * Compendium API routes for the bridge server
 * Forwards requests to FoundryVTT module via socket.io
 */

import { Router } from 'express';
import { sendModuleRefusal } from '../lib/module-errors.js';

export function createCompendiumRouter(socketClient) {
  const router = Router();

  /**
   * Search compendium pack indexes
   * GET /api/compendium/search?query=fire&packType=Item&itemType=spell&spellLevel=3&source=2014&compendiumId=dnd5e.spells&limit=20&offset=0
   */
  router.get('/search', async (req, res) => {
    try {
      const result = await socketClient.sendRequest('/api/compendium/search', {
        method: 'GET',
        query: req.query,
        headers: { 'x-api-key': req.apiKey }
      });

      res.json(result);
    } catch (error) {
      console.error('[CompendiumRouter] Error searching compendiums:', error.message);
      if (sendModuleRefusal(res, error)) return;
      // The module rejects bad input with error 'Validation Error'; the
      // socket client puts that in error.code.
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

  return router;
}
