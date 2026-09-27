globalThis.process ??= {};
globalThis.process.env ??= {};
import "cloudflare:workers";
import { w } from "./chunks/worker-entry_BtuCSIin.mjs";
export {
  w as default
};
