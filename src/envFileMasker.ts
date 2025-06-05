/**
 * Environment File Masker for VS Code Extension
 *
 * This file contains the EnvFileMasker class which is the core component responsible
 * for masking and revealing sensitive values in environment files (.env, .env.local, ...).
 *
 * Does the following:
 * - Detecting and parsing environment variable files
 * - Applying visual masking to sensitive values using VS Code decorations
 * - Handling user interactions (clicks) to toggle value visibility
 * - Managing auto-hide timers for revealed values
 * - Integrating with VS Code's editor events and lifecycle
 *
 * The masker uses a decoration-based approach where masked values are visually
 * replaced with masking characters (like bullets '•') while preserving the original
 * file content. Users can click on masked values to temporarily reveal them.
 *
 * @author Rohit Kuinkel
 * @since 0.0.1
 */

import * as vscode from "vscode";
import { EnvFileParser, EnvVariable } from "./envFileParser";
import { MaskingConfig, MaskingLengthStrategy } from "./config";

interface RevealedValue {
  line: number;
  startChar: number;
  endChar: number;
  timeout?: NodeJS.Timeout;
}

export class EnvFileMasker implements vscode.Disposable {
  //the following errors are just TS errors, hence the !
  private maskDecoration!: vscode.TextEditorDecorationType;
  private revealDecoration!: vscode.TextEditorDecorationType;

  private parser: EnvFileParser;
  private config: MaskingConfig;

  private revealedValues: Map<string, Map<number, RevealedValue>>;
  private enabled: boolean = true;

  /**
   * Initializes a new instance of EnvFileMasker.
   * It sets up the environment file parser, configuration manager, and processes
   * all currently open editors that match the supported file patterns.
   * Creates the necessary VS Code decorations for masking and revealing values.
   */
  constructor() {
    this.parser = new EnvFileParser();
    this.config = new MaskingConfig();
    this.revealedValues = new Map();

    this.createDecorations();
    this.processAllOpenEditors();
  }

  /**
   * Creates VS Code text editor decorations for masking and revealing values.
   * Sets up two decoration types:
   * - maskDecoration: For displaying masked values with custom styling
   * - revealDecoration: For highlighting revealed values with background color
   *
   * These decorations are applied dynamically based on user interactions.
   */
  private createDecorations(): void {
    //decoration/style for masked values
    this.maskDecoration = vscode.window.createTextEditorDecorationType({
      opacity: "1",
      cursor: "pointer",
    });

    //decoration/style for revealed values
    this.revealDecoration = vscode.window.createTextEditorDecorationType({
      opacity: "1",
      cursor: "pointer",
      backgroundColor: new vscode.ThemeColor("editor.wordHighlightBackground"),
    });
  }

  /**
   * Handles when the active text editor changes in VS Code.
   * Processes the new editor for masking if it contains a supported environment file.
   * This is called automatically by VS Code when users switch between open files.
   *
   * @param {vscode.TextEditor} editor - The newly active text editor
   */
  public handleEditorChange(editor: vscode.TextEditor): void {
    if (this.shouldProcessFile(editor.document)) {
      this.processEditor(editor);
    }
  }

  /**
   * Handles when a new document is opened in VS Code.
   * If the opened document is a supported environment file, finds the corresponding
   * editor and processes it for masking. This ensures newly opened files are
   * automatically masked according to the current configuration.
   *
   * @param {vscode.TextDocument} document - The newly opened document
   */
  public handleDocumentOpen(document: vscode.TextDocument): void {
    if (this.shouldProcessFile(document)) {
      const editor = vscode.window.visibleTextEditors.find(
        (e) => e.document === document
      );
      if (editor) {
        this.processEditor(editor);
      }
    }
  }

  /**
   * Handles when a document is closed in VS Code.
   * Cleans up any stored revealed value state for the closed document to prevent
   * memory leaks. Also clears any auto-hide timers associated with the file.
   *
   * @param {vscode.TextDocument} document - The document being closed
   */
  public handleDocumentClose(document: vscode.TextDocument): void {
    const uri = document.uri.toString();
    this.revealedValues.delete(uri);
  }

