/**
 * Dice route against the v14 dice API.
 *
 * Doubles follow the public API docs: term classes under foundry.dice.terms,
 * Roll#evaluate() with no `async` option, Roll#toMessage(messageData).
 * The v13-era globals Die/NumericTerm/OperatorTerm and
 * CONST.CHAT_MESSAGE_TYPES are deliberately absent, as they are in v14.
 */

import { DiceAPI } from '../../scripts/routes/dice.js';

class FakeDie {
  constructor({ number, faces, results }) {
    this.number = number;
    this.faces = faces;
    this.results = results;
    this.total = results.filter((r) => r.active).reduce((s, r) => s + r.result, 0);
    this.modifiers = [];
  }
}
class FakeNumericTerm {
  constructor(n) {
    this.number = n;
    this.total = n;
  }
}
class FakeOperatorTerm {
  constructor(op) {
    this.operator = op;
  }
}

function makeRoll(formula) {
  const die = new FakeDie({ number: 1, faces: 20, results: [{ result: 20, active: true }] });
  return {
    formula,
    total: 25,
    terms: [die, new FakeOperatorTerm('+'), new FakeNumericTerm(5)],
    dice: [die],
    evaluate: jest.fn(async function () {
      return this;
    }),
    toMessage: jest.fn(async () => ({}))
  };
}

function mockRes() {
  const res = { statusCode: 200, body: null };
  res.status = jest.fn((code) => {
    res.statusCode = code;
    return res;
  });
  res.json = jest.fn((body) => {
    res.body = body;
    return res;
  });
  return res;
}

describe('DiceAPI on v14', () => {
  let savedGlobals;
  let lastRoll;

  beforeEach(() => {
    savedGlobals = {
      foundry: global.foundry,
      Roll: global.Roll,
      Die: global.Die,
      NumericTerm: global.NumericTerm,
      OperatorTerm: global.OperatorTerm,
      CONST: global.CONST
    };
    global.foundry = {
      dice: {
        terms: { Die: FakeDie, NumericTerm: FakeNumericTerm, OperatorTerm: FakeOperatorTerm }
      }
    };
    global.Roll = jest.fn((formula) => {
      lastRoll = makeRoll(formula);
      return lastRoll;
    });
    delete global.Die;
    delete global.NumericTerm;
    delete global.OperatorTerm;
    global.CONST = {}; // no CHAT_MESSAGE_TYPES in v14
  });

  afterEach(() => {
    Object.assign(global, savedGlobals);
  });

  test('evaluates without the removed async option and classifies terms', async () => {
    const res = mockRes();
    await new DiceAPI().rollDice({ body: { formula: '1d20+5' } }, res);

    expect(res.statusCode).toBe(200);
    expect(lastRoll.evaluate).toHaveBeenCalledWith();
    expect(res.body.success).toBe(true);
    expect(res.body.data.total).toBe(25);
    expect(res.body.data.terms.map((t) => t.type)).toEqual(['die', 'operator', 'number']);
    expect(res.body.data.critical).toEqual({ success: true, failure: false, naturalRolls: [20] });
  });

  test('posts to chat through Roll#toMessage', async () => {
    const res = mockRes();
    await new DiceAPI().rollDice(
      { body: { formula: '1d20+5', reason: 'Attack', sendToChat: true } },
      res
    );

    expect(res.statusCode).toBe(200);
    expect(lastRoll.toMessage).toHaveBeenCalledWith({ flavor: '1d20+5 - Attack' });
  });

  test('does not post to chat unless asked', async () => {
    const res = mockRes();
    await new DiceAPI().rollDice({ body: { formula: '1d20' } }, res);
    expect(lastRoll.toMessage).not.toHaveBeenCalled();
  });
});
