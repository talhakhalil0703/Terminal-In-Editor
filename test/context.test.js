const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

class Uri {
  constructor(scheme, file, query = '', authority = '') {
    Object.assign(this, { scheme, path: file, fsPath: file, query, authority });
  }
  toString() {
    return `${this.scheme}://${this.authority}${this.path}?${this.query}`;
  }
  with(changes) {
    return Object.assign(new Uri(this.scheme, this.path, this.query, this.authority), changes);
  }
  static file(file) {
    return new Uri('file', file);
  }
  static joinPath(uri, ...parts) {
    return uri.with({ path: path.posix.join(uri.path, ...parts) });
  }
}

class TabInputTextDiff {
  constructor(original, modified) {
    Object.assign(this, { original, modified });
  }
}

function editor(uri, start = 39, end = 42, endCharacter = 3, options = {}) {
  const selection = {
    start: { line: start, character: 0 },
    end: { line: end, character: endCharacter },
    active: { line: end, character: endCharacter },
    isEmpty: options.empty || false,
  };
  return {
    document: {
      uri,
      isDirty: options.dirty || false,
      lineAt: () => ({ text: options.text || 'current line' }),
      getText: () => options.text || 'selected text',
    },
    selection,
  };
}

function load(documents = [], roots = ['/work/project'], folders = []) {
  const stats = [];
  const vscode = {
    Uri,
    TabInputTextDiff,
    workspace: {
      textDocuments: documents,
      workspaceFolders: folders.map(uri => ({ uri })),
      fs: {
        async stat(uri) {
          stats.push(uri);
          if (!roots.some(root => uri.path === `${root}/.git`)) {
            throw Object.assign(new Error('missing'), { code: 'FileNotFound' });
          }
          return { type: 2 };
        },
      },
    },
  };
  const sandbox = {
    require: name => name === 'vscode' ? vscode : require(name),
    module: { exports: {} },
    Buffer,
  };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../context.js'), 'utf8'), sandbox);
  return { ...sandbox.module.exports, stats, vscode };
}

function git(file, ref, authority = '') {
  return new Uri('git', file, JSON.stringify({ path: file, ref }), authority);
}

function graph(filePath, commit, exists = true) {
  return new Uri('git-graph', '/file.hpp', Buffer.from(JSON.stringify({
    repo: '/work/project',
    filePath,
    commit,
    exists,
  })).toString('base64'));
}

test('regular files identify the repository and selected inclusive line range', async () => {
  const { buildContext } = load();
  assert.equal(await buildContext(editor(Uri.file('/work/project/src/engine.hpp'))), [
    'Viewing a file',
    'Repository: /work/project',
    'File: src/engine.hpp',
    'Version: working tree',
    'Selection: lines 40-43',
  ].join('\n'));
});

test('a selection ending at column zero excludes that final line', async () => {
  const { buildContext } = load();
  const text = await buildContext(editor(Uri.file('/work/project/file'), 39, 43, 0));
  assert.match(text, /Selection: lines 40-43$/);
});

test('a cursor uses its active line and files outside Git retain absolute paths', async () => {
  const { buildContext } = load();
  const text = await buildContext(editor(Uri.file('/other/file'), 9, 9, 0, { empty: true }));
  assert.equal(text, 'Viewing a file\nFile: /other/file\nVersion: working tree\nCursor: line 10');
});

test('both sides of a committed Git diff include the comparison and their own lines', async () => {
  const { buildContext } = load();
  const left = git('/work/project/src/engine.hpp', '0fe4d9a');
  const right = git('/work/project/src/engine.hpp', '399610c');
  const tab = { input: new TabInputTextDiff(left, right) };
  const original = await buildContext(editor(left, 109, 116), tab);
  const modified = await buildContext(editor(right, 109, 113), tab);
  for (const text of [original, modified]) {
    assert.match(text, /^Viewing a diff/);
    assert.match(text, /Comparison: 0fe4d9a \(left\/original\) -> 399610c \(right\/modified\)/);
  }
  assert.match(original, /Selection: lines 110-117 \(left\/original, 0fe4d9a\)$/);
  assert.match(modified, /Selection: lines 110-114 \(right\/modified, 399610c\)$/);
});

test('Git Graph decodes commits, renames, and absent sides', async () => {
  const { buildContext } = load();
  const left = graph('src/old.hpp', '0fe4d9a', false);
  const right = graph('src/new.hpp', '399610c');
  const text = await buildContext(editor(right), { input: new TabInputTextDiff(left, right) });
  assert.match(text, /Repository: \/work\/project/);
  assert.match(text, /Comparison: absent at 0fe4d9a \(left\/original\) -> 399610c/);
  assert.match(text, /Original file: src\/old.hpp\nModified file: src\/new.hpp/);
});

test('staged and unsaved working-tree versions stay distinct in a diff', async () => {
  const right = Uri.file('/work/project/src/engine.hpp');
  const dirtyEditor = editor(right, 109, 113, 3, { dirty: true, text: 'unsaved change' });
  const { buildContext } = load([dirtyEditor.document]);
  const text = await buildContext(dirtyEditor, {
    input: new TabInputTextDiff(git(right.fsPath, ''), right),
  });
  assert.match(text, /Comparison: staged index \(left\/original\) -> unsaved editor buffer \(right\/modified\)/);
  assert.match(text, /right\/modified, unsaved editor buffer/);
  assert.match(text, /Selected text from editor:\n```\nunsaved change\n```$/);
});

