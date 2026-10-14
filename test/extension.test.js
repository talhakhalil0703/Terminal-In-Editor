const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

function load(options = {}) {
  const commands = new Map();
  const errors = [];
  const events = [];
  let clipboard = 'previous clipboard';
  const terminal = {
    show() {
      events.push('focus terminal');
      if (options.failFocus) {
        throw new Error('focus failed');
      }
    },
    sendText: () => assert.fail('Preparing context must not send terminal input'),
  };
  const vscode = {
    window: {
      activeTerminal: options.noTerminal ? undefined : terminal,
      terminals: options.noTerminal ? [] : [terminal],
      activeTextEditor: { document: 'active document' },
      tabGroups: { activeTabGroup: { activeTab: 'active tab' } },
      createStatusBarItem: () => ({ show() {} }),
      showErrorMessage: message => errors.push(message),
      setStatusBarMessage: message => events.push(message),
      createTerminal: () => assert.fail('Context paste must not create a shell'),
    },
    StatusBarAlignment: { Right: 2 },
    commands: {
      registerCommand: (id, callback) => { commands.set(id, callback); return {}; },
      async executeCommand(id) {
        events.push({ command: id, text: clipboard });
      },
    },
    env: {
      clipboard: {
        async readText() { return clipboard; },
        async writeText(text) { clipboard = text; },
      },
    },
  };
  const sandbox = {
    require(name) {
      if (name === 'vscode') return vscode;
      if (name === './context') return { buildContext: options.build || (async () => 'context\nsecond line') };
      return require(name);
    },
    module: { exports: {} },
    setTimeout,
    clearTimeout,
  };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../extension.js'), 'utf8'), sandbox);
  sandbox.module.exports.activate({ subscriptions: [] });
  return { commands, events, errors, vscode, clipboard: () => clipboard };
}

test('preparing context copies it and focuses the terminal without pasting', async () => {
  const state = load();
  await state.commands.get('code-to-console.pasteContext')();
  assert.equal(state.events[0], 'focus terminal');
  assert.equal(state.events.length, 1);
  assert.equal(state.clipboard(), 'context\nsecond line');
  assert.equal(state.errors.length, 0);
});

test('copy leaves the context on the clipboard and does not focus the terminal', async () => {
  const state = load();
  await state.commands.get('code-to-console.copyContext')();
  assert.equal(state.clipboard(), 'context\nsecond line');
  assert.equal(state.events.length, 1);
  assert.match(state.events[0], /context copied/);
});

test('no terminal produces an error without creating one or touching the clipboard', async () => {
  const state = load({ noTerminal: true });
  await state.commands.get('code-to-console.pasteContext')();
  assert.match(state.errors[0], /open your agent in an integrated terminal first/);
  assert.equal(state.clipboard(), 'previous clipboard');
  assert.equal(state.events.length, 0);
});

test('a focus failure leaves the copied context available for manual paste', async () => {
  const state = load({ failFocus: true });
  await state.commands.get('code-to-console.pasteContext')();
  assert.equal(state.clipboard(), 'context\nsecond line');
  assert.match(state.errors[0], /focus failed/);
});

test('repeated shortcuts do not interleave context preparation', async () => {
  let finish;
  let builds = 0;
  const state = load({ build: () => {
    builds++;
    return new Promise(resolve => { finish = resolve; });
  } });
  const first = state.commands.get('code-to-console.pasteContext')();
  await state.commands.get('code-to-console.pasteContext')();
  finish('context');
  await first;
  assert.equal(builds, 1);
  assert.equal(state.events.filter(event => event.command).length, 0);
  assert.equal(state.clipboard(), 'context');
});

test('a terminal closing while context is built cannot redirect focus to another shell', async () => {
  let finish;
  const state = load({ build: () => new Promise(resolve => { finish = resolve; }) });
  const paste = state.commands.get('code-to-console.pasteContext')();
  state.vscode.window.terminals = [];
  state.vscode.window.activeTerminal = { show() {} };
  finish('context');
  await paste;
  assert.match(state.errors[0], /target terminal closed/);
  assert.equal(state.events.length, 0);
  assert.equal(state.clipboard(), 'previous clipboard');
});
