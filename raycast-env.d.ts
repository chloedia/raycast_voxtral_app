/// <reference types="@raycast/api">

/* 🚧 🚧 🚧
 * This file is auto-generated from the extension's manifest.
 * Do not modify manually. Instead, update the `package.json` file.
 * 🚧 🚧 🚧 */

/* eslint-disable @typescript-eslint/ban-types */

type ExtensionPreferences = {
  /** Mistral API Key - Your Mistral AI API key for Voxtral */
  "apiKey": string,
  /** Auto-Reformulate - Automatically reformulate transcriptions before pasting */
  "autoReformulate": boolean,
  /** Reformulation Prompt - Custom system prompt for reformulating transcriptions. Leave empty for the default. */
  "reformulatePrompt": string
}

/** Preferences accessible in all the extension's commands */
declare type Preferences = ExtensionPreferences

declare namespace Preferences {
  /** Preferences accessible in the `dictate` command */
  export type Dictate = ExtensionPreferences & {}
  /** Preferences accessible in the `reformulate` command */
  export type Reformulate = ExtensionPreferences & {}
  /** Preferences accessible in the `speak` command */
  export type Speak = ExtensionPreferences & {
  /** French Voice - Voxtral voice used when the clipboard text is detected as French */
  "frenchVoice": string,
  /** English Voice - Voxtral voice used when the clipboard text is detected as English, e.g. en_paul_neutral, gb_jane_neutral */
  "englishVoice": string
}
}

declare namespace Arguments {
  /** Arguments passed to the `dictate` command */
  export type Dictate = {}
  /** Arguments passed to the `reformulate` command */
  export type Reformulate = {}
  /** Arguments passed to the `speak` command */
  export type Speak = {}
}

