/**
 * Comprehensive mock factories for FoundryVTT game objects
 * These mocks replicate the structure and behavior of actual FoundryVTT objects
 */

export class MockCollection {
  constructor(items = []) {
    this._items = new Map();
    items.forEach(item => this._items.set(item.id, item));
  }
  
  get contents() {
    return Array.from(this._items.values());
  }
  
  get(id) {
    return this._items.get(id) || null;
  }
  
  find(fn) {
    return this.contents.find(fn);
  }
  
  filter(fn) {
    return this.contents.filter(fn);
  }
  
  search(query) {
    const searchTerm = query.toLowerCase();
    return this.contents.filter(item => 
      item.name?.toLowerCase().includes(searchTerm)
    );
  }
  
  map(fn) {
    return this.contents.map(fn);
  }
  
  reduce(fn, initial) {
    return this.contents.reduce(fn, initial);
  }
  
  get size() {
    return this._items.size;
  }
}

export class MockActor {
  constructor(data = {}) {
    this.id = data.id || `actor-${Math.random().toString(36).substring(7)}`;
    this.name = data.name || 'Test Actor';
    this.type = data.type || 'character';
    this.img = data.img || 'icons/svg/mystery-man.svg';
    this.system = data.system || {
      attributes: {
        hp: { value: 10, max: 10, temp: 0 },
        ac: { value: 10 }
      },
      details: {
        level: { value: 1 },
        race: 'Human',
        class: 'Fighter'
      },
      abilities: {
        str: { value: 10, mod: 0 },
        dex: { value: 10, mod: 0 },
        con: { value: 10, mod: 0 },
        int: { value: 10, mod: 0 },
        wis: { value: 10, mod: 0 },
        cha: { value: 10, mod: 0 }
      }
    };
    this.items = new MockCollection(data.items || []);
    this.effects = new MockCollection(data.effects || []);
    this.folder = data.folder || null;
    this.permission = data.permission || { default: 0 };
    this.flags = data.flags || {};
  }
  
  toObject() {
    return {
      id: this.id,
      name: this.name,
      type: this.type,
      img: this.img,
      system: this.system,
      items: this.items.contents.map(i => i.toObject()),
      effects: this.effects.contents,
      folder: this.folder,
      permission: this.permission,
      flags: this.flags
    };
  }
  
  update(data) {
    Object.assign(this, data);
    return Promise.resolve(this);
  }
}

export class MockItem {
  constructor(data = {}) {
    this.id = data.id || `item-${Math.random().toString(36).substring(7)}`;
    this.name = data.name || 'Test Item';
    this.type = data.type || 'weapon';
    this.img = data.img || 'icons/svg/sword.svg';
    this.system = data.system || {
      description: { value: 'A test item' },
      quantity: 1,
      weight: 1,
      price: { value: 10, denomination: 'gp' },
      rarity: data.rarity || 'common',
      damage: { parts: [['1d6', 'slashing']] },
      range: { value: 5, long: null, units: 'ft' }
    };
    this.effects = new MockCollection(data.effects || []);
    this.folder = data.folder || null;
    this.sort = data.sort || 0;
    this.flags = data.flags || {};
  }
  
  toObject() {
    return {
      id: this.id,
      name: this.name,
      type: this.type,
      img: this.img,
      system: this.system,
      effects: this.effects.contents,
      folder: this.folder,
      sort: this.sort,
      flags: this.flags
    };
  }
  
  update(data) {
    Object.assign(this, data);
    return Promise.resolve(this);
  }
}

export class MockScene {
  constructor(data = {}) {
    this.id = data.id || `scene-${Math.random().toString(36).substring(7)}`;
    this.name = data.name || 'Test Scene';
    this.active = data.active || false;
    this.navigation = data.navigation !== undefined ? data.navigation : true;
    this.navOrder = data.navOrder || 0;
    this.img = data.img || null;
    this.foreground = data.foreground || null;
    this.thumb = data.thumb || null;
    this.width = data.width || 2000;
    this.height = data.height || 2000;
    this.padding = data.padding || 0.25;
    this.grid = data.grid || {
      type: 1, // Square grid
      size: 100,
      color: '#000000',
      alpha: 0.2
    };
    this.tokens = new MockCollection(data.tokens || []);
    this.tiles = new MockCollection(data.tiles || []);
    this.walls = new MockCollection(data.walls || []);
    this.lights = new MockCollection(data.lights || []);
    this.sounds = new MockCollection(data.sounds || []);
    this.templates = new MockCollection(data.templates || []);
    this.notes = new MockCollection(data.notes || []);
    this.flags = data.flags || {};
  }
  
  toObject() {
    return {
      id: this.id,
      name: this.name,
      active: this.active,
      navigation: this.navigation,
      navOrder: this.navOrder,
      img: this.img,
      foreground: this.foreground,
      thumb: this.thumb,
      width: this.width,
      height: this.height,
      padding: this.padding,
      grid: this.grid,
      tokens: this.tokens.contents,
      tiles: this.tiles.contents,
      walls: this.walls.contents,
      lights: this.lights.contents,
      sounds: this.sounds.contents,
      templates: this.templates.contents,
      notes: this.notes.contents,
      flags: this.flags
    };
  }
  
  update(data) {
    Object.assign(this, data);
    return Promise.resolve(this);
  }
  
  activate() {
    this.active = true;
    return Promise.resolve(this);
  }
}

