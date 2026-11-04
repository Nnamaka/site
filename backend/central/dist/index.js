import {
  startGateway
} from "./chunk-XRN6QHVN.js";
import "./chunk-TSBBDGI5.js";

// src/index.ts
var server = startGateway();
var shutdown = () => server.close(() => process.exit(0));
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
