# Code to Console

Put your integrated terminal in an editor tab with one click. Keep it beside
your code, split it into another editor group, or give it the full editor area.
Copy file and diff references for an agent running in that terminal.

## Send context

Open your agent in a VS Code integrated terminal, then return to your code.
Select some lines or place the cursor, and press **Cmd+L** on macOS
(**Ctrl+L** on Windows/Linux). The context is copied to the clipboard and the
most recently active terminal receives focus. Paste using your terminal's
normal shortcut (**Cmd+V** on macOS), then submit when ready.

You can also click the terminal icon in the editor title, use the editor's
right-click menu, or run **Code to Console: Copy Context and Focus Terminal**.
**Code to Console: Copy Context** copies the same text to the clipboard.

A regular file includes its repository, path, and selected lines:

```text
Viewing a file
Repository: /work/project
File: src/engine.hpp
Version: working tree
Selection: lines 40-43
```

A diff includes both versions and the side you selected:

```text
Viewing a diff
Repository: /work/project
File: src/engine.hpp
Comparison: 0fe4d9a (left/original) -> 399610c (right/modified)
Selection: lines 110-114 (right/modified, 399610c)
```

VS Code Git and Git Graph diffs include their revision metadata. Renamed files
include both paths. Other text diffs retain the two resource references when
revision metadata is unavailable. Unsaved selections include their actual text;
with no selection, they include the current line. Paths follow the editor's
host, including Remote SSH.

### Rebind the shortcut

Open **Preferences: Open Keyboard Shortcuts** and search for
**Code to Console: Copy Context and Focus Terminal**. Change or remove its binding,
or assign one to **Code to Console: Copy Context**.

The default replaces Select Line while the text editor has focus. To choose
another key in `keybindings.json`, remove the default and add your binding:

```json
[
  {
    "key": "cmd+l",
    "command": "-code-to-console.pasteContext",
    "when": "editorTextFocus"
  },
  {
    "key": "cmd+alt+l",
    "command": "code-to-console.pasteContext",
    "when": "editorTextFocus"
  }
]
```

Use `ctrl+l` instead of `cmd+l` when removing the Windows/Linux default.

## Open the terminal in an editor tab

Click **Terminal** on the right side of the status bar.

![Terminal button on the right side of the VS Code status bar](https://raw.githubusercontent.com/talhakhalil0703/Terminal-In-Editor/bb8502eafe079a2266642a82c8bf155ce418321d/media/status-bar.png)

You can also open the Command Palette (`Cmd+Shift+P` on macOS,
`Ctrl+Shift+P` on Windows/Linux) and run **Terminal: Attach to Editor**.

- **Terminal already open:** moves the active terminal into an editor tab,
  keeping its shell session and output.
- **No terminal open:** creates a new terminal directly in the editor area.

![An existing terminal moved from the bottom panel into an editor tab](https://raw.githubusercontent.com/talhakhalil0703/Terminal-In-Editor/bb8502eafe079a2266642a82c8bf155ce418321d/media/terminal-in-editor.png)

## Install

Search for **Code to Console** by **Talha Khalil** in VS Code's Extensions
view. Requires VS Code 1.109.0 or later.
