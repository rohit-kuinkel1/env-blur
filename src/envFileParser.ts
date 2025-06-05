/**
 * Environment File Parser for VS Code Extension
 *
 * This file contains the EnvFileParser class which is responsible for parsing
 * environment files (.env, .env.local, etc.) and extracting environment variable
 * key-value pairs with their precise location information.
 *
 * Key responsibilities:
 * - Parsing environment files line by line to identify valid environment variables
 * - Extracting key-value pairs with character-level position tracking
 * - Validating environment variable naming conventions
 * - Filtering out comments, empty lines, and export statements
 * - Providing utilities for position-based and range-based variable retrieval
 *
 * The parser follows standard .env file conventions:
 * - KEY=VALUE format
 * - Supports comments (# and //)
 * - Ignores empty lines and whitespace
 * - Does not support export statements
 * - Validates keys according to typical environment variable naming rules
 *
 * The parsed results include precise character positions which are essential
 * for the masking system to accurately target environment variable values
 * without affecting the surrounding text.
 *
 * @author Rohit Kuinkel
 * @since 0.0.1
 */

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
  /**
   * Parses an entire VS Code document for environment variables.
   * Iterates through all lines in the document and extracts valid environment
   * variable declarations. Skips comments, empty lines, and invalid entries.
   * Returns an array of EnvVariable objects with precise position information
   * for each key-value pair found.
   *
   * @param {vscode.TextDocument} document - The VS Code document to parse
   * @returns {EnvVariable[]} Array of parsed environment variables with position data
   *
   * @example
   * For a document containing:
   * API_KEY=secret123
   * # This is a comment
   * DB_HOST=localhost
   * # This is another comment
   *
   * Returns: [
   *    { line: 0, key: "API_KEY", value: "secret123", keyStart: 0, keyEnd: 7, valueStart: 8, valueEnd: 17 },
   *    { line: 2, key: "DB_HOST", value: "localhost", keyStart: 0, keyEnd: 7, valueStart: 8, valueEnd: 17 }
   * ]
   */
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

  /**
   * Parses a single line of text for environment variable declarations.
   * Validates the line format, extracts key-value pairs, and calculates
   * precise character positions for both keys and values. Filters out
   * invalid lines including comments, empty lines, and export statements.
   *
   * @param {vscode.TextLine} line - The VS Code text line object to parse
   * @param {lineNumber} number - The zero-based line number in the document
   * @returns {EnvVariable | null} Parsed environment variable object or null if line is invalid
   *
   * @example
   * Input line: "  API_KEY=secret123  "
   * Returns: {
   *    line: 0,
   *    key: "API_KEY",
   *    value: "secret123",
   *    keyStart: 2,      //position of 'A' in API_KEY
   *    keyEnd: 9,        //position after 'Y' in API_KEY
   *    valueStart: 10,   //position of 's' in secret123
   *    valueEnd: 19      //position after '3' in secret123
   * }
   */
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
    const valueEndIndex = valueStartIndex + value.length;

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

  /**
   * Validates whether a string is a valid environment variable key name.
   * Checks against standard environment variable naming conventions:
   * - Must start with a letter (a-z, A-Z) or underscore (_)
   * - Can contain letters, numbers, and underscores
   * - Cannot contain spaces, special characters, or start with numbers
   *
   * @param {string} key - The key string to validate
   * @returns {boolean} True if the key follows valid environment variable naming rules
   *
   * @example
   * isValidKey("API_KEY")      //returns true
   * isValidKey("DB_HOST_123")  //returns true
   * isValidKey("_PRIVATE")     //returns true
   * isValidKey("123_INVALID")  //returns false
   * isValidKey("API-KEY")      //returns false
   * isValidKey("API KEY")      //returns false
   */
  private isValidKey(key: string): boolean {
    //a very basic validation for environment variable keys
    const keyRegex = /^[a-zA-Z_][a-zA-Z0-9_]*$/;
    return keyRegex.test(key);
  }

  /**
   * Retrieves the environment variable at a specific cursor position.
   * Searches through all environment variables in the document to find one
   * whose value range contains the specified position. Useful for detecting
   * when users click on environment variable values.
   *
   * @param {vscode.TextDocument} document - The document to search in
   * @param {vscode.Position} position - The cursor position to check
   * @returns {EnvVariable | null} The environment variable at the position, or null if none found
   *
   * @example
   * For position at character 10 on line 0 of "API_KEY=secret123"
   * Returns the EnvVariable object for API_KEY since position falls within the value range
   *
   * For position at character 3 on line 0 of "API_KEY=secret123"
   * Returns null since position is within the key, not the value
   */
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

  /**
   * Retrieves all environment variables within a specified line range.
   * Parses the document and filters results to include only environment
   * variables whose line numbers fall within the given range. Useful for
   * processing selections or specific sections of environment files.
   *
   * @param {vscode.TextDocument} document - The document to search in
   * @param {vscode.Range} range - The line range to search within (inclusive)
   * @returns {EnvVariable[]} Array of environment variables within the specified range
   *
   * @example
   *  For a range from line 2 to line 5 in a document with:
   *  Line 0: API_KEY=secret
   *  Line 1: # Comment
   *  Line 2: DB_HOST=localhost
   *  Line 3: DB_PORT=5432
   *  Line 4: # Another comment
   *  Line 5: DB_NAME=myapp
   *  Line 6: CACHE_TTL=3600
   *
   *  Returns: [
   *    { line: 2, key: "DB_HOST", value: "localhost", ... },
   *    { line: 3, key: "DB_PORT", value: "5432", ... },
   *    { line: 5, key: "DB_NAME", value: "myapp", ... }
   *  ]
   */
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
