/**
 * Configuration management for the env-blur VS Code extension.
 *
 * This file contains the MaskingConfig class which handles all configuration-related
 * functionality for the extension. It manages user settings like:
 * - Masking character and length strategies
 * - File patterns for enabling/disabling masking
 * - Blacklisted files and directories
 * - Auto-hide timing for revealed values
 *
 * The class provides methods to read, validate, update, and reset configuration
 * settings while ensuring proper defaults and input validation. It acts as a
 * centralized interface between VS Code's configuration system and the extension's
 * masking functionality.
 *
 * @author Rohit Kuinkel
 * @since 0.0.1
 */

import * as vscode from "vscode";
import * as path from "path";

/**
 * Defines the strategy for determining how many masking characters to display
 * when hiding sensitive values in environment files. See the example below for a
 * clearer understanding.
 *
 * @example
 * Original value: "my-secret-api-key-12345"
 *
 * With "fixed" strategy (say, fixedMaskLength = 8):
 * Shows: "••••••••" (always 8 characters regardless of original length)
 *
 * With "proportional" strategy:
 * Shows: "••••••••••••••••••••••" (22 characters, matching original length)
 */
export type MaskingLengthStrategy = "eb_fixedLength" | "eb_proportionalLength";

export class MaskingConfig {
  private static readonly EXTENSION_NAME = "env-blur";
  private static readonly DEFAULT_MASKING_LENGTH = 20;
  private static readonly DEFAULT_AUTO_HIDE_DELAY = 0;
  /**
   * Holds the stored configuration for the extension.
   * The configuration is fetched from the vscode workspace using
   * vscode.workspace.getConfiguration
   */
  private config: vscode.WorkspaceConfiguration;

  /**
   * Initializes an instance of MaskingConfig with the current workspace configuration.
   * Loads the extension configuration using the var EXTENSION_NAME.
   */
  constructor() {
    this.config = vscode.workspace.getConfiguration(
      MaskingConfig.EXTENSION_NAME
    );
  }

  /**
   * Reloads the workspace configuration to pick up any changes.
   * This method should be called when configuration changes are detected.
   */
  public reload(): void {
    this.config = vscode.workspace.getConfiguration(
      MaskingConfig.EXTENSION_NAME
    );
  }

  /**
   * Gets the character used for masking sensitive values.
   * Validates that the character is a single character, defaults to '•' if invalid.
   * @returns {string} The masking character (single character)
   */
  public getMaskingCharacter(): string {
    const char = this.config.get<string>("eb_maskingCharacter", "•");

    if (char.length !== 1) {
      console.warn(`Invalid masking character '${char}', using default '•'`);
      return "•";
    }

    return char;
  }

  /**
   * Gets the strategy for determining mask length
   * @returns {MaskingLengthStrategy} Either "fixedLength" for a constant length or "proportionalLength" to match original value length
   */
  public getMaskingLengthStrategy(): MaskingLengthStrategy {
    return this.config.get<MaskingLengthStrategy>(
      "eb_maskingLengthStrategy",
      "eb_proportionalLength"
    );
  }

  /**
   * Gets the fixed length for masking when using "fixed" masking strategy
   * Validates the length is between 5-100 characters, defaults to 20 if invalid
   * @returns {number} The number of characters to use for fixed-length masking
   */
  public getFixedMaskLength(): number {
    const length = this.config.get<number>(
      "eb_fixedMaskLength",
      MaskingConfig.DEFAULT_MASKING_LENGTH
    );

    if (isNaN(length) || length < 5 || length > 100) {
      console.warn(
        `Invalid fixed mask length ${length}, using default ${MaskingConfig.DEFAULT_MASKING_LENGTH}`
      );
      return MaskingConfig.DEFAULT_MASKING_LENGTH;
    }

    //if everything was legit, return the stored value
    return length;
  }

  /**
   * Gets the delay in milliseconds before automatically hiding revealed values.
   * A value of 0 means no auto-hide. Validates range is 0-10000ms (0-10sec).
   * @returns {number} Auto-hide delay in milliseconds, 0 for no auto-hide
   */
  public getAutoHideDelay(): number {
    const delay = this.config.get<number>(
      "eb_autoHideDelay",
      MaskingConfig.DEFAULT_AUTO_HIDE_DELAY
    );

    if (isNaN(delay) || delay < 0 || delay > 10000) {
      console.warn(
        `Invalid auto-hide delay ${delay}, using default ${MaskingConfig.DEFAULT_AUTO_HIDE_DELAY}`
      );
      return MaskingConfig.DEFAULT_AUTO_HIDE_DELAY;
    }

    //if everything was legit, return the stored value
    return delay;
  }

