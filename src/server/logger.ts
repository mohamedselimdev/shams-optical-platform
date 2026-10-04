import "server-only";
import pino from "pino";
import { env } from "./env";

/**
 * Structured JSON logger. Sensitive fields are redacted by path so secrets,
 * credentials and prescription values never reach log sinks.
 */
export const logger = pino({
  level: env.LOG_LEVEL,
  base: { service: "shams" },
  redact: {
    paths: [
      "password",
      "*.password",
      "token",
      "*.token",
      "secret",
      "*.secret",
      "authorization",
      "*.authorization",
      "headers.cookie",
      "*.headers.cookie",
      "card",
      "*.card",
      "cvv",
      "*.cvv",
      "prescription",
      "*.prescription",
      "*.odSph",
      "*.osSph",
      "*.odCyl",
      "*.osCyl",
      "*.pd",
    ],
    censor: "[redacted]",
  },
});
