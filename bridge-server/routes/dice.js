/**
 * Dice API routes for the bridge server
 * Forwards dice rolling requests to FoundryVTT module via socket.io
 */

import { Router } from 'express';

export function createDiceRouter(socketClient) {
  const router = Router();

  /**
   * Roll dice using FoundryVTT's native system
   * POST /api/dice/roll
   * Body: { formula: "1d20+5", reason: "Attack roll", advantage: false, disadvantage: false, sendToChat: false }
   */
  router.post('/roll', async (req, res) => {
    try {
      // Validate request body
      const { formula, reason, advantage, disadvantage, sendToChat } = req.body;

      if (!formula) {
        return res.status(400).json({
          success: false,
          error: 'Bad Request',
          message: 'Formula is required in request body'
        });
      }

      // Basic validation of dice formula (before sending to FoundryVTT)
      if (typeof formula !== 'string' || formula.trim().length === 0) {
        return res.status(400).json({
          success: false,
          error: 'Invalid Formula',
          message: 'Formula must be a non-empty string'
        });
      }

      const result = await socketClient.sendRequest('/api/dice/roll', {
        method: 'POST',
        body: {
          formula: formula.trim(),
          reason: reason || null,
          advantage: Boolean(advantage),
          disadvantage: Boolean(disadvantage),
          sendToChat: Boolean(sendToChat)
        },
        headers: { 'x-api-key': req.apiKey }
      });

      res.json(result);
    } catch (error) {
      console.error('[DiceRouter] Error rolling dice:', error.message);
      
      // Handle specific dice rolling errors
      if (error.message.includes('Invalid Formula') || error.message.includes('Bad Request')) {
        res.status(400).json({
          success: false,
          error: 'Invalid Dice Formula',
          message: error.message
        });
      } else if (error.message.includes('Roll Error')) {
        res.status(400).json({
          success: false,
          error: 'Roll Error',
          message: 'Failed to evaluate dice formula. Check syntax and try again.'
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