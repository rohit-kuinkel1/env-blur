import * as vscode from "vscode";
import * as path from "path";

export type MaskingLengthStrategy = "fixed" | "proportional";

export class MaskingConfig {
  private static readonly EXTENSION_NAME = "env-blur";
  private config: vscode.WorkspaceConfiguration;

  constructor() {
    this.config = vscode.workspace.getConfiguration(
      MaskingConfig.EXTENSION_NAME
    );
  }

  public reload(): void {
    this.config = vscode.workspace.getConfiguration(
      MaskingConfig.EXTENSION_NAME
    );
  }

  public getMaskingCharacter(): string {
    const char = this.config.get<string>("maskingCharacter", "•");

    //validate that it's a single character
    if (char.length !== 1) {
      console.warn(`Invalid masking character '${char}', using default '•'`);
      return "•";
    }

    return char;
  }

  public getMaskingLength(): MaskingLengthStrategy {
    return this.config.get<MaskingLengthStrategy>(
      "maskingLength",
      "proportional"
    );
  }

  public getFixedMaskLength(): number {
    const length = this.config.get<number>("fixedMaskLength", 20);

    if (length < 5 || length > 100) {
      console.warn(`Invalid fixed mask length ${length}, using default 20`);
      return 20;
    }

    return length;
  }

  public getAutoHideDelay(): number {
    const delay = this.config.get<number>("autoHideDelay", 0);

    if (delay < 0 || delay > 10000) {
      console.warn(`Invalid auto-hide delay ${delay}, using default 0`);
      return 0;
    }

    return delay;
  }

  public getBlacklistedFiles(): string[] {
    return this.config.get<string[]>("blacklistedFiles", []);
  }

  public getEnabledFilePatterns(): string[] {
    const patterns = this.config.get<string[]>("enabledFilePatterns", [
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

  public exportSettings(): { [key: string]: any } {
    return {
      maskingCharacter: this.getMaskingCharacter(),
      maskingLength: this.getMaskingLength(),
      fixedMaskLength: this.getFixedMaskLength(),
      autoHideDelay: this.getAutoHideDelay(),
      blacklistedFiles: this.getBlacklistedFiles(),
      enabledFilePatterns: this.getEnabledFilePatterns(),
    };
  }

  public async importSettings(settings: { [key: string]: any }): Promise<void> {
    const validKeys = [
      "maskingCharacter",
      "maskingLength",
      "fixedMaskLength",
      "autoHideDelay",
      "blacklistedFiles",
      "enabledFilePatterns",
    ];

    for (const [key, value] of Object.entries(settings)) {
      if (validKeys.includes(key)) {
        await this.updateSetting(key, value);
      }
    }
  }

  public resetToDefaults(): Promise<void[]> {
    const defaultSettings = [
      this.updateSetting("maskingCharacter", undefined),
      this.updateSetting("maskingLength", undefined),
      this.updateSetting("fixedMaskLength", undefined),
      this.updateSetting("autoHideDelay", undefined),
      this.updateSetting("blacklistedFiles", undefined),
      this.updateSetting("enabledFilePatterns", undefined),
    ];

    return Promise.all(defaultSettings);
  }
}
