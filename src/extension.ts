/**
 * VS Code Extension Entry Point for env-blur
 *
 * This file serves as the main entry point for the env-blur VS Code extension.
 * It handles the extension lifecycle, including activation, deactivation, and
 * registration of commands and event listeners.
 *
 * Key responsibilities:
 * - Initializing the EnvFileMasker when the extension activates
 * - Registering VS Code commands for user interactions (toggle, reveal, mask)
 * - Setting up event listeners for editor changes, document lifecycle, and configuration updates
 * - Managing the extension's disposable resources and cleanup
 * - Providing the bridge between VS Code's extension API and the masking functionality
 *
 * The extension follows VS Code's standard activation pattern:
 * 1. activate() is called when the extension loads
 * 2. Commands and event listeners are registered
 * 3. The main functionality (EnvFileMasker) is initialized
 * 4. deactivate() is called when the extension unloads for cleanup
 *
 * All registered resources are added to the context.subscriptions array to ensure
 * proper cleanup when the extension is disabled or VS Code is closed.
 *
 * @author Rohit Kuinkel
 * @since 0.0.1
 */

import * as vscode from "vscode";
import { EnvFileMasker } from "./envFileMasker";

let envMasker: EnvFileMasker;

/**
 * Activates the env-blur extension when VS Code loads it.
 * This function is the main entry point called by VS Code when the extension
 * is activated. It initializes all components, registers commands, sets up
 * event listeners, and prepares the extension for use.
 *
 * The activation process includes:
 * - Creating the main EnvFileMasker instance
 * - Registering user commands (toggle masking, reveal all, mask all)
 * - Setting up event listeners for editor changes and document lifecycle
 * - Configuring automatic processing of currently open editors
 * - Adding all disposables to the extension context for proper cleanup
 *
 * @param {vscode.ExtensionContext} context - VS Code extension context containing subscriptions and storage
 *
 * @example
 *  Called automatically by VS Code when extension activates
 *  User can then access commands via:
 *  - Command Palette: "env-blur: Toggle Masking feature on/off"
 *  - Command Palette: "env-blur: Reveal All Values"
 *  - Command Palette: "env-blur: Mask All Values"
 */
export function activate(context: vscode.ExtensionContext) {
  console.log("Environment File Masker extension is now active");

  envMasker = new EnvFileMasker();

  /**
   * Command: envMasker.toggleMasking
   * Toggles the entire masking system on/off. When disabled, all masking
   * decorations are removed from visible editors. When enabled, masking
   * is reapplied to all open environment files.
   */
  const toggleCommand = vscode.commands.registerCommand(
    "envMasker.toggleMasking",
    () => {
      envMasker.toggleMasking();
    }
  );

  /**
   * Command: envMasker.revealAll
   * Reveals all environment variable values in the currently active editor
   * if it contains a supported environment file. All values become visible
   * simultaneously without auto-hide timers.
   */
  const revealAllCommand = vscode.commands.registerCommand(
    "envMasker.revealAll",
    () => {
      envMasker.revealAllValues();
    }
  );

  /**
   * Command: envMasker.maskAll
   * Masks all environment variable values in the currently active editor
   * if it contains a supported environment file. Clears any revealed state
   * and applies masking decorations to all values.
   */
  const maskAllCommand = vscode.commands.registerCommand(
    "envMasker.maskAll",
    () => {
      envMasker.maskAllValues();
    }
  );

  /**
   * Event Listener: onDidChangeActiveTextEditor
   * Monitors when users switch between open files or editors. When a new
   * editor becomes active, checks if it contains an environment file and
   * applies masking if appropriate. Ensures masking follows the user's
   * navigation through different files.
   */
  const activeEditorListener = vscode.window.onDidChangeActiveTextEditor(
    (editor) => {
      if (editor) {
        envMasker.handleEditorChange(editor);
      }
    }
  );

  /**
   * Event Listener: onDidChangeTextEditorSelection
   * Monitors cursor movements and text selections in editors. Detects when
   * users click on masked environment variable values to toggle their
   * visibility. This enables the interactive click-to-reveal functionality
   * that is core to the extension's user experience.
   */
  const selectionListener = vscode.window.onDidChangeTextEditorSelection(
    (event) => {
      envMasker.handleSelectionChange(event);
    }
  );

  /**
   * Event Listener: onDidOpenTextDocument
   * Monitors when new documents are opened in VS Code. When an environment
   * file is opened, automatically processes it for masking to ensure newly
   * opened files are immediately protected according to the current settings.
   */
  const documentOpenListener = vscode.workspace.onDidOpenTextDocument(
    (document) => {
      envMasker.handleDocumentOpen(document);
    }
  );

  /**
   * Event Listener: onDidCloseTextDocument
   * Monitors when documents are closed in VS Code. Cleans up any stored
   * state for the closed document to prevent memory leaks and ensure
   * efficient resource management.
   */
  const documentCloseListener = vscode.workspace.onDidCloseTextDocument(
    (document) => {
      envMasker.handleDocumentClose(document);
    }
  );

  /**
   * Event Listener: onDidChangeConfiguration
   * Monitors changes to VS Code settings that affect the env-blur extension.
   * When users modify masking settings (character, length, patterns, etc.),
   * automatically reloads the configuration and reapplies masking with the
   * new settings to all open environment files.
   */
  const configurationListener = vscode.workspace.onDidChangeConfiguration(
    (event) => {
      if (event.affectsConfiguration("envMasker")) {
        envMasker.updateConfiguration();
      }
    }
  );

  //add all disposables to context for proper cleanup when extension deactivates
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

  //initialize masking for any environment files that are already open
  if (vscode.window.activeTextEditor) {
    envMasker.handleEditorChange(vscode.window.activeTextEditor);
  }
}

/**
 * Deactivates the env-blur extension when VS Code unloads it.
 * This function is called by VS Code when the extension is being disabled,
 * uninstalled, or when VS Code is shutting down. It ensures proper cleanup
 * of all resources to prevent memory leaks and system issues.
 *
 * The deactivation process includes:
 * - Disposing of the main EnvFileMasker instance
 * - Clearing all VS Code decorations
 * - Canceling any active auto-hide timers
 * - Cleaning up stored state and event listeners
 *
 * Note: VS Code automatically disposes of items in context.subscriptions,
 * but we explicitly dispose of the envMasker as an additional safety measure.
 *
 * @example
 * Called automatically by VS Code when:
 *  - Extension is disabled in the Extensions panel
 *  - Extension is uninstalled
 *  - VS Code is closing
 *  - Extension host is restarting
 */
export function deactivate() {
  if (envMasker) {
    envMasker.dispose();
  }
}