  /**
   * Handles text editor selection changes (including cursor movements and clicks).
   * Detects when users click on masked environment variable values and toggles
   * their visibility. Only processes single-cursor selections in supported files.
   *
   * @param {vscode.TextEditorSelectionChangeEvent} event - The selection change event containing editor and selection info
   */
  public handleSelectionChange(
    event: vscode.TextEditorSelectionChangeEvent
  ): void {
    const editor = event.textEditor;
    if (!this.shouldProcessFile(editor.document) || !this.enabled) {
      return;
    }

    const selection = event.selections[0];
    if (!selection || !selection.isEmpty) {
      return;
    }

    const clickPosition = selection.active;
    this.handleClick(editor, clickPosition);
  }

  /**
   * Determines whether a given document should be processed for masking.
   * Checks if the file matches the enabled file patterns and is not in the blacklist.
   * Supports wildcard patterns for flexible file matching.
   *
   * @param {vscode.TextDocument} document - The document to check
   * @returns {boolean} True if the file should be processed for masking, false otherwise
   */
  private shouldProcessFile(document: vscode.TextDocument): boolean {
    const fileName = this.getFileName(document);

    //check if the file has been blacklisted
    if (this.config.isFileBlacklisted(document.uri.fsPath)) {
      return false;
    }

    //check if file matches enabled patterns
    return this.config.getEnabledFilePatterns().some((pattern) => {
      if (pattern.includes("*") || pattern.includes("?")) {
        const regex = new RegExp(
          "^" + pattern.replace(/\*/g, ".*").replace(/\?/g, ".") + "$"
        );
        return regex.test(fileName);
      }
      return fileName === pattern;
    });
  }

  /**
   * Extracts the filename from a document's file path.
   * Handles both Windows and Unix-style path separators to ensure
   * cross-platform compatibility.
   *
   * @param {vscode.TextDocument} document - The document to extract filename from
   * @returns {string} The filename without path (e.g., ".env" from "/path/to/.env")
   */
  private getFileName(document: vscode.TextDocument): string {
    const path = document.uri.fsPath;
    const parts = path.split(/[/\\]/);
    return parts[parts.length - 1];
  }

  /**
   * Processes a single text editor for environment variable masking.
   * Parses the document for environment variables and applies appropriate
   * masking decorations. Only processes if masking is currently enabled.
   *
   * @param {vscode.TextEditor} editor - The text editor to process
   */
  private processEditor(editor: vscode.TextEditor): void {
    if (!this.enabled) {
      return;
    }

    const envVariables = this.parser.parseDocument(editor.document);
    this.applyMasking(editor, envVariables);
  }

  /**
   * Processes all currently visible text editors for masking.
   * Iterates through VS Code's visible editors and applies masking to any
   * that contain supported environment files. Used during initialization
   * and when masking is re-enabled.
   */
  private processAllOpenEditors(): void {
    vscode.window.visibleTextEditors.forEach((editor) => {
      if (this.shouldProcessFile(editor.document)) {
        this.processEditor(editor);
      }
    });
  }

  /**
   * Applies masking decorations to environment variables in a text editor.
   * Creates visual decorations for both masked and revealed values, replacing
   * sensitive values with masking characters while preserving the original file content.
   * Manages the display state based on user interactions and auto-hide timers.
   *
   * @param {vscode.TextEditor} editor - The text editor to apply decorations to
   * @param {EnvVariable[]} envVariables - Array of parsed environment variables to mask
   */
  private applyMasking(
    editor: vscode.TextEditor,
    envVariables: EnvVariable[]
  ): void {
    const uri = editor.document.uri.toString();
    const revealedForFile = this.revealedValues.get(uri) || new Map();

    const maskDecorations: vscode.DecorationOptions[] = [];
    const revealDecorations: vscode.DecorationOptions[] = [];

    envVariables.forEach((envVar) => {
      const isRevealed = revealedForFile.has(envVar.line);

      if (isRevealed) {
        //show original value but with highlight
        revealDecorations.push({
          range: new vscode.Range(
            envVar.line,
            envVar.valueStart,
            envVar.line,
            envVar.valueEnd
          ),
        });
      } else {
        //show the masked value since the real value is not revealed
        const maskText = this.generateMask(envVar.value);
        maskDecorations.push({
          range: new vscode.Range(
            envVar.line,
            envVar.valueStart,
            envVar.line,
            envVar.valueEnd
          ),
          renderOptions: {
            after: {
              contentText: maskText,
              color: new vscode.ThemeColor("editor.foreground"),
            },
          },
        });
      }
    });

    editor.setDecorations(this.maskDecoration, maskDecorations);
    editor.setDecorations(this.revealDecoration, revealDecorations);
  }

