/**
 * Permission Validation System for Foundry Local REST API
 * Implements FoundryVTT's tiered permission system with document-level access control
 */

export class PermissionValidator {
  constructor() {
    // FoundryVTT User Roles
    this.USER_ROLES = {
      NONE: 0,
      PLAYER: 1,
      TRUSTED: 2,
      ASSISTANT: 3,
      GAMEMASTER: 4
    };

    // Document Permission Levels  
    this.DOCUMENT_PERMISSIONS = {
      NONE: 0,
      LIMITED: 1,
      OBSERVER: 2,
      OWNER: 3
    };

    // Operation Permission Requirements
    this.OPERATION_PERMISSIONS = {
      read: this.DOCUMENT_PERMISSIONS.LIMITED,
      update: this.DOCUMENT_PERMISSIONS.OWNER,
      delete: this.DOCUMENT_PERMISSIONS.OWNER,
      create: this.USER_ROLES.PLAYER // Minimum role to create
    };
  }

  /**
   * Validate user permission for a document operation
   * @param {Object} user - The user making the request
   * @param {Object} document - The document being accessed
   * @param {string} operation - The operation (read, update, delete)
   * @returns {Object} Validation result with success and message
   */
  validateDocumentPermission(user, document, operation) {
    if (!user || !document) {
      return {
        success: false,
        error: 'Invalid Request',
        message: 'User or document not found'
      };
    }

    // GameMasters bypass all permission checks
    if (user.isGM || user.role >= this.USER_ROLES.GAMEMASTER) {
      return { success: true };
    }

    // Check if user has minimum role for operation
    if (!this.hasMinimumRole(user, operation)) {
      return {
        success: false,
        error: 'Forbidden',
        message: `Insufficient role for ${operation} operation`
      };
    }

    // Use FoundryVTT's built-in permission checking if available
    if (document.canUserModify && typeof document.canUserModify === 'function') {
      const canModify = document.canUserModify(user, operation);
      if (!canModify) {
        return {
          success: false,
          error: 'Forbidden',
          message: `You do not have permission to ${operation} this ${document.documentName || 'document'}`
        };
      }
      return { success: true };
    }

    // Fallback to ownership checking
    const permissionLevel = this.getDocumentPermissionLevel(user, document);
    const requiredLevel = this.OPERATION_PERMISSIONS[operation] || this.DOCUMENT_PERMISSIONS.OBSERVER;

    if (permissionLevel < requiredLevel) {
      return {
        success: false,
        error: 'Forbidden',
        message: `Insufficient permissions for ${operation} operation on this ${document.documentName || 'document'}`
      };
    }

    return { success: true };
  }

  /**
   * Get the permission level a user has for a document
   * @param {Object} user - The user
   * @param {Object} document - The document
   * @returns {number} Permission level
   */
  getDocumentPermissionLevel(user, document) {
    if (!document.ownership) {
      // If no ownership data, check if user owns it
      return document.user === user.id ? 
        this.DOCUMENT_PERMISSIONS.OWNER : 
        this.DOCUMENT_PERMISSIONS.NONE;
    }

    // Check specific user permission
    if (user.id in document.ownership) {
      return document.ownership[user.id];
    }

    // Fall back to default permission
    return document.ownership.default || this.DOCUMENT_PERMISSIONS.NONE;
  }

  /**
   * Check if user has minimum role for operation
   * @param {Object} user - The user
   * @param {string} operation - The operation
   * @returns {boolean} Whether user has minimum role
   */
  hasMinimumRole(user, operation) {
    const minimumRoles = {
      read: this.USER_ROLES.NONE, // Anyone can attempt to read (document permissions still apply)
      create: this.USER_ROLES.PLAYER,
      update: this.USER_ROLES.PLAYER,
      delete: this.USER_ROLES.PLAYER,
      roll: this.USER_ROLES.PLAYER, // Dice rolling
      chat: this.USER_ROLES.PLAYER  // Chat messages
    };

    const requiredRole = minimumRoles[operation] || this.USER_ROLES.PLAYER;
    return user.role >= requiredRole;
  }

  /**
   * Validate user role for system operations
   * @param {Object} user - The user
   * @param {string} operation - System operation
   * @returns {Object} Validation result
   */
  validateSystemPermission(user, operation) {
    if (!user) {
      return {
        success: false,
        error: 'Unauthorized',
        message: 'User not authenticated'
      };
    }

    const systemPermissions = {
      'world.info': this.USER_ROLES.PLAYER,
      'scenes.current': this.USER_ROLES.PLAYER,
      'scenes.list': this.USER_ROLES.TRUSTED,
      'scenes.modify': this.USER_ROLES.ASSISTANT,
      'system.settings': this.USER_ROLES.GAMEMASTER,
      'diagnostics.logs': this.USER_ROLES.ASSISTANT,
      'diagnostics.health': this.USER_ROLES.TRUSTED
    };

    const requiredRole = systemPermissions[operation] || this.USER_ROLES.PLAYER;

    if (user.role < requiredRole) {
      return {
        success: false,
        error: 'Forbidden',
        message: `Operation '${operation}' requires ${this.getRoleName(requiredRole)} role or higher`
      };
    }

    return { success: true };
  }

  /**
   * Filter collection based on user permissions
   * @param {Object} user - The user
   * @param {Array|Map} collection - Collection of documents
   * @param {string} operation - The operation (usually 'read')
   * @returns {Array} Filtered collection
   */
  filterByPermission(user, collection, operation = 'read') {
    const items = Array.from(collection.values ? collection.values() : collection);
    
    // GMs see everything
    if (user.isGM) {
      return items;
    }

    return items.filter(item => {
      const permission = this.validateDocumentPermission(user, item, operation);
      return permission.success;
    });
  }

