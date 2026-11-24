/**
 * FoundryVTT Authentication Handler
 * Manages login and session management for the bridge server to connect as an authenticated client
 */

import fetch from 'node-fetch';
import { EventEmitter } from 'events';

export class FoundryAuthenticator extends EventEmitter {
  constructor(options = {}) {
    super();
    
    this.foundryUrl = options.foundryUrl || 'http://localhost:30000';
    this.username = options.username;
    this.password = options.password;
    this.worldId = options.worldId;
    
    this.sessionCookie = null;
    this.userId = null;
    this.isAuthenticated = false;
  }

  /**
   * Authenticate with FoundryVTT
   */
  async authenticate() {
    console.log('[FoundryAuth] Authenticating with FoundryVTT...');
    
    try {
      // Step 1: Get the login page to obtain any CSRF tokens if needed
      const initialResponse = await fetch(`${this.foundryUrl}/join`, {
        method: 'GET',
        headers: {
          'User-Agent': 'FoundryVTT-Bridge-Server/1.0'
        }
      });

      // Extract any cookies from the initial response
      const setCookieHeader = initialResponse.headers.raw()['set-cookie'];
      let cookies = [];
      if (setCookieHeader) {
        cookies = setCookieHeader.map(cookie => cookie.split(';')[0]);
      }

      // Step 2: Perform the login
      // Note: The field should be 'userid' for the user ID, not username
      // We need to get the actual user ID for the bridge-server user
      const loginData = {
        userid: 'jq18NikEn5Pibt0u',  // bridge-server's user ID from the select dropdown
        password: this.password
      };
      
      // Use form-urlencoded format as FoundryVTT expects
      const loginBody = `userid=${encodeURIComponent(loginData.userid)}&password=${encodeURIComponent(loginData.password)}`;
      
      const loginResponse = await fetch(`${this.foundryUrl}/join`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Cookie': cookies.join('; '),
          'User-Agent': 'FoundryVTT-Bridge-Server/1.0'
        },
        body: loginBody,
        redirect: 'manual' // Don't follow redirects automatically
      });

      // Check if login was successful (200 with empty JSON response)
      if (loginResponse.status === 200) {
        // Extract session cookie - try different header access methods
        let newCookies = loginResponse.headers.raw()['set-cookie'];
        if (!newCookies) {
          newCookies = loginResponse.headers.get('set-cookie');
          if (newCookies) {
            newCookies = [newCookies];
          }
        }
        
        console.log('[FoundryAuth] Response headers:', Array.from(loginResponse.headers.entries()));
        console.log('[FoundryAuth] Set-Cookie headers:', newCookies);
        
        if (newCookies) {
          // Find the session cookie
          for (const cookie of newCookies) {
            if (cookie && cookie.includes('session=')) {
              this.sessionCookie = cookie.split(';')[0];
              break;
            }
          }
        }

        const responseText = await loginResponse.text();
        console.log('[FoundryAuth] Login response:', responseText);
        console.log('[FoundryAuth] Session cookie:', this.sessionCookie);
        
        // FoundryVTT returns {} or empty response on successful authentication
        if ((responseText === '{}' || responseText === '' || responseText.trim() === '{}') && this.sessionCookie) {
          this.isAuthenticated = true;
          console.log('[FoundryAuth] Authentication successful');
          console.log('[FoundryAuth] Session cookie obtained:', this.sessionCookie);
          
          // Set userId to the username (FoundryVTT uses username as userId for authentication)
          this.userId = this.username;
          
          return {
            success: true,
            sessionCookie: this.sessionCookie,
            userId: this.userId
          };
        } else {
          console.error('[FoundryAuth] Unexpected response:', responseText);
          throw new Error(`Login failed - unexpected response: ${responseText.substring(0, 100)}`);
        }
      }

      throw new Error(`Login failed with status ${loginResponse.status}`);
      
    } catch (error) {
      console.error('[FoundryAuth] Authentication error:', error.message);
      this.isAuthenticated = false;
      throw error;
    }
  }

  /**
   * Get user information after authentication
   */
  async getUserInfo() {
    if (!this.sessionCookie) {
      throw new Error('Not authenticated');
    }

    try {
      // Try to get user info from the game page
      const response = await fetch(`${this.foundryUrl}/game`, {
        headers: {
          'Cookie': this.sessionCookie,
          'User-Agent': 'FoundryVTT-Bridge-Server/1.0'
        }
      });

      if (response.ok) {
        const html = await response.text();
        
        // Extract user ID from the HTML/JavaScript
        const userIdMatch = html.match(/userId['"]\s*[:=]\s*['"]([^'"]+)['"]/);
        if (userIdMatch) {
          this.userId = userIdMatch[1];
          console.log('[FoundryAuth] User ID:', this.userId);
        }

        // Extract world info
        const worldMatch = html.match(/worldId['"]\s*[:=]\s*['"]([^'"]+)['"]/);
        if (worldMatch) {
          this.worldId = worldMatch[1];
          console.log('[FoundryAuth] World ID:', this.worldId);
        }
      }
    } catch (error) {
      console.warn('[FoundryAuth] Could not get user info:', error.message);
    }
  }

  /**
   * Get authentication headers for Socket.io connection
   */
  getSocketAuthOptions() {
    if (!this.isAuthenticated || !this.sessionCookie) {
      throw new Error('Not authenticated');
    }

    return {
      transportOptions: {
        polling: {
          extraHeaders: {
            'Cookie': this.sessionCookie,
            'User-Agent': 'FoundryVTT-Bridge-Server/1.0'
          }
        }
      },
      auth: {
        session: this.sessionCookie,
        userId: this.userId,
        worldId: this.worldId
      },
      withCredentials: true
    };
  }

  /**
   * Check if authentication is still valid
   */
  async validateSession() {
    if (!this.sessionCookie) {
      return false;
    }

    try {
      const response = await fetch(`${this.foundryUrl}/api/status`, {
        headers: {
          'Cookie': this.sessionCookie
        }
      });

      return response.ok;
    } catch (error) {
      console.error('[FoundryAuth] Session validation error:', error.message);
      return false;
    }
  }

  /**
   * Logout from FoundryVTT
   */
  async logout() {
    if (!this.sessionCookie) {
      return;
    }

    try {
      await fetch(`${this.foundryUrl}/logout`, {
        method: 'POST',
        headers: {
          'Cookie': this.sessionCookie
        }
      });

      this.sessionCookie = null;
      this.userId = null;
      this.isAuthenticated = false;
      
      console.log('[FoundryAuth] Logged out successfully');
    } catch (error) {
      console.error('[FoundryAuth] Logout error:', error.message);
    }
  }
}