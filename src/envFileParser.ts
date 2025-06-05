import * as vscode from "vscode";

export interface EnvVariable {
  line: number;
  key: string;
  value: string;
  keyStart: number;
  keyEnd: number;
  valueStart: number;
  valueEnd: number;
}

export class EnvFileParser {
  public parseDocument(document: vscode.TextDocument): EnvVariable[] {
    const envVariables: EnvVariable[] = [];

    for (let i = 0; i < document.lineCount; i++) {
      const line = document.lineAt(i);
      const envVar = this.parseLine(line, i);

      if (envVar) {
        envVariables.push(envVar);
      }
    }

    return envVariables;
  }

  private parseLine(
    line: vscode.TextLine,
    lineNumber: number
  ): EnvVariable | null {
    const text = line.text.trim();

    //skip empty lines and comments in the file
    if (!text || text.startsWith("#") || text.startsWith("//")) {
      return null;
    }

    //skip export statements (we are not supporting them as per our requirements)
    if (text.startsWith("export ")) {
      return null;
    }

    const equalsIndex = text.indexOf("=");
    if (equalsIndex === -1) {
      return null;
    }

    const key = text.substring(0, equalsIndex).trim();
    const value = text.substring(equalsIndex + 1);

    //validate the key with basic validation for environment variable names)
    if (!this.isValidKey(key)) {
      return null;
    }

    if (value.length === 0) {
      return null;
    }

    //calculate the positions in the original line
    const originalText = line.text;
    const keyStartIndex = originalText.indexOf(key);
    const equalsInOriginal = originalText.indexOf("=", keyStartIndex);
    const valueStartIndex = equalsInOriginal + 1;
    const valueEndIndex = originalText.length;

    return {
      line: lineNumber,
      key: key,
      value: value,
      keyStart: keyStartIndex,
      keyEnd: keyStartIndex + key.length,
      valueStart: valueStartIndex,
      valueEnd: valueEndIndex,
    };
  }

  private isValidKey(key: string): boolean {
    //a very basic validation for environment variable keys
    const keyRegex = /^[a-zA-Z_][a-zA-Z0-9_]*$/;
    return keyRegex.test(key);
  }

  public getValueAtPosition(
    document: vscode.TextDocument,
    position: vscode.Position
  ): EnvVariable | null {
    const envVariables = this.parseDocument(document);

    return (
      envVariables.find(
        (envVar) =>
          envVar.line === position.line &&
          position.character >= envVar.valueStart &&
          position.character <= envVar.valueEnd
      ) || null
    );
  }

  public getAllValuesInRange(
    document: vscode.TextDocument,
    range: vscode.Range
  ): EnvVariable[] {
    const envVariables = this.parseDocument(document);

    return envVariables.filter(
      (envVar) =>
        envVar.line >= range.start.line && envVar.line <= range.end.line
    );
  }
}