export class MockCombat {
  constructor(data = {}) {
    this.id = data.id || `combat-${Math.random().toString(36).substring(7)}`;
    this.scene = data.scene || null;
    this.combatants = new MockCollection(data.combatants || []);
    this.active = data.active || false;
    this.round = data.round || 0;
    this.turn = data.turn || 0;
    this.sort = data.sort || 0;
    this.flags = data.flags || {};
  }
  
  get started() {
    return this.round > 0;
  }
  
  get current() {
    return {
      round: this.round,
      turn: this.turn,
      combatantId: this.combatants.contents[this.turn]?.id || null,
      tokenId: this.combatants.contents[this.turn]?.tokenId || null
    };
  }
  
  toObject() {
    return {
      id: this.id,
      scene: this.scene,
      combatants: this.combatants.contents,
      active: this.active,
      round: this.round,
      turn: this.turn,
      sort: this.sort,
      flags: this.flags
    };
  }
  
  startCombat() {
    this.round = 1;
    this.turn = 0;
    return Promise.resolve(this);
  }
  
  nextTurn() {
    this.turn++;
    if (this.turn >= this.combatants.size) {
      this.turn = 0;
      this.round++;
    }
    return Promise.resolve(this);
  }
}

export class MockUser {
  constructor(data = {}) {
    this.id = data.id || `user-${Math.random().toString(36).substring(7)}`;
    this.name = data.name || 'Test User';
    this.role = data.role || 4; // GM role
    this.active = data.active !== undefined ? data.active : true;
    this.avatar = data.avatar || null;
    this.character = data.character || null;
    this.color = data.color || '#000000';
    this.hotbar = data.hotbar || {};
    this.permissions = data.permissions || {};
    this.flags = data.flags || {};
  }
  
  get isGM() {
    return this.role >= 4;
  }
  
  hasRole(role) {
    return this.role >= role;
  }
  
  hasPermission(permission) {
    return this.isGM || this.permissions[permission];
  }
  
  toObject() {
    return {
      id: this.id,
      name: this.name,
      role: this.role,
      active: this.active,
      avatar: this.avatar,
      character: this.character,
      color: this.color,
      hotbar: this.hotbar,
      permissions: this.permissions,
      flags: this.flags
    };
  }
}

export class MockRoll {
  constructor(formula, data = {}) {
    this.formula = formula;
    this.data = data;
    this.terms = [];
    this.total = null;
    this.results = [];
    this._rolled = false;
  }
  
  async evaluate({ async = true } = {}) {
    if (this._rolled) return this;
    
    // Simple dice rolling simulation
    const match = this.formula.match(/(\d+)d(\d+)([+-]\d+)?/);
    if (match) {
      const [, num, sides, modifier] = match;
      const rolls = [];
      let total = 0;
      
      for (let i = 0; i < parseInt(num); i++) {
        const roll = Math.floor(Math.random() * parseInt(sides)) + 1;
        rolls.push(roll);
        total += roll;
      }
      
      if (modifier) {
        total += parseInt(modifier);
      }
      
      this.total = total;
      this.results = rolls;
    } else {
      // Try to evaluate as a simple expression
      try {
        this.total = eval(this.formula);
      } catch {
        this.total = 0;
      }
    }
    
    this._rolled = true;
    return this;
  }
  
  async roll() {
    return this.evaluate();
  }
  
  async toMessage(messageData = {}) {
    if (!this._rolled) await this.roll();
    
    return {
      id: `message-${Math.random().toString(36).substring(7)}`,
      type: 5, // ROLL type
      user: game.user?.id,
      speaker: messageData.speaker || {},
      content: `Rolled ${this.formula}: ${this.total}`,
      flavor: messageData.flavor || null,
      sound: messageData.sound || null,
      roll: this,
      ...messageData
    };
  }
  
  toJSON() {
    return {
      class: 'Roll',
      formula: this.formula,
      data: this.data,
      total: this.total,
      results: this.results
    };
  }
}

export class MockSocket {
  constructor() {
    this.listeners = new Map();
    this.connected = false;
  }
  
  on(event, handler) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, []);
    }
    this.listeners.get(event).push(handler);
  }
  
  off(event, handler) {
    if (this.listeners.has(event)) {
      const handlers = this.listeners.get(event);
      const index = handlers.indexOf(handler);
      if (index > -1) {
        handlers.splice(index, 1);
      }
    }
  }
  
  emit(event, data) {
    if (this.listeners.has(event)) {
      this.listeners.get(event).forEach(handler => {
        handler(data);
      });
    }
  }
  
  connect() {
    this.connected = true;
  }
  
  disconnect() {
    this.connected = false;
  }
}

// Factory functions for easy test data creation
export const createMockGame = (overrides = {}) => ({
  actors: new MockCollection(overrides.actors || []),
  items: new MockCollection(overrides.items || []),
  scenes: new MockCollection(overrides.scenes || []),
  combats: new MockCollection(overrides.combats || []),
  users: new MockCollection(overrides.users || [new MockUser()]),
  user: overrides.user || new MockUser({ isGM: true }),
  world: {
    title: 'Test World',
    system: 'dnd5e',
    version: '11.0.0',
    coreVersion: '11.0.0',
    ...overrides.world
  },
  settings: {
    register: jest.fn(),
    get: jest.fn(),
    set: jest.fn(),
    registerMenu: jest.fn()
  },
  socket: new MockSocket(),
  i18n: {
    localize: jest.fn((key) => key),
    format: jest.fn((key, data) => key)
  },
  ...overrides
});

export default {
  MockCollection,
  MockActor,
  MockItem,
  MockScene,
  MockCombat,
  MockUser,
  MockRoll,
  MockSocket,
  createMockGame
};