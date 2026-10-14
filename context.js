const path = require('node:path');
const vscode = require('vscode');

function decodeResource(uri) {
  if (uri.scheme === 'git') {
    try {
      const data = JSON.parse(uri.query);
      if (typeof data.path === 'string' && typeof data.ref === 'string') {
        if (typeof data.submoduleOf === 'string') {
          return {
            file: uri.toString(),
            repository: data.submoduleOf,
            version: data.ref === 'index'
              ? 'submodule staged diff against HEAD'
              : data.ref === 'wt' ? 'submodule working-tree diff against HEAD' : 'submodule editor snapshot',
            virtual: true,
          };
        }
        let version = data.ref || 'staged index';
        if (data.ref === '~') {
          version = 'Git baseline (~; staged index or HEAD)';
        } else if (/^~[123]$/.test(data.ref)) {
          version = `merge index stage ${data.ref.slice(1)}`;
        }
        return { file: data.path, version };
      }
    } catch {}
  }

  if (uri.scheme === 'git-graph') {
    try {
      const data = JSON.parse(Buffer.from(uri.query, 'base64').toString('utf8'));
      if (
        typeof data.repo === 'string' &&
        typeof data.filePath === 'string' &&
        typeof data.commit === 'string'
      ) {
        const paths = pathTools(data.repo);
        return {
          file: paths.resolve(data.repo, data.filePath),
          repository: data.repo,
          version: data.exists === false
            ? `absent at ${data.commit}`
            : data.commit === '*' ? 'working tree' : data.commit,
        };
      }
    } catch {}
  }

  if (uri.scheme === 'file' || uri.scheme === 'vscode-remote') {
    return { file: resourcePath(uri), version: 'working tree' };
  }

  return {
    file: uri.toString(),
    version: uri.scheme === 'untitled' ? 'unsaved editor buffer' : 'editor snapshot',
    virtual: true,
  };
}

function pathTools(file) {
  return /^[a-z]:[\\/]/i.test(file) || file.startsWith('\\\\')
    ? path.win32
    : path.posix;
}

function resourcePath(uri) {
  if (uri.scheme !== 'vscode-remote') {
    return uri.fsPath;
  }
  return /^\/[a-z]:\//i.test(uri.path)
    ? uri.path.slice(1).replace(/\//g, '\\')
    : uri.path;
}

function fileUri(file, source, relatedUris) {
  const paths = pathTools(file);
  const remote = [...relatedUris, ...(vscode.workspace.workspaceFolders || []).map(folder => folder.uri)]
    .find(uri => uri.scheme === 'vscode-remote' && (
      source.authority === uri.authority ||
      file === resourcePath(uri) ||
      file.startsWith(resourcePath(uri).replace(/[\\/]$/, '') + paths.sep)
    ));
  if (remote) {
    return vscode.Uri.file(file).with({
      scheme: 'vscode-remote',
      authority: remote.authority,
    });
  }
  if (source.scheme === 'git' && source.authority) {
    return vscode.Uri.file(file).with({
      scheme: 'vscode-remote',
      authority: source.authority,
    });
  }
  return vscode.Uri.file(file);
}

async function findRepository(resource, source, relatedUris) {
  if (resource.repository || resource.virtual) {
    return resource.repository;
  }
  const paths = pathTools(resource.file);
  let directory = paths.dirname(resource.file);
  while (true) {
    try {
      await vscode.workspace.fs.stat(
        vscode.Uri.joinPath(fileUri(directory, source, relatedUris), '.git')
      );
      return directory;
    } catch (error) {
      if (error.code !== 'FileNotFound' && error.code !== 'EntryNotFound') {
        return undefined;
      }
    }
    const parent = paths.dirname(directory);
    if (parent === directory) {
      return undefined;
    }
    directory = parent;
  }
}

function location(selection) {
  if (selection.isEmpty) {
    return `Cursor: line ${selection.active.line + 1}`;
  }
  const first = selection.start.line + 1;
  const last = selection.end.line + (selection.end.character > 0 ? 1 : 0);
  return `Selection: lines ${first}-${Math.max(first, last)}`;
}

function codeBlock(text) {
  const runs = text.match(/`+/g) || [];
  const fence = '`'.repeat(Math.max(3, ...runs.map(run => run.length + 1)));
  return `${fence}\n${text}\n${fence}`;
}

function displayFile(resource, repository) {
  if (!repository || resource.virtual) {
    return resource.file;
  }
  const relative = pathTools(resource.file).relative(repository, resource.file);
  return relative && !relative.startsWith('..') && !pathTools(relative).isAbsolute(relative)
    ? relative.replace(/\\/g, '/')
    : resource.file;
}

async function buildContext(editor, tab) {
  if (!editor) {
    throw new Error('Open a text file and place the cursor or select some lines first.');
  }
  const document = editor.document;
  const uri = document.uri;
  const selection = editor.selection;
  const dirty = document.isDirty;
  const selectedText = selection.isEmpty
    ? document.lineAt(selection.active.line).text
    : document.getText(selection);
  const selected = decodeResource(uri);
  const input = tab && tab.input;
  const diff = input instanceof vscode.TabInputTextDiff &&
    [input.original, input.modified].some(side => side.toString() === uri.toString());
  const relatedUris = diff ? [input.original, input.modified] : [uri];
  const sideDirty = relatedUris.map(side => side.toString() === uri.toString()
    ? dirty
    : vscode.workspace.textDocuments.some(doc => doc.uri.toString() === side.toString() && doc.isDirty));
  const repository = await findRepository(selected, uri, relatedUris);
  const lines = [diff ? 'Viewing a diff' : 'Viewing a file'];
  if (repository) {
    lines.push(`Repository: ${repository}`);
  }
  lines.push(`File: ${displayFile(selected, repository)}`);

  if (diff) {
    const original = decodeResource(input.original);
    const modified = decodeResource(input.modified);
    const side = uri.toString() === input.original.toString() ? 'left/original' : 'right/modified';
    const originalVersion = sideDirty[0]
      ? 'unsaved editor buffer'
      : original.version;
    const modifiedVersion = sideDirty[1]
      ? 'unsaved editor buffer'
      : modified.version;
    lines.push(`Comparison: ${originalVersion} (left/original) -> ${modifiedVersion} (right/modified)`);
    if (original.file !== modified.file) {
      lines.push(`Original file: ${displayFile(original, repository)}`);
      lines.push(`Modified file: ${displayFile(modified, repository)}`);
    }
    if (original.virtual || modified.virtual) {
      lines.push(`Original resource: ${input.original.toString()}`);
      lines.push(`Modified resource: ${input.modified.toString()}`);
    }
    lines.push(`${location(selection)} (${side}, ${dirty ? 'unsaved editor buffer' : selected.version})`);
  } else {
    lines.push(`Version: ${dirty ? 'unsaved editor buffer' : selected.version}`);
    lines.push(location(selection));
  }

  if (dirty || selected.virtual || selected.version.includes('baseline')) {
    lines.push(
      selection.isEmpty ? 'Current line from editor:' : 'Selected text from editor:',
      codeBlock(selectedText)
    );
  }
  return lines.join('\n');
}

module.exports = { buildContext };