  /**
   * Generates a masking string to visually replace sensitive values.
   * Uses the configured masking character and length strategy to create
   * an appropriate mask. Supports both fixed-length and proportional masking.
   *
   * @param {string} value - The original value to generate a mask for
   * @returns {string} The generated mask string (e.g., "••••••••" for an 8-character value)
   */
  private generateMask(value: string): string {
    const maskChar = this.config.getMaskingCharacter();
    const strategy = this.config.getMaskingLengthStrategy();

    if ((strategy as MaskingLengthStrategy) === "eb_fixedLength") {
      return maskChar.repeat(this.config.getFixedMaskLength());
    } else {
      return maskChar.repeat(value.length);
    }
  }

  /**
   * Handles user click events on the text editor.
   * Determines if the click was on an environment variable value and toggles
   * its visibility accordingly. If the click was outside any values, hides
   * all currently revealed values for the file.
   *
   * @param {vscode.TextEditor} editor - The editor where the click occurred
   * @param {vscode.Position} position - The position of the click in the editor
   */
  private handleClick(
    editor: vscode.TextEditor,
    position: vscode.Position
  ): void {
    const envVariables = this.parser.parseDocument(editor.document);
    const uri = editor.document.uri.toString();

    //find if the last click was on a value
    const clickedVariable = envVariables.find(
      (envVar) =>
        envVar.line === position.line &&
        position.character >= envVar.valueStart &&
        position.character <= envVar.valueEnd
    );

    if (clickedVariable) {
      this.toggleValueVisibility(editor, clickedVariable, uri);
    } else {
      //if the click was outside then we hide all currently revealed values for this file
      this.hideAllValuesForFile(editor, uri);
    }
  }

  /**
   * Toggles the visibility of a specific environment variable value.
   * Switches between masked and revealed states for the clicked value.
   * Sets up auto-hide timers if configured. Manages the revealed values
   * state and triggers a re-render of the editor decorations.
   *
   * @param {vscode.TextEditor} editor - The editor containing the value
   * @param {EnvVariable} envVar - The environment variable to toggle
   * @param {string} uri - The URI of the document
   */
  private toggleValueVisibility(
    editor: vscode.TextEditor,
    envVar: EnvVariable,
    uri: string
  ): void {
    if (!this.revealedValues.has(uri)) {
      this.revealedValues.set(uri, new Map());
    }

    const revealedForFile = this.revealedValues.get(uri)!;

    if (revealedForFile.has(envVar.line)) {
      //hide the value
      const revealed = revealedForFile.get(envVar.line)!;
      if (revealed.timeout) {
        clearTimeout(revealed.timeout);
      }
      revealedForFile.delete(envVar.line);
    } else {
      //reveal the value
      const revealedValue: RevealedValue = {
        line: envVar.line,
        startChar: envVar.valueStart,
        endChar: envVar.valueEnd,
      };

      //set auto-hide timeout if configured
      const autoHideDelay = this.config.getAutoHideDelay();
      if (autoHideDelay > 0) {
        revealedValue.timeout = setTimeout(() => {
          revealedForFile.delete(envVar.line);
          this.processEditor(editor);
        }, autoHideDelay);
      }

      revealedForFile.set(envVar.line, revealedValue);
    }

    this.processEditor(editor);
  }

