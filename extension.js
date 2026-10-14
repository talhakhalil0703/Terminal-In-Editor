const vscode = require('vscode');

const COMMAND_ID = 'terminal-in-editor.attach';

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

  context.subscriptions.push(command, statusBar);
}

function deactivate() {}

module.exports = { activate, deactivate };