test('dirty buffers preserve selected text and escape embedded code fences', async () => {
  const { buildContext } = load();
  const text = await buildContext(editor(Uri.file('/work/project/file'), 0, 2, 1, {
    dirty: true,
    text: '```js\nexample\n```',
  }));
  assert.match(text, /Version: unsaved editor buffer/);
  assert.match(text, /````\n```js\nexample\n```\n````$/);
});

test('dirty cursors include just the current line and untitled documents retain their URI', async () => {
  const { buildContext } = load();
  const text = await buildContext(editor(new Uri('untitled', 'Untitled-1'), 0, 0, 0, {
    empty: true,
    dirty: true,
    text: 'not saved',
  }));
  assert.match(text, /File: untitled:\/\/Untitled-1\?/);
  assert.match(text, /Cursor: line 1\nCurrent line from editor:\n```\nnot saved\n```$/);
});

test('Remote SSH repository lookup uses the remote filesystem and remote path', async () => {
  const remote = new Uri('vscode-remote', '/local/home/user/project', '', 'ssh-remote+dev');
  const left = graph('src/engine.hpp', 'left');
  const right = new Uri('vscode-remote', '/local/home/user/project/src/engine.hpp', '', remote.authority);
  const { buildContext, stats } = load([], ['/local/home/user/project'], [remote]);
  const text = await buildContext(editor(right), { input: new TabInputTextDiff(left, right) });
  assert.match(text, /Repository: \/local\/home\/user\/project/);
  assert.ok(stats.every(uri => uri.scheme === 'vscode-remote' && uri.authority === remote.authority));
});

test('remote Git snapshot lookup retains its SSH authority', async () => {
  const { buildContext, stats } = load([], ['/work/project']);
  const text = await buildContext(editor(git('/work/project/file', 'HEAD', 'ssh-remote+dev')));
  assert.match(text, /Repository: \/work\/project/);
  assert.ok(stats.every(uri => uri.scheme === 'vscode-remote' && uri.authority === 'ssh-remote+dev'));
});

test('a Windows UI host does not turn POSIX remote paths into Windows paths', async () => {
  const remote = new Uri('vscode-remote', '/work/project', '', 'ssh-remote+dev');
  remote.fsPath = '\\work\\project';
  const file = new Uri('vscode-remote', '/work/project/src/engine.hpp', '', remote.authority);
  file.fsPath = '\\work\\project\\src\\engine.hpp';
  const { buildContext, stats } = load([], ['/work/project'], [remote]);
  const text = await buildContext(editor(file));
  assert.match(text, /Repository: \/work\/project\nFile: src\/engine.hpp/);
  assert.ok(stats.every(uri => uri.scheme === 'vscode-remote' && uri.path.startsWith('/work/')));
});

test('unknown diff providers retain both resources and the actual selected text', async () => {
  const left = new Uri('custom', '/old', 'a');
  const right = new Uri('custom', '/new', 'b');
  const { buildContext } = load();
  const text = await buildContext(editor(left), { input: new TabInputTextDiff(left, right) });
  assert.match(text, /^Viewing a diff/);
  assert.match(text, /Original resource: custom:\/\/\/old\?a/);
  assert.match(text, /Modified resource: custom:\/\/\/new\?b/);
  assert.match(text, /left\/original, editor snapshot/);
  assert.match(text, /Selected text from editor:/);
});

test('another tab cannot turn an unrelated document into a diff', async () => {
  const { buildContext } = load();
  const text = await buildContext(editor(Uri.file('/work/project/other')), {
    input: new TabInputTextDiff(git('/work/project/file', 'old'), git('/work/project/file', 'new')),
  });
  assert.match(text, /^Viewing a file/);
  assert.doesNotMatch(text, /Comparison:/);
});

test('ambiguous Git baseline is labeled honestly and includes selected text', async () => {
  const { buildContext } = load();
  const text = await buildContext(editor(git('/work/project/file', '~')));
  assert.match(text, /Version: Git baseline \(~; staged index or HEAD\)/);
  assert.match(text, /Selected text from editor:/);
});

test('missing editor fails with an actionable message', async () => {
  const { buildContext } = load();
  await assert.rejects(buildContext(undefined), /Open a text file/);
});

test('malformed revision metadata falls back to a snapshot without inventing a commit', async () => {
  const { buildContext } = load();
  const text = await buildContext(editor(new Uri('git', '/file', 'bad-json')));
  assert.match(text, /Version: editor snapshot/);
  assert.match(text, /Selected text from editor:/);
});

test('both sides use dirty state captured before asynchronous repository lookup', async () => {
  const right = Uri.file('/work/project/file');
  const selectedEditor = editor(right);
  const state = load([selectedEditor.document]);
  state.vscode.workspace.fs.stat = async () => {
    selectedEditor.document.isDirty = true;
    return { type: 2 };
  };
  const text = await state.buildContext(selectedEditor, {
    input: new TabInputTextDiff(git(right.fsPath, 'HEAD'), right),
  });
  assert.match(text, /Comparison: HEAD \(left\/original\) -> working tree \(right\/modified\)/);
  assert.match(text, /right\/modified, working tree/);
  assert.doesNotMatch(text, /unsaved editor buffer/);
});

test('synthetic submodule diff lines are not mislabeled as regular file lines', async () => {
  const { buildContext } = load();
  const uri = new Uri('git', '/work/project/submodule.diff', JSON.stringify({
    path: '/work/project/submodule',
    ref: 'wt',
    submoduleOf: '/work/project/submodule',
  }));
  const text = await buildContext(editor(uri));
  assert.match(text, /Version: submodule working-tree diff against HEAD/);
  assert.match(text, /Selected text from editor:/);
});
