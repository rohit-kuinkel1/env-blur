import * as vscode from "vscode";
import { EnvFileParser, EnvVariable } from "./envFileParser";
import { MaskingConfig } from "./config";

interface RevealedValue {
  line: number;
  startChar: number;
  endChar: number;
  timeout?: NodeJS.Timeout;
}

export class EnvFileMasker implements vscode.Disposable {
  private maskDecoration: vscode.TextEditorDecorationType;
  private revealDecoration: vscode.TextEditorDecorationType;
  private parser: EnvFileParser;
  private config: MaskingConfig;
  private revealedValues: Map<string, Map<number, RevealedValue>>;
  private enabled: boolean = true;

  constructor() {
    this.parser = new EnvFileParser();
    this.config = new MaskingConfig();
    this.revealedValues = new Map();

    this.createDecorations();
    this.processAllOpenEditors();
  }

  private createDecorations(): void {
    //decoration for masked values
    this.maskDecoration = vscode.window.createTextEditorDecorationType({
      opacity: "1",
      cursor: "pointer",
    });

    //decoration for revealed values
    this.revealDecoration = vscode.window.createTextEditorDecorationType({
      opacity: "1",
      cursor: "pointer",
      backgroundColor: new vscode.ThemeColor("editor.wordHighlightBackground"),
    });
  }

  public handleEditorChange(editor: vscode.TextEditor): void {
    if (this.shouldProcessFile(editor.document)) {
      this.processEditor(editor);
    }
  }

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

  public handleDocumentClose(document: vscode.TextDocument): void {
    const uri = document.uri.toString();
    this.revealedValues.delete(uri);
  }

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

  private shouldProcessFile(document: vscode.TextDocument): boolean {
    const fileName = this.getFileName(document);

    //check if file is blacklisted
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

  private getFileName(document: vscode.TextDocument): string {
    const path = document.uri.fsPath;
    const parts = path.split(/[/\\]/);
    return parts[parts.length - 1];
  }

  private processEditor(editor: vscode.TextEditor): void {
    if (!this.enabled) {
      return;
    }

    const envVariables = this.parser.parseDocument(editor.document);
    this.applyMasking(editor, envVariables);
  }

  private processAllOpenEditors(): void {
    vscode.window.visibleTextEditors.forEach((editor) => {
      if (this.shouldProcessFile(editor.document)) {
        this.processEditor(editor);
      }
    });
  }

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

  private generateMask(value: string): string {
    const maskChar = this.config.getMaskingCharacter();
    const strategy = this.config.getMaskingLength();

    if (strategy === "fixed") {
      return maskChar.repeat(this.config.getFixedMaskLength());
    } else {
      return maskChar.repeat(value.length);
    }
  }

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

  public updateConfiguration(): void {
    this.config.reload();
    this.processAllOpenEditors();
  }

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
