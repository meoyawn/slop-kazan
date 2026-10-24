import { runCityModule } from './helpers/module.js';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test, describe } from 'node:test';
import vm from 'node:vm';

const source = readFileSync(join(import.meta.dirname, '../js/touch-controls.js'), 'utf8');
const controllerSource = readFileSync(join(import.meta.dirname, '../js/controllers.js'), 'utf8');

function element(attributes = {}) {
  const listeners = new Map();
  const classes = new Set();
  const captures = new Set();
  const styles = new Map();
  return {
    hidden: false,
    textContent: '',
    classList: {
      add: (name) => classes.add(name),
      remove: (name) => classes.delete(name),
      contains: (name) => classes.has(name),
      toggle(name, force) { if (force) classes.add(name); else classes.delete(name); }
    },
    style: { setProperty: (name, value) => styles.set(name, value), getPropertyValue: (name) => styles.get(name) },
    getAttribute: (name) => attributes[name],
    setAttribute: (name, value) => { attributes[name] = value; },
    addEventListener(type, listener) {
      if (!listeners.has(type)) listeners.set(type, []);
      listeners.get(type).push(listener);
    },
    dispatch(type, options = {}) {
      const event = { pointerId: 1, pointerType: 'touch', button: 0, clientX: 64, clientY: 64, preventDefault() {}, stopPropagation() {}, ...options };
      for (const listener of listeners.get(type) || []) listener(event);
    },
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 128, height: 128 }),
    setPointerCapture: (id) => captures.add(id),
    hasPointerCapture: (id) => captures.has(id),
    releasePointerCapture(id) {
      if (captures.delete(id)) this.dispatch('lostpointercapture', { pointerId: id });
    }
  };
}

function harness({ coarse = true, mode = 'person', realController = false } = {}) {
  const window = element();
  const document = { ...element(), body: element(), hidden: false };
  const media = { ...element(), matches: coarse };
  window.matchMedia = () => media;
  window.NYC = {};
  const root = element();
  const stick = element();
  const knob = element();
  const buttons = Object.fromEntries(['boost', 'superBoost', 'up', 'down', 'forward', 'backward', 'left', 'right'].map((action) => [action, element({ 'data-touch-action': action })]));
  const labels = Object.fromEntries(Object.keys(buttons).map((action) => [action, element()]));
  root.querySelectorAll = () => Object.values(buttons);
  root.querySelector = (selector) => labels[selector.match(/"(.*?)"/)[1]];
  document.getElementById = (id) => ({ 'touch-controls': root, 'touch-stick': stick, 'touch-stick-knob': knob })[id];
  const input = Object.fromEntries(['forward', 'backward', 'left', 'right', 'up', 'down', 'boost', 'superBoost'].map((action) => [action, 0]));
  let controller = {
    activeMode: mode,
    keys: input,
    setTouchInput(action, value) { input[action] = value; },
    clearTouchInput() { for (const action of Object.keys(input)) input[action] = 0; }
  };
  if (realController) {
    window.NYC.isTypingInField = () => false;
    runCityModule(controllerSource, { window, document, performance });
    controller = Object.create(window.NYC.ThirdPersonControllerManager.prototype);
    controller.keys = input;
    controller.activeMode = mode;
    controller.bindKeyboard();
  }
  runCityModule(source, { window, document });
  const controls = new window.NYC.TouchControls(controller);
  return { controls, window, document, media, root, stick, knob, buttons, labels, input };
}

function near(actual, expected) {
  assert.ok(Math.abs(actual - expected) < 1e-10, `${actual} should be close to ${expected}`);
}

describe('Touch controls', () => {

test('stick preserves analog strength and normalizes diagonal input with a radial deadzone', () => {
  const { stick, knob, input } = harness();
  stick.dispatch('pointerdown');
  stick.dispatch('pointermove', { clientX: 70 });
  assert.equal(input.right, 0, 'small motions stay in the deadzone');
  stick.dispatch('pointermove', { clientX: 86 });
  near(input.right, (0.5 - 0.15) / 0.85);
  assert.equal(input.left, 0);
  assert.equal(input.forward, 0);
  stick.dispatch('pointermove', { clientX: 164, clientY: -36 });
  near(input.right, Math.SQRT1_2);
  near(input.forward, Math.SQRT1_2);
  near(Math.hypot(input.right, input.forward), 1);
  near(Math.hypot(parseFloat(knob.style.getPropertyValue('--stick-x')), parseFloat(knob.style.getPropertyValue('--stick-y'))), 44);
  assert.equal(stick.hasPointerCapture(1), true);
});

test('stick and multiple held button pointers release independently', () => {
  const { stick, buttons, input } = harness();
  stick.dispatch('pointerdown', { clientY: 20 });
  buttons.boost.dispatch('pointerdown', { pointerId: 2 });
  buttons.boost.dispatch('pointerdown', { pointerId: 3 });
  buttons.up.dispatch('pointerdown', { pointerId: 4 });
  assert.equal(input.forward, 1);
  assert.equal(input.boost, 1);
  assert.equal(input.up, 1);
  stick.dispatch('pointermove', { pointerId: 5, clientY: 108 });
  assert.equal(input.forward, 1, 'an unrelated camera pointer cannot move the stick');
  buttons.boost.dispatch('pointerup', { pointerId: 2 });
  assert.equal(input.boost, 1, 'the second boost pointer remains held');
  assert.equal(buttons.boost.getAttribute('aria-pressed'), 'true');
  stick.dispatch('pointerup');
  assert.equal(input.forward, 0);
  assert.equal(input.boost, 1);
  assert.equal(input.up, 1);
  buttons.boost.dispatch('pointerup', { pointerId: 3 });
  assert.equal(input.boost, 0);
  assert.equal(buttons.boost.classList.contains('is-pressed'), false);
  assert.equal(buttons.boost.getAttribute('aria-pressed'), 'false');
  assert.equal(input.up, 1);
});

for (const type of ['pointercancel', 'lostpointercapture']) {
  test(`${type} clears only the affected pointer and its feedback`, () => {
    const { stick, knob, buttons, input } = harness();
    stick.dispatch('pointerdown', { clientX: 20 });
    buttons.boost.dispatch('pointerdown', { pointerId: 2 });
    stick.dispatch(type);
    assert.equal(input.left, 0);
    assert.equal(input.boost, 1);
    assert.equal(stick.classList.contains('is-pressed'), false);
    assert.equal(knob.style.getPropertyValue('--stick-x'), '0px');
    buttons.boost.dispatch(type, { pointerId: 2 });
    assert.equal(input.boost, 0);
    assert.equal(buttons.boost.getAttribute('aria-pressed'), 'false');
  });
}

test('mode changes clear touches and expose the relevant actions', () => {
  const { controls, stick, buttons, labels, input } = harness();
  assert.equal(labels.boost.textContent, 'Sprint');
  assert.equal(labels.up.textContent, 'Jump');
  assert.equal(buttons.up.hidden, false);
  assert.equal(buttons.down.hidden, true);
  stick.dispatch('pointerdown', { clientY: 20 });
  buttons.up.dispatch('pointerdown', { pointerId: 2 });
  controls.setMode('helicopter');
  assert.equal(Object.values(input).some(Boolean), false);
  assert.equal(stick.hasPointerCapture(1), false);
  assert.equal(buttons.up.hasPointerCapture(2), false);
  assert.equal(labels.boost.textContent, 'Boost');
  assert.equal(labels.up.textContent, 'Ascend');
  assert.equal(buttons.up.hidden, false);
  assert.equal(buttons.down.hidden, false);
  controls.setMode('car');
  assert.equal(buttons.up.hidden, true);
  assert.equal(buttons.down.hidden, true);
  buttons.up.dispatch('pointerdown', { pointerId: 3 });
  assert.equal(input.up, 0, 'hidden actions cannot receive input');
  controls.setMode('cyclist');
  assert.equal(labels.boost.textContent, 'Sprint');
  assert.equal(buttons.up.hidden, true);
  assert.equal(buttons.down.hidden, true);
});

test('disabling controls clears held input and blocks new input until enabled', () => {
  const { controls, root, stick, buttons, input } = harness();
  stick.dispatch('pointerdown', { clientY: 20 });
  buttons.boost.dispatch('pointerdown', { pointerId: 2 });
  controls.setEnabled(false);
  assert.equal(root.hidden, true);
  assert.equal(Object.values(input).some(Boolean), false);
  stick.dispatch('pointerdown', { clientY: 20 });
  buttons.boost.dispatch('pointerdown', { pointerId: 3 });
  assert.equal(Object.values(input).some(Boolean), false);
  controls.setEnabled(true);
  assert.equal(root.hidden, false);
  stick.dispatch('pointerdown', { clientY: 20 });
  assert.equal(input.forward, 1);
});

for (const interruption of ['blur', 'hidden', 'resize']) {
  test(`${interruption} resets all held input and pointer captures`, () => {
    const { window, document, stick, buttons, input } = harness();
    stick.dispatch('pointerdown', { clientY: 20 });
    buttons.boost.dispatch('pointerdown', { pointerId: 2 });
    if (interruption === 'hidden') {
      document.hidden = true;
      document.dispatch('visibilitychange');
    } else {
      window.dispatch(interruption);
    }
    assert.equal(Object.values(input).some(Boolean), false);
    assert.equal(stick.hasPointerCapture(1), false);
    assert.equal(buttons.boost.hasPointerCapture(2), false);
  });
}

test('desktop controls stay hidden until a coarse pointer or first touch is available', () => {
  const { document, media, root, stick, input } = harness({ coarse: false });
  assert.equal(root.hidden, true);
  assert.equal(document.body.classList.contains('touch-enabled'), false);
  media.matches = true;
  media.dispatch('change');
  assert.equal(root.hidden, false);
  stick.dispatch('pointerdown', { clientY: 20 });
  media.matches = false;
  media.dispatch('change');
  assert.equal(root.hidden, true);
  assert.equal(input.forward, 0, 'losing availability clears active controls');
  document.dispatch('pointerdown', { pointerType: 'mouse' });
  assert.equal(root.hidden, true);
  document.dispatch('pointerdown', { pointerType: 'touch' });
  assert.equal(root.hidden, false);
  assert.equal(document.body.classList.contains('touch-enabled'), true);
});

test('availability callback runs after visibility updates and only on an actual change', () => {
  const { controls, document, media, root } = harness({ coarse: false });
  assert.equal(controls.onAvailabilityChange, null);
  const changes = [];
  controls.onAvailabilityChange = (available) => {
    changes.push(available);
    assert.equal(document.body.classList.contains('touch-enabled'), available);
    assert.equal(root.hidden, !available);
  };
  media.dispatch('change');
  assert.deepEqual(changes, []);
  media.matches = true;
  media.dispatch('change');
  media.dispatch('change');
  assert.deepEqual(changes, [true]);
  media.matches = false;
  media.dispatch('change');
  document.dispatch('pointerdown', { pointerType: 'touch' });
  document.dispatch('pointerdown', { pointerType: 'touch' });
  assert.deepEqual(changes, [true, false, true]);
});

test('pedals, steering and latched super boost work together and release independently', () => {
  const { controls, window, buttons, input } = harness({ mode: 'car', realController: true });
  buttons.forward.dispatch('pointerdown');
  buttons.left.dispatch('pointerdown', { pointerId: 2 });
  buttons.superBoost.dispatch('click');
  assert.equal(input.forward, 1);
  assert.equal(input.left, 1);
  assert.equal(input.superBoost, true);
  assert.equal(buttons.superBoost.getAttribute('aria-pressed'), 'true');
  buttons.left.dispatch('pointercancel', { pointerId: 2 });
  assert.equal(input.left, false);
  assert.equal(input.forward, 1);
  assert.equal(input.superBoost, true, 'super boost stays latched after fingers lift');
  buttons.superBoost.dispatch('click');
  assert.equal(input.superBoost, false);
  buttons.forward.dispatch('pointerup');
  buttons.backward.dispatch('pointerdown', { pointerId: 3 });
  assert.equal(input.backward, 1);
  assert.equal(input.forward, false);
  buttons.superBoost.dispatch('click');
  window.dispatch('blur');
  controls.syncBoost();
  assert.equal(Object.values(input).some(Boolean), false);
  assert.equal(buttons.superBoost.getAttribute('aria-pressed'), 'false');
});

test('vehicle buttons give way to a joystick and flight actions in the other modes', () => {
  const { controls, buttons } = harness({ mode: 'car' });
  for (const action of ['forward', 'backward', 'left', 'right']) assert.equal(buttons[action].hidden, false);
  for (const mode of ['person', 'helicopter']) {
    controls.setMode(mode);
    for (const action of ['forward', 'backward', 'left', 'right']) assert.equal(buttons[action].hidden, true);
    assert.equal(buttons.superBoost.hidden, false);
    assert.equal(buttons.up.hidden, false);
    assert.equal(buttons.down.hidden, mode !== 'helicopter');
  }
});

});
