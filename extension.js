const vscode = require('vscode');
const { buildContext } = require('./context');

const COMMAND_ID = 'terminal-in-editor.attach';
const COPY_COMMAND_ID = 'code-to-console.copyContext';
const PREPARE_COMMAND_ID = 'code-to-console.pasteContext';
let preparing = false;

function ensureTerminal(terminal) {
  if (!vscode.window.terminals.includes(terminal) || terminal.exitStatus !== undefined) {
    throw new Error('The target terminal closed. Open your agent terminal and try again.');
  }
}

async function focusTerminal(terminal) {
  terminal.show();
  if (vscode.window.activeTerminal === terminal) {
    return;
  }
  await new Promise((resolve, reject) => {
    const change = vscode.window.onDidChangeActiveTerminal(active => {
      if (active === terminal) {
        finish(resolve);
      }
    });
    const close = vscode.window.onDidCloseTerminal(closed => {
      if (closed === terminal) {
        finish(() => reject(new Error('The target terminal closed before focus.')));
      }
    });
    const timer = setTimeout(() => {
      finish(() => reject(new Error('Could not focus the target terminal. Try again.')));
    }, 3000);
    function finish(callback) {
      clearTimeout(timer);
      change.dispose();
      close.dispose();
      callback();
    }
  });
}

async function attachTerminalToEditor() {
  if (vscode.window.activeTerminal) {
    await vscode.commands.executeCommand(
      'workbench.action.terminal.moveToEditor'
    );
    return;
  }

  vscode.window
    .createTerminal({ location: vscode.TerminalLocation.Editor })
    .show();
}

async function copyContext() {
  try {
    const text = await buildContext(
      vscode.window.activeTextEditor,
      vscode.window.tabGroups.activeTabGroup.activeTab
    );
    await vscode.env.clipboard.writeText(text);
    vscode.window.setStatusBarMessage('Code to Console: context copied', 3000);
  } catch (error) {
    vscode.window.showErrorMessage(`Code to Console: ${error.message}`);
  }
}

async function prepareContext() {
  if (preparing) {
    return;
  }
  const terminal = vscode.window.activeTerminal;
  if (!terminal) {
    vscode.window.showErrorMessage(
      'Code to Console: open your agent in an integrated terminal first.'
    );
    return;
  }
  preparing = true;
  try {
    const autoPaste = vscode.workspace
      .getConfiguration('codeToConsole')
      .get('autoPasteContext', false) === true;
    const text = await buildContext(
      vscode.window.activeTextEditor,
      vscode.window.tabGroups.activeTabGroup.activeTab
    );
    ensureTerminal(terminal);
    await vscode.env.clipboard.writeText(text);
    ensureTerminal(terminal);
    await focusTerminal(terminal);
    ensureTerminal(terminal);
    if (autoPaste) {
      if (await vscode.env.clipboard.readText() !== text) {
        throw new Error('The clipboard changed before paste. Try again.');
      }
      ensureTerminal(terminal);
      if (vscode.window.activeTerminal !== terminal) {
        throw new Error('The active terminal changed before paste. Try again.');
      }
      await vscode.commands.executeCommand('workbench.action.terminal.paste');
    }
  } catch (error) {
    vscode.window.showErrorMessage(`Code to Console: ${error.message}`);
  } finally {
    preparing = false;
  }
}

function activate(context) {
  const command = vscode.commands.registerCommand(
    COMMAND_ID,
    attachTerminalToEditor
  );
  const statusBar = vscode.window.createStatusBarItem(
    'terminal-in-editor.status',
    vscode.StatusBarAlignment.Right,
    100
  );

  statusBar.name = 'Code to Console';
  statusBar.text = '$(terminal) Terminal';
  statusBar.tooltip = 'Open Terminal in Editor';
  statusBar.command = COMMAND_ID;
  statusBar.show();

  context.subscriptions.push(
    command,
    statusBar,
    vscode.commands.registerCommand(COPY_COMMAND_ID, copyContext),
    vscode.commands.registerCommand(PREPARE_COMMAND_ID, prepareContext)
  );
}

function deactivate() {}

module.exports = { activate, deactivate };
