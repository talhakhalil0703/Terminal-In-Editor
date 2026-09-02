const vscode = require('vscode');

function activate(context) {
  const command = vscode.commands.registerCommand(
    'terminal-in-editor.attach',
    async () => {
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
  );

  context.subscriptions.push(command);
}

function deactivate() {}

module.exports = { activate, deactivate };
