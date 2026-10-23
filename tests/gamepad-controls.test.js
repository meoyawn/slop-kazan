import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, test } from 'node:test';
import { loadModule } from './helpers/module.js';

function harness() {
  const listeners = new Map(), input = {}, look = [], actions = [];
  const document = { activeElement: { tagName: 'BODY' }, hidden: false, hasFocus: () => true, addEventListener() {} };
  let pad = { connected: true, mapping: 'standard', index: 0, id: 'controller', axes: [0, 0, 0, 0],
    buttons: Array.from({ length: 17 }, () => ({ value: 0, pressed: false })) };
  const { GamepadControls } = loadModule(readFileSync(join(import.meta.dirname, '../js/gamepad-controls.js'), 'utf8'), {
    imports: { './kazan-config.js': { isTypingInField: (event) => event.target?.tagName === 'INPUT' } },
    globals: { document, navigator: { getGamepads: () => [pad] }, window: { addEventListener: (event, listener) => listeners.set(event, listener) } }
  });
  const controller = { activeMode: 'car', setGamepadInput: (key, value) => { input[key] = value; },
    clearGamepadInput() { for (const key of Object.keys(input)) input[key] = 0; } };
  const controls = new GamepadControls(controller, { applyGamepadInput: (...args) => look.push(args), resetOrbit() {} }, {
    onToggleMap: () => actions.push('map'), onCycleMode: (step) => actions.push(step)
  });
  return { controls, controller, document, input, look, actions, listeners, pad,
    disconnect() { pad = null; } };
}

describe('Gamepad controls', () => {
  test('all travel modes receive analog movement, camera look and their own trigger semantics; disconnect clears input', () => {
    const h = harness();
    h.controls.update(1 / 60);
    h.pad.axes = [0.5, -1, 0.75, -0.5]; h.pad.buttons[7].value = 0.8;
    for (const mode of ['person', 'car', 'cyclist', 'helicopter']) {
      h.controller.activeMode = mode;
      h.controls.update(1 / 60);
      assert.ok(h.input.forward > 0.7 && h.input.forward <= 1);
      assert.ok(h.input.right > 0.3 && h.input.right <= 1);
      assert.equal(h.input.up, mode === 'helicopter' ? 0.8 : 0);
      assert.ok(h.look.at(-1)[0] > 0 && h.look.at(-1)[1] < 0);
    }
    h.disconnect(); h.controls.update(1 / 60);
    assert.equal(h.input.forward, 0);
    assert.equal(h.input.up, 0);
  });

  test('held buttons cannot activate a fresh action on connection, and search and map focus suppress driving', () => {
    const h = harness();
    h.pad.buttons[9].pressed = true;
    h.controls.update(1 / 60);
    assert.deepEqual(h.actions, []);
    h.pad.buttons[9].pressed = false; h.controls.update(1 / 60);
    h.pad.buttons[9].pressed = true; h.controls.update(1 / 60);
    assert.deepEqual(h.actions, ['map']);
    h.pad.axes[1] = -1;
    h.controls.setEnabled(false); h.controls.update(1 / 60);
    assert.equal(h.input.forward || 0, 0);
    h.controls.setEnabled(true); h.document.activeElement.tagName = 'INPUT'; h.controls.update(1 / 60);
    assert.equal(h.input.forward || 0, 0);
    h.document.activeElement.tagName = 'BODY'; h.controls.update(1 / 60);
    assert.equal(h.input.forward, 1);
    h.listeners.get('blur')(); h.controls.update(1 / 60);
    assert.equal(h.input.forward, 0);
  });
});
