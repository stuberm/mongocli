import type { CommandDefinition } from "../cli/types.js";
import { printVersion } from "../version.js";

export const versionCommand: CommandDefinition = {
  name: "version",
  aliases: ["v"],
  summary: "Show version",
  description: "Print the installed mongocli version.",
  examples: ["mongocli version", "mongocli --version"],
  execute: async () => {
    printVersion();
  },
};