  /**
   * Hides all currently revealed values for a specific file.
   * Clears all auto-hide timers and removes all values from the revealed state.
   * Triggers a re-render of the editor to apply the masking decorations.
   *
   * @param {vscode.TextEditor} editor - The editor to hide values for
   * @param {string} uri - The URI of the document
   */
  private hideAllValuesForFile(editor: vscode.TextEditor, uri: string): void {
    const revealedForFile = this.revealedValues.get(uri);
    if (revealedForFile && revealedForFile.size > 0) {
      revealedForFile.forEach((revealed) => {
        if (revealed.timeout) {
          clearTimeout(revealed.timeout);
        }
      });

      revealedForFile.clear();
      this.processEditor(editor);
    }
  }

  /**
   * Toggles the entire masking system on or off.
   * When disabled, removes all decorations from visible editors.
   * When enabled, re-processes all open editors for masking.
   * Provides user feedback through VS Code information messages.
   */
  public toggleMasking(): void {
    this.enabled = !this.enabled;

    if (this.enabled) {
      this.processAllOpenEditors();
      vscode.window.showInformationMessage("Environment file masking enabled");
    } else {
      //clear all decorations
      vscode.window.visibleTextEditors.forEach((editor) => {
        editor.setDecorations(this.maskDecoration, []);
        editor.setDecorations(this.revealDecoration, []);
      });
      vscode.window.showInformationMessage("Environment file masking disabled");
    }
  }

  /**
   * Reveals all environment variable values in the currently active editor.
   * Adds all environment variables to the revealed state without auto-hide timers.
   * Only works if the active editor contains a supported environment file.
   * Provides user feedback through VS Code messages.
   */
  public revealAllValues(): void {
    const activeEditor = vscode.window.activeTextEditor;
    if (!activeEditor || !this.shouldProcessFile(activeEditor.document)) {
      vscode.window.showWarningMessage(
        "No active .env file to reveal values for"
      );
      return;
    }

    const envVariables = this.parser.parseDocument(activeEditor.document);
    const uri = activeEditor.document.uri.toString();

    if (!this.revealedValues.has(uri)) {
      this.revealedValues.set(uri, new Map());
    }

    const revealedForFile = this.revealedValues.get(uri)!;

    envVariables.forEach((envVar) => {
      revealedForFile.set(envVar.line, {
        line: envVar.line,
        startChar: envVar.valueStart,
        endChar: envVar.valueEnd,
      });
    });

    this.processEditor(activeEditor);
    vscode.window.showInformationMessage("All values revealed");
  }

  /**
   * Masks all environment variable values in the currently active editor.
   * Removes all values from the revealed state and applies masking decorations.
   * Only works if the active editor contains a supported environment file.
   * Provides user feedback through VS Code messages.
   */
  public maskAllValues(): void {
    const activeEditor = vscode.window.activeTextEditor;
    if (!activeEditor || !this.shouldProcessFile(activeEditor.document)) {
      vscode.window.showWarningMessage(
        "No active .env file to mask values for"
      );
      return;
    }

    const uri = activeEditor.document.uri.toString();
    this.hideAllValuesForFile(activeEditor, uri);
    vscode.window.showInformationMessage("All values masked");
  }

  /**
   * Updates the configuration and re-processes all open editors.
   * Called when VS Code configuration changes are detected.
   * Reloads the configuration from VS Code settings and applies
   * any changes to currently open environment files.
   */
  public updateConfiguration(): void {
    this.config.reload();
    this.processAllOpenEditors();
  }

  /**
   * Disposes of all resources used by the EnvFileMasker.
   * Cleans up VS Code decorations, clears all auto-hide timers,
   * and removes all revealed value state. Should be called when
   * the extension is deactivated to prevent memory leaks.
   */
  public dispose(): void {
    this.maskDecoration.dispose();
    this.revealDecoration.dispose();

    //clear all timeouts
    this.revealedValues.forEach((revealedForFile) => {
      revealedForFile.forEach((revealed) => {
        if (revealed.timeout) {
          clearTimeout(revealed.timeout);
        }
      });
    });

    this.revealedValues.clear();
  }
}