  /**
   * Sanitize document data based on user permissions
   * @param {Object} user - The user
   * @param {Object} document - The document
   * @param {Object} data - The data to sanitize
   * @returns {Object} Sanitized data
   */
  sanitizeDocumentData(user, document, data) {
    if (user.isGM) {
      return data; // GMs see all data
    }

    const permissionLevel = this.getDocumentPermissionLevel(user, document);
    
    // Remove sensitive fields based on permission level
    const sanitized = { ...data };

    if (permissionLevel < this.DOCUMENT_PERMISSIONS.OWNER) {
      // Remove ownership data from non-owners
      delete sanitized.ownership;
      delete sanitized.permission;
    }

    if (permissionLevel < this.DOCUMENT_PERMISSIONS.OBSERVER) {
      // Remove detailed system data from limited users
      delete sanitized.flags;
      delete sanitized.effects;
      
      // Limit system data
      if (sanitized.system) {
        sanitized.system = this.sanitizeSystemData(sanitized.system, permissionLevel);
      }
    }

    if (permissionLevel === this.DOCUMENT_PERMISSIONS.NONE) {
      // Return only public information
      return {
        id: sanitized.id,
        name: sanitized.name,
        type: sanitized.type,
        img: sanitized.img
      };
    }

    return sanitized;
  }

  /**
   * Sanitize system data based on permission level
   * @param {Object} system - System data
   * @param {number} permissionLevel - Permission level
   * @returns {Object} Sanitized system data
   */
  sanitizeSystemData(system, permissionLevel) {
    if (permissionLevel >= this.DOCUMENT_PERMISSIONS.OBSERVER) {
      return system;
    }

    // For limited permission, return only basic visible stats
    const publicData = {};
    
    // Common visible attributes
    const visiblePaths = [
      'attributes.hp',
      'attributes.ac',
      'details.level',
      'details.cr',
      'details.type',
      'details.source'
    ];

    for (const path of visiblePaths) {
      const value = this.getNestedProperty(system, path);
      if (value !== undefined) {
        this.setNestedProperty(publicData, path, value);
      }
    }

    return publicData;
  }

  /**
   * Validate that user can perform bulk operations
   * @param {Object} user - The user
   * @param {Array} documents - Array of documents
   * @param {string} operation - The operation
   * @returns {Object} Validation result with failed items
   */
  validateBulkPermission(user, documents, operation) {
    const results = {
      success: true,
      allowed: [],
      denied: []
    };

    for (const doc of documents) {
      const permission = this.validateDocumentPermission(user, doc, operation);
      if (permission.success) {
        results.allowed.push(doc.id);
      } else {
        results.denied.push({ id: doc.id, reason: permission.message });
        results.success = false;
      }
    }

    if (!results.success) {
      results.error = 'Forbidden';
      results.message = `Permission denied for ${results.denied.length} items`;
    }

    return results;
  }

  /**
   * Get human-readable role name
   * @param {number} role - Role level
   * @returns {string} Role name
   */
  getRoleName(role) {
    const roleNames = {
      0: 'None',
      1: 'Player',
      2: 'Trusted Player',
      3: 'Assistant GM',
      4: 'Game Master'
    };
    return roleNames[role] || 'Unknown';
  }

  /**
   * Get nested property from object
   * @param {Object} obj - The object
   * @param {string} path - Property path (e.g., 'attributes.hp.value')
   * @returns {*} Property value
   */
  getNestedProperty(obj, path) {
    return path.split('.').reduce((curr, prop) => curr?.[prop], obj);
  }

  /**
   * Set nested property on object
   * @param {Object} obj - The object
   * @param {string} path - Property path
   * @param {*} value - Value to set
   */
  setNestedProperty(obj, path, value) {
    const parts = path.split('.');
    const last = parts.pop();
    const target = parts.reduce((curr, prop) => {
      if (!curr[prop]) curr[prop] = {};
      return curr[prop];
    }, obj);
    target[last] = value;
  }

  /**
   * Check if operation would modify permissions
   * @param {Object} updates - Proposed updates
   * @returns {boolean} Whether updates would modify permissions
   */
  wouldModifyPermissions(updates) {
    const sensitiveFields = ['ownership', 'permission', 'permissions', 'role', 'isGM'];
    
    for (const field of sensitiveFields) {
      if (field in updates) {
        return true;
      }
    }

    // Check for nested permission modifications
    if (updates.system?.permissions || updates.data?.permission) {
      return true;
    }

    return false;
  }

  /**
   * Validate permission modification attempt
   * @param {Object} user - User attempting modification
   * @param {Object} document - Document being modified
   * @param {Object} updates - Proposed updates
   * @returns {Object} Validation result
   */
  validatePermissionModification(user, document, updates) {
    // Only owners and GMs can modify permissions
    if (!user.isGM && this.getDocumentPermissionLevel(user, document) < this.DOCUMENT_PERMISSIONS.OWNER) {
      return {
        success: false,
        error: 'Forbidden',
        message: 'Only document owners and GMs can modify permissions'
      };
    }

    // Prevent privilege escalation
    if (!user.isGM && updates.ownership) {
      for (const level of Object.values(updates.ownership)) {
        if (level > this.DOCUMENT_PERMISSIONS.OWNER) {
          return {
            success: false,
            error: 'Forbidden',
            message: 'Cannot grant permissions higher than Owner level'
          };
        }
      }
    }

    return { success: true };
  }
}