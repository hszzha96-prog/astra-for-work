'use strict';

const assert = require('node:assert/strict');
const { loadSolar } = require('./load.cjs');

// Only the DOM operations used by the registration and journal controller.
// Form field names, stages and action controls come from the rendered markup.
class Element {
  constructor() {
    this.value = '';
    this.children = [];
    this.dataset = {};
    this.classList = { add() {}, remove() {} };
    this.listeners = new Map();
    this.selectors = new Map();
  }

  set innerHTML(html) {
    this.markup = html;
    const stage = /<form data-stage="([^"]+)"/.exec(html)?.[1];
    if (!stage) return;
    const form = new Element();
    this.selectors.set('form', form);
    form.elements = {};
    form.dataset.stage = stage;
    for (const [, name] of html.matchAll(/<(?:input|textarea|select)\b[^>]*\bname="([^"]+)"/g)) {
      form.elements[name] = new Element();
    }
    for (const [, name, value] of html.matchAll(/<select name="([^"]+)">\s*<option value="([^"]*)"/g)) {
      form.elements[name].value = value;
    }
    for (const [, attr] of html.matchAll(/\s(data-[\w-]+)(?=[\s>])/g)) {
      form.selectors.set('[' + attr + ']', new Element());
    }
  }

  get innerHTML() { return this.markup || ''; }
  querySelector(selector) { return this.selectors.get(selector) || null; }
  setAttribute(name, value) { this[name] = value; }
  focus() {}
  showModal() { this.open = true; }
  close() { this.open = false; }
  setCustomValidity(message) { this.validationMessage = message; }
  reportValidity() { return !this.validationMessage; }

  addEventListener(type, listener) {
    if (!this.listeners.has(type)) this.listeners.set(type, []);
    this.listeners.get(type).push(listener);
  }

  emit(type, target = this) {
    for (const listener of this.listeners.get(type) || []) {
      listener({ target, preventDefault() {} });
    }
  }
}

function makeUI(storage = new Map()) {
  const elements = new Map();
  function get(id) {
    if (!elements.has(id)) elements.set(id, new Element());
    return elements.get(id);
  }

  // 2030-04-10 in UTC and 2030-04-11 in Singapore.
  const instant = '2030-04-10T16:30:00Z';
  class Clock extends Date {
    constructor(...args) { super(...(args.length ? args : [instant])); }
    static now() { return Date.parse(instant); }
  }

  let scene;
  const app = loadSolar(['model', 'controller'], {
    Date: Clock,
    document: { getElementById: get },
    localStorage: {
      getItem: key => storage.get(key) ?? null,
      setItem: (key, value) => storage.set(key, value),
      removeItem: key => storage.delete(key)
    },
    createOrbitScene: () => ({
      update(state) { scene = state; },
      observe() {}, setPaused() {}, setView() {}, zoomBy() {}
    }),
    addEventListener() {}, setTimeout() {}, clearTimeout() {}
  });
  const dialog = get('form-dialog');
  const form = () => dialog.querySelector('form');
  const records = () => JSON.parse(storage.get('starlink.solar-lab.v02.tasks') || '[]')
    .filter(task => task.source === 'real');
  function fill(fields) {
    for (const [name, value] of Object.entries(fields)) {
      assert.ok(form().elements[name], 'form contains ' + name);
      form().elements[name].value = String(value);
    }
  }
  function button(container, attribute, value) {
    const el = get(container);
    const htmlAttr = 'data-' + attribute + (value === undefined ? '' : '="' + value + '"');
    assert.ok(el.innerHTML.includes(htmlAttr), 'rendered button ' + htmlAttr);
    const target = { dataset: { [attribute]: value ?? '' } };
    target.closest = selector => selector === '[data-' + attribute + ']' ? target : null;
    el.emit('click', target);
  }

  return {
    app, storage, get, dialog, form, records, fill, button,
    points: () => Array.from(scene.points),
    counts: () => Array.from(get('daily-summary').innerHTML.matchAll(/<strong>(\d+)<\/strong>/g), m => Number(m[1])),
    submit: () => dialog.emit('submit', form()),
    open: () => get('new-task').emit('click'),
    change(id, value) { get(id).value = value; get(id).emit('change'); }
  };
}

module.exports = { makeUI };
