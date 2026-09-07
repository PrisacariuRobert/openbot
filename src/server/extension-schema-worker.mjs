import { parentPort, workerData } from "node:worker_threads";
import { AjvJsonSchemaValidator } from "@modelcontextprotocol/client/validators/ajv";

// A remote schema can contain expensive regexes. Compile/validate away from the
// host event loop, under the caller's wall-clock and worker memory bounds.
try {
  const result = new AjvJsonSchemaValidator().getValidator(workerData.schema)(workerData.arguments);
  parentPort.postMessage({ valid: result.valid });
} catch { parentPort.postMessage({ valid: false }); }
