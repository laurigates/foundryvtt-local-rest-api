// Global test setup for FoundryVTT module tests
// Mock FoundryVTT global objects

// Jest is already available globally in the test environment

// Mock game object
global.game = {
  actors: {
    contents: [],
    get: jest.fn(),
    search: jest.fn()
  },
  items: {
    contents: [],
    get: jest.fn(),
    search: jest.fn()
  },
  scenes: {
    contents: [],
    get: jest.fn(),
    active: null,
    viewed: null
  },
  world: {
    title: 'Test World',
    system: 'dnd5e',
    version: '11.0.0',
    coreVersion: '11.0.0'
  },
  users: {
    current: {
      id: 'test-user-id',
      name: 'Test User',
      isGM: true
    }
  },
  settings: {
    register: jest.fn(),
    get: jest.fn(),
    set: jest.fn(),
    registerMenu: jest.fn()
  },
  socket: {
    on: jest.fn(),
    emit: jest.fn(),
    off: jest.fn()
  },
  combat: null,
  combats: {
    active: null
  },
  i18n: {
    localize: jest.fn((key) => key),
    format: jest.fn((key, data) => key)
  }
};

// Mock CONFIG object
global.CONFIG = {
  debug: {
    hooks: false
  },
  foundryvtt_local_rest_api: {
    queryHandlers: {}
  }
};

// Mock USER constants
global.USER = {
  PERMISSIONS: {
    NONE: 0,
    PLAYER: 1,
    TRUSTED: 2,
    ASSISTANT: 3,
    GM: 4
  }
};

// Mock Hooks system
global.Hooks = {
  on: jest.fn(),
  once: jest.fn(),
  call: jest.fn(),
  callAll: jest.fn(),
  off: jest.fn()
};

// Mock ui object
global.ui = {
  notifications: {
    error: jest.fn((message) => console.error('Notification Error:', message)),
    warn: jest.fn((message) => console.warn('Notification Warning:', message)),
    info: jest.fn((message) => console.info('Notification Info:', message)),
    notify: jest.fn()
  }
};

// Mock Roll class
global.Roll = class Roll {
  constructor(formula, data = {}) {
    this.formula = formula;
    this.data = data;
    this.total = null;
    this.dice = [];
    this.terms = [];
  }
  
  // Roll#evaluate is the API the module calls; roll() is kept for older tests
  async evaluate() {
    return this.roll();
  }

  async roll() {
    // Simple mock roll implementation
    this.total = Math.floor(Math.random() * 20) + 1;
    return this;
  }
  
  async toMessage(options = {}) {
    return {
      id: 'mock-message-id',
      content: `Rolled ${this.formula}: ${this.total}`,
      ...options
    };
  }
};

// Mock ChatMessage class
global.ChatMessage = class ChatMessage {
  static async create(data) {
    return {
      id: 'mock-chat-message-id',
      ...data
    };
  }
};

// Mock FormApplication class
global.FormApplication = class FormApplication {
  constructor(object, options) {
    this.object = object;
    this.options = options;
  }
  
  static get defaultOptions() {
    return {
      classes: ['form'],
      width: 400,
      height: 'auto'
    };
  }
  
  render(force = false) {
    return this;
  }
  
  close() {
    return Promise.resolve();
  }
};

// Test utilities
global.mockFoundryData = {
  createActor: (overrides = {}) => ({
    id: 'actor-' + Math.random().toString(36).substring(7),
    name: 'Test Actor',
    type: 'character',
    system: {
      attributes: {
        hp: { value: 10, max: 10 }
      }
    },
    ...overrides
  }),
  
  createItem: (overrides = {}) => ({
    id: 'item-' + Math.random().toString(36).substring(7),
    name: 'Test Item',
    type: 'weapon',
    system: {
      damage: '1d6',
      rarity: 'common'
    },
    ...overrides
  }),
  
  createScene: (overrides = {}) => ({
    id: 'scene-' + Math.random().toString(36).substring(7),
    name: 'Test Scene',
    active: false,
    navigation: true,
    ...overrides
  })
};

// Clean up after all tests
afterAll(() => {
  jest.clearAllMocks();
});