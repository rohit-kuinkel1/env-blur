import * as vscode from "vscode";
import { EnvFileMasker } from "./envFileMasker";

let envMasker: EnvFileMasker;

export function activate(context: vscode.ExtensionContext) {
  console.log("Environment File Masker extension is now active");

  envMasker = new EnvFileMasker();

  const toggleCommand = vscode.commands.registerCommand(
    "envMasker.toggleMasking",
    () => {
      envMasker.toggleMasking();
    }
  );

  const revealAllCommand = vscode.commands.registerCommand(
    "envMasker.revealAll",
    () => {
      envMasker.revealAllValues();
    }
  );

  const maskAllCommand = vscode.commands.registerCommand(
    "envMasker.maskAll",
    () => {
      envMasker.maskAllValues();
    }
  );

  const activeEditorListener = vscode.window.onDidChangeActiveTextEditor(
    (editor) => {
      if (editor) {
        envMasker.handleEditorChange(editor);
      }
    }
  );

  const selectionListener = vscode.window.onDidChangeTextEditorSelection(
    (event) => {
      envMasker.handleSelectionChange(event);
    }
  );

  const documentOpenListener = vscode.workspace.onDidOpenTextDocument(
    (document) => {
      envMasker.handleDocumentOpen(document);
    }
  );

  const documentCloseListener = vscode.workspace.onDidCloseTextDocument(
    (document) => {
      envMasker.handleDocumentClose(document);
    }
  );

  const configurationListener = vscode.workspace.onDidChangeConfiguration(
    (event) => {
      if (event.affectsConfiguration("envMasker")) {
        envMasker.updateConfiguration();
      }
    }
  );

  //add all disposables to context
  context.subscriptions.push(
    toggleCommand,
    revealAllCommand,
    maskAllCommand,
    activeEditorListener,
    selectionListener,
    documentOpenListener,
    documentCloseListener,
    configurationListener,
    envMasker
  );

  //initialize for currently active editor
  if (vscode.window.activeTextEditor) {
    envMasker.handleEditorChange(vscode.window.activeTextEditor);
  }
}

export function deactivate() {
  if (envMasker) {
    envMasker.dispose();
  }
}