  /**
   * Gets the list of file patterns that should be excluded from masking.
   * @returns {string[]} Array of file patterns/paths to blacklist from masking
   */
  public getBlacklistedFiles(): string[] {
    return this.config.get<string[]>("eb_blacklistedFiles", []);
  }

  /**
   * Gets the list of file patterns where masking should be enabled
   * Ensures .env is always included in the patterns for basic functionality
   * @returns {string[]} Array of file patterns where masking should be active
   */
  public getEnabledFilePatterns(): string[] {
    const patterns = this.config.get<string[]>("eb_enabledFilePatterns", [
      ".env",
      ".env.local",
      ".env.development",
      ".env.production",
      ".env.test",
    ]);

    //ensure that we at least have .env because thats the one thats mostly used
    if (patterns.length === 0 || !patterns.includes(".env")) {
      patterns.push(".env");
    }

    return patterns;
  }

  /**
   * Checks if a given file path should be excluded from masking based on blacklist patterns
   * Supports wildcard patterns (* and ?) for flexible matching
   * @param {string} filePath - The full file path to check
   * @returns {boolean} True if the file is blacklisted and should not be masked
   */
  public isFileBlacklisted(filePath: string): boolean {
    const blacklistedFiles = this.getBlacklistedFiles();

    if (blacklistedFiles.length === 0) {
      return false;
    }

    const fileName = path.basename(filePath);
    const normalizedPath = filePath.replace(/\\/g, "/");

    return blacklistedFiles.some((pattern) => {
      if (pattern.includes("*") || pattern.includes("?")) {
        const regex = new RegExp(
          "^" + pattern.replace(/\*/g, ".*").replace(/\?/g, ".") + "$"
        );
        return regex.test(fileName) || regex.test(normalizedPath);
      }

      //exact match for filename or full path
      return (
        fileName === pattern ||
        normalizedPath.endsWith(pattern) ||
        normalizedPath === pattern
      );
    });
  }

  /**
   * Updates a specific configuration setting and reloads the configuration
   * @param {string} key - The configuration key to update
   * @param {T} value - The new value for the setting
   * @param {vscode.ConfigurationTarget} [target] - Configuration scope (Global, Workspace, etc.)
   * @returns {Promise<void>} Promise that resolves when the setting is updated
   */
  public async updateSetting<T>(
    key: string,
    value: T,
    target?: vscode.ConfigurationTarget
  ): Promise<void> {
    try {
      await this.config.update(
        key,
        value,
        target || vscode.ConfigurationTarget.Global
      );
      this.reload();
    } catch (error) {
      console.error(`Failed to update setting ${key}:`, error);
      vscode.window.showErrorMessage(`Failed to update setting: ${key}`);
    }
  }

  /**
   * Exports all current configuration settings as a plain object
   * Useful for backup, sharing, or debugging configuration state
   * @returns {object} Object containing all current configuration values
   */
  public exportSettings(): { [key: string]: any } {
    return {
      maskingCharacter: this.getMaskingCharacter(),
      maskingLength: this.getMaskingLengthStrategy(),
      fixedMaskLength: this.getFixedMaskLength(),
      autoHideDelay: this.getAutoHideDelay(),
      blacklistedFiles: this.getBlacklistedFiles(),
      enabledFilePatterns: this.getEnabledFilePatterns(),
    };
  }

  /**
   * Imports configuration settings from a settings object
   * Only imports valid configuration keys, ignoring unknown properties
   * @param {object} settings - Object containing configuration values to import
   * @returns {Promise<void>} Promise that resolves when all settings are imported
   */
  public async importSettings(settings: { [key: string]: any }): Promise<void> {
    const validKeys = [
      "eb_maskingCharacter",
      "eb_maskingLength",
      "eb_fixedMaskLength",
      "eb_autoHideDelay",
      "eb_blacklistedFiles",
      "eb_enabledFilePatterns",
    ];

    for (const [key, value] of Object.entries(settings)) {
      if (validKeys.includes(key)) {
        await this.updateSetting(key, value);
      }
    }
  }

  /**
   * Resets all configuration settings to their default values
   * Clears any custom user configurations and restores extension defaults
   * @returns {Promise<void[]>} Promise that resolves when all settings are reset
   */
  public resetToDefaults(): Promise<void[]> {
    const defaultSettings = [
      this.updateSetting("eb_maskingCharacter", undefined),
      this.updateSetting("eb_maskingLength", undefined),
      this.updateSetting("eb_fixedMaskLength", undefined),
      this.updateSetting("eb_autoHideDelay", undefined),
      this.updateSetting("eb_blacklistedFiles", undefined),
      this.updateSetting("eb_enabledFilePatterns", undefined),
    ];

    return Promise.all(defaultSettings);
  }
}
