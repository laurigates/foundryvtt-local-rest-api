/**
 * Input Validation Schemas for Foundry Local REST API
 * Defines validation rules and sanitization for all API endpoints
 */

export class ValidationSchemas {
  constructor() {
    // Maximum limits to prevent abuse
    this.LIMITS = {
      MAX_QUERY_LENGTH: 100,
      MAX_RESULTS: 100,
      MAX_DICE_FORMULA_LENGTH: 50,
      MAX_REASON_LENGTH: 200,
      MAX_ID_LENGTH: 50,
      MAX_TYPE_LENGTH: 50
    };

    // Valid entity types
    this.VALID_TYPES = {
      actors: ['character', 'npc', 'vehicle', 'group'],
      items: [
        'weapon',
        'equipment',
        'consumable',
        'tool',
        'loot',
        'feature',
        'spell',
        'class',
        'backpack'
      ],
      scenes: ['scene'],
      dice: ['roll', 'damage', 'check', 'save']
    };

    // Dangerous patterns to block
    this.DANGEROUS_PATTERNS = {
      sql: /(\b(SELECT|INSERT|UPDATE|DELETE|DROP|UNION|ALTER|CREATE|EXEC|SCRIPT)\b|--|;|\||\/\*|\*\/)/gi,
      xss: /<[^>]*>|javascript:|on\w+\s*=|<script|<\/script>|<iframe|<embed|<object/gi,
      command: /(\||;|`|\$\(|&&|\|\||>>|<<|\\n|\\r)/g,
      path: /(\.\.\/|\.\.\\|%2e%2e|%252e|\.%2e|%2e\.)/gi,
      template: /(\{\{|\}\}|\$\{|\}|<%|%>)/g,
      // Control characters are the point of this pattern
      // eslint-disable-next-line no-control-regex
      unicode: /[\u0000-\u001F\u007F-\u009F\u200B-\u200F\u202A-\u202E\uFEFF]/g
    };
  }

  /**
   * Test a DANGEROUS_PATTERNS entry against a value.
   *
   * The patterns carry the `g` flag (sanitizeString also uses them with
   * replace), and RegExp#test on a global regex resumes from lastIndex left by
   * the previous call. Without the reset, a match moved lastIndex forward and
   * the next value checked against the same pattern could pass unchecked.
   */
  matchesPattern(pattern, value) {
    pattern.lastIndex = 0;
    return pattern.test(value);
  }

  /**
   * Validate and sanitize actor search parameters
   */
  validateActorSearch(params) {
    const errors = [];
    const sanitized = {};

    // Validate query
    if (params.query !== undefined) {
      const queryValidation = this.validateString(
        params.query,
        'query',
        this.LIMITS.MAX_QUERY_LENGTH
      );
      if (!queryValidation.valid) {
        errors.push(queryValidation.error);
      } else {
        sanitized.query = queryValidation.value;
      }
    }

    // Validate type
    if (params.type !== undefined) {
      const typeValidation = this.validateEnum(params.type, 'type', this.VALID_TYPES.actors);
      if (!typeValidation.valid) {
        errors.push(typeValidation.error);
      } else {
        sanitized.type = typeValidation.value;
      }
    }

    // Validate limit
    if (params.limit !== undefined) {
      const limitValidation = this.validateNumber(
        params.limit,
        'limit',
        1,
        this.LIMITS.MAX_RESULTS
      );
      if (!limitValidation.valid) {
        errors.push(limitValidation.error);
      } else {
        sanitized.limit = limitValidation.value;
      }
    } else {
      sanitized.limit = 50; // Default
    }

    return {
      valid: errors.length === 0,
      errors,
      data: sanitized
    };
  }

  /**
   * Validate and sanitize compendium search parameters
   * (GET /api/compendium/search). Values arrive from HTTP as strings.
   */
  validateCompendiumSearch(params) {
    const errors = [];
    const sanitized = {};

    const strings = {
      query: this.LIMITS.MAX_QUERY_LENGTH,
      packType: this.LIMITS.MAX_TYPE_LENGTH,
      itemType: this.LIMITS.MAX_TYPE_LENGTH,
      source: this.LIMITS.MAX_QUERY_LENGTH
    };
    for (const [field, maxLength] of Object.entries(strings)) {
      if (params[field] === undefined) continue;
      // Lenient sanitising applies to the search text only
      const validation = this.validateString(
        params[field],
        field === 'query' ? 'query' : field,
        maxLength
      );
      if (!validation.valid) {
        errors.push(validation.error);
      } else if (validation.value !== '') {
        sanitized[field] = validation.value;
      }
    }

    if (params.compendiumId !== undefined) {
      const idValidation = this.validateId(params.compendiumId, 'compendiumId');
      if (!idValidation.valid) {
        errors.push(idValidation.error);
      } else {
        sanitized.compendiumId = idValidation.value;
      }
    }

    if (params.spellLevel !== undefined) {
      const levelValidation = this.validateNumber(params.spellLevel, 'spellLevel', 0, 9);
      if (!levelValidation.valid) {
        errors.push(levelValidation.error);
      } else {
        sanitized.spellLevel = levelValidation.value;
      }
    }

    const paging = { limit: [1, this.LIMITS.MAX_RESULTS, 20], offset: [0, 100000, 0] };
    for (const [field, [min, max, fallback]] of Object.entries(paging)) {
      if (params[field] === undefined) {
        sanitized[field] = fallback;
        continue;
      }
      const validation = this.validateNumber(params[field], field, min, max);
      if (!validation.valid) {
        errors.push(validation.error);
      } else {
        sanitized[field] = validation.value;
      }
    }

    return {
      valid: errors.length === 0,
      errors,
      data: sanitized
    };
  }

  /**
   * Validate and sanitize dice roll parameters
   */
  validateDiceRoll(body) {
    const errors = [];
    const sanitized = {};

    // Formula is required
    if (!body.formula) {
      errors.push('Formula is required');
      return { valid: false, errors, data: {} };
    }

    // Validate formula
    const formulaValidation = this.validateDiceFormula(body.formula);
    if (!formulaValidation.valid) {
      errors.push(formulaValidation.error);
    } else {
      sanitized.formula = formulaValidation.value;
    }

    // Validate reason (optional)
    if (body.reason !== undefined) {
      const reasonValidation = this.validateString(
        body.reason,
        'reason',
        this.LIMITS.MAX_REASON_LENGTH
      );
      if (!reasonValidation.valid) {
        errors.push(reasonValidation.error);
      } else {
        sanitized.reason = this.sanitizeHTML(reasonValidation.value);
      }
    }

    // Validate advantage/disadvantage
    if (body.advantage !== undefined) {
      sanitized.advantage = Boolean(body.advantage);
    }
    if (body.disadvantage !== undefined) {
      sanitized.disadvantage = Boolean(body.disadvantage);
    }

    // Validate sendToChat
    if (body.sendToChat !== undefined) {
      sanitized.sendToChat = Boolean(body.sendToChat);
    }

    return {
      valid: errors.length === 0,
      errors,
      data: sanitized
    };
  }

  /**
   * Validate dice formula
   */
  validateDiceFormula(formula) {
    if (typeof formula !== 'string') {
      return { valid: false, error: 'Formula must be a string' };
    }

    if (formula.length > this.LIMITS.MAX_DICE_FORMULA_LENGTH) {
      return {
        valid: false,
        error: `Formula too long (max ${this.LIMITS.MAX_DICE_FORMULA_LENGTH} characters)`
      };
    }

    // Check for dangerous patterns
    for (const [name, pattern] of Object.entries(this.DANGEROUS_PATTERNS)) {
      if (this.matchesPattern(pattern, formula)) {
        return { valid: false, error: `Invalid formula: contains forbidden ${name} patterns` };
      }
    }

    // Allow only dice notation and basic math
    const validDicePattern = /^[0-9dDkKlLhH+\-*/() ]+$/;
    if (!validDicePattern.test(formula)) {
      return { valid: false, error: 'Invalid dice formula syntax' };
    }

    // Must contain at least one dice notation
    const hasDice = /\d*d\d+/i.test(formula);
    if (!hasDice && !/^\d+$/.test(formula)) {
      return {
        valid: false,
        error: 'Formula must contain dice notation (e.g., 1d20) or be a number'
      };
    }

    return { valid: true, value: formula.trim() };
  }

  /**
   * Validate entity ID
   */
  validateId(id, fieldName = 'id') {
    if (!id) {
      return { valid: false, error: `${fieldName} is required` };
    }

    if (typeof id !== 'string') {
      return { valid: false, error: `${fieldName} must be a string` };
    }

    if (id.length > this.LIMITS.MAX_ID_LENGTH) {
      return {
        valid: false,
        error: `${fieldName} too long (max ${this.LIMITS.MAX_ID_LENGTH} characters)`
      };
    }

    // Check for path traversal attempts
    if (this.matchesPattern(this.DANGEROUS_PATTERNS.path, id)) {
      return { valid: false, error: `Invalid ${fieldName}: contains path traversal patterns` };
    }

    // Check for injection attempts
    if (
      this.matchesPattern(this.DANGEROUS_PATTERNS.sql, id) ||
      this.matchesPattern(this.DANGEROUS_PATTERNS.command, id)
    ) {
      return { valid: false, error: `Invalid ${fieldName}: contains forbidden characters` };
    }

    // FoundryVTT IDs are typically alphanumeric with some special chars
    const validIdPattern = /^[a-zA-Z0-9_\-.]+$/;
    if (!validIdPattern.test(id)) {
      return { valid: false, error: `Invalid ${fieldName} format` };
    }

    return { valid: true, value: id };
  }

  /**
   * Validate string input
   */
  validateString(value, fieldName, maxLength) {
    if (value === undefined || value === null) {
      return { valid: true, value: '' };
    }

    if (typeof value !== 'string') {
      return { valid: false, error: `${fieldName} must be a string` };
    }

    if (value.length > maxLength) {
      return { valid: false, error: `${fieldName} too long (max ${maxLength} characters)` };
    }

    // Remove dangerous Unicode characters
    let sanitized = value.replace(this.DANGEROUS_PATTERNS.unicode, '');

    // Check for injection attempts
    for (const [name, pattern] of Object.entries(this.DANGEROUS_PATTERNS)) {
      if (this.matchesPattern(pattern, sanitized)) {
        // For search queries, we can be more lenient and just sanitize
        if (fieldName === 'query' && name !== 'xss') {
          sanitized = sanitized.replace(pattern, '');
        } else {
          return { valid: false, error: `${fieldName} contains forbidden ${name} patterns` };
        }
      }
    }

    return { valid: true, value: sanitized.trim() };
  }

  /**
   * Validate number input
   */
  validateNumber(value, fieldName, min, max) {
    if (value === undefined || value === null) {
      return { valid: false, error: `${fieldName} is required` };
    }

    let num;
    if (typeof value === 'string') {
      num = parseInt(value, 10);
    } else if (typeof value === 'number') {
      num = value;
    } else {
      return { valid: false, error: `${fieldName} must be a number` };
    }

    if (isNaN(num)) {
      return { valid: false, error: `${fieldName} must be a valid number` };
    }

    if (!isFinite(num)) {
      return { valid: false, error: `${fieldName} must be finite` };
    }

    if (num < min) {
      return { valid: false, error: `${fieldName} must be at least ${min}` };
    }

    if (num > max) {
      return { valid: false, error: `${fieldName} must be at most ${max}` };
    }

    // Check for integer overflow
    if (num > Number.MAX_SAFE_INTEGER || num < Number.MIN_SAFE_INTEGER) {
      return { valid: false, error: `${fieldName} exceeds safe integer range` };
    }

    return { valid: true, value: Math.floor(num) };
  }

  /**
   * Validate enum value
   */
  validateEnum(value, fieldName, validValues) {
    if (!value) {
      return { valid: true, value: null };
    }

    if (typeof value !== 'string') {
      return { valid: false, error: `${fieldName} must be a string` };
    }

    const sanitized = value.toLowerCase().trim();

    if (!validValues.includes(sanitized)) {
      return {
        valid: false,
        error: `Invalid ${fieldName}. Must be one of: ${validValues.join(', ')}`
      };
    }

    return { valid: true, value: sanitized };
  }

  /**
   * Validate boolean value
   */
  validateBoolean(value, fieldName) {
    if (value === undefined || value === null) {
      return { valid: true, value: false };
    }

    if (typeof value === 'boolean') {
      return { valid: true, value };
    }

    if (typeof value === 'string') {
      const lower = value.toLowerCase();
      if (lower === 'true' || lower === '1') {
        return { valid: true, value: true };
      }
      if (lower === 'false' || lower === '0') {
        return { valid: true, value: false };
      }
    }

    if (typeof value === 'number') {
      return { valid: true, value: Boolean(value) };
    }

    return { valid: false, error: `${fieldName} must be a boolean` };
  }

  /**
   * Sanitize HTML content
   */
  sanitizeHTML(html) {
    if (!html) return '';

    // Remove script tags and event handlers
    let sanitized = html.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');
    sanitized = sanitized.replace(/on\w+\s*=/gi, '');
    sanitized = sanitized.replace(/javascript:/gi, '');

    // Escape remaining HTML entities
    sanitized = sanitized
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#x27;');

    return sanitized;
  }

  /**
   * Validate object against schema
   */
  validateObject(obj, schema) {
    const errors = [];
    const sanitized = {};

    for (const [field, rules] of Object.entries(schema)) {
      const value = obj[field];

      // Check required fields
      if (rules.required && (value === undefined || value === null)) {
        errors.push(`${field} is required`);
        continue;
      }

      // Skip optional undefined fields
      if (!rules.required && (value === undefined || value === null)) {
        continue;
      }

      // Validate by type
      let validation;
      switch (rules.type) {
        case 'string':
          validation = this.validateString(value, field, rules.maxLength || 100);
          break;
        case 'number':
          validation = this.validateNumber(value, field, rules.min || 0, rules.max || 1000);
          break;
        case 'boolean':
          validation = this.validateBoolean(value, field);
          break;
        case 'enum':
          validation = this.validateEnum(value, field, rules.values || []);
          break;
        case 'id':
          validation = this.validateId(value, field);
          break;
        default:
          errors.push(`Unknown validation type for ${field}`);
          continue;
      }

      if (!validation.valid) {
        errors.push(validation.error);
      } else {
        sanitized[field] = validation.value;
      }
    }

    return {
      valid: errors.length === 0,
      errors,
      data: sanitized
    };
  }

  /**
   * Check for prototype pollution attempts
   */
  checkPrototypePollution(obj) {
    const dangerous = ['__proto__', 'constructor', 'prototype'];

    const check = (item, path = '') => {
      if (typeof item !== 'object' || item === null) {
        return false;
      }

      for (const key in item) {
        if (dangerous.includes(key)) {
          return true;
        }

        if (typeof item[key] === 'object' && item[key] !== null) {
          if (check(item[key], `${path}.${key}`)) {
            return true;
          }
        }
      }

      return false;
    };

    return check(obj);
  }

  /**
   * Create validation middleware
   */
  createValidator(schema) {
    return (params, body) => {
      // Check for prototype pollution
      if (this.checkPrototypePollution(params) || this.checkPrototypePollution(body)) {
        return {
          valid: false,
          errors: ['Invalid request: prototype pollution detected'],
          data: {}
        };
      }

      // Merge params and body for validation
      const input = { ...params, ...body };

      return this.validateObject(input, schema);
    };
  }
}
