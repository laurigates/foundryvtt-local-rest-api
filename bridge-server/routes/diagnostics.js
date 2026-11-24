/**
 * Diagnostics API routes for the bridge server
 * Forwards diagnostic requests to FoundryVTT module via socket.io
 */

import { Router } from 'express';

export function createDiagnosticsRouter(socketClient) {
  const router = Router();

  /**
   * Get recent logs
   * GET /api/diagnostics/logs?limit=100&level=error
   */
  router.get('/logs', async (req, res) => {
    try {
      const result = await socketClient.sendRequest('/api/diagnostics/logs', {
        method: 'GET',
        query: req.query,
        headers: { 'x-api-key': req.apiKey }
      });

      res.json(result);
    } catch (error) {
      console.error('[DiagnosticsRouter] Error getting logs:', error.message);
      res.status(500).json({
        success: false,
        error: 'Internal Server Error',
        message: 'Failed to communicate with FoundryVTT server'
      });
    }
  });

  /**
   * Search logs
   * GET /api/diagnostics/search?query=error&level=error&limit=50
   */
  router.get('/search', async (req, res) => {
    try {
      const result = await socketClient.sendRequest('/api/diagnostics/search', {
        method: 'GET',
        query: req.query,
        headers: { 'x-api-key': req.apiKey }
      });

      res.json(result);
    } catch (error) {
      console.error('[DiagnosticsRouter] Error searching logs:', error.message);
      res.status(500).json({
        success: false,
        error: 'Internal Server Error',
        message: 'Failed to communicate with FoundryVTT server'
      });
    }
  });

  /**
   * Get system health information
   * GET /api/diagnostics/health
   */
  router.get('/health', async (req, res) => {
    try {
      const result = await socketClient.sendRequest('/api/diagnostics/health', {
        method: 'GET',
        headers: { 'x-api-key': req.apiKey }
      });

      res.json(result);
    } catch (error) {
      console.error('[DiagnosticsRouter] Error getting health info:', error.message);
      res.status(500).json({
        success: false,
        error: 'Internal Server Error',
        message: 'Failed to communicate with FoundryVTT server'
      });
    }
  });

  /**
   * Diagnose errors
   * GET /api/diagnostics/errors?hours=24&severity=error
   */
  router.get('/errors', async (req, res) => {
    try {
      const result = await socketClient.sendRequest('/api/diagnostics/errors', {
        method: 'GET',
        query: req.query,
        headers: { 'x-api-key': req.apiKey }
      });

      res.json(result);
    } catch (error) {
      console.error('[DiagnosticsRouter] Error diagnosing errors:', error.message);
      res.status(500).json({
        success: false,
        error: 'Internal Server Error',
        message: 'Failed to communicate with FoundryVTT server'
      });
    }
  });

  /**
   * Get detailed connection diagnostics
   * GET /api/diagnostics/connection
   * 
   * Returns comprehensive diagnostics about the Socket.io connection to FoundryVTT,
   * including error history, troubleshooting suggestions, and connection statistics
   */
  router.get('/connection', async (req, res) => {
    try {
      const diagnostics = socketClient.getConnectionDiagnostics();
      const suggestions = socketClient.getTroubleshootingSuggestions();
      
      res.json({
        success: true,
        timestamp: new Date().toISOString(),
        connection: diagnostics,
        troubleshooting: {
          suggestions,
          hasErrors: diagnostics.errorHistory.length > 0,
          requiresAction: !diagnostics.status.connected && diagnostics.statistics.connectionAttempts > 0
        },
        quickCheck: {
          foundryReachable: diagnostics.status.connected,
          apiKeyConfigured: diagnostics.configuration.apiKeyConfigured,
          recentErrors: diagnostics.errorHistory.length,
          pendingRequests: diagnostics.statistics.pendingRequests
        }
      });
    } catch (error) {
      console.error('[DiagnosticsRouter] Error getting connection diagnostics:', error.message);
      
      // Even if there's an error, try to return useful information
      res.status(500).json({
        success: false,
        error: 'Diagnostic Error',
        message: error.message,
        basicStatus: {
          connected: socketClient.isConnected || false,
          foundryUrl: socketClient.foundryUrl || 'unknown',
          lastError: socketClient.lastError || null
        }
      });
    }
  });

  return router;
}