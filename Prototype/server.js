import "dotenv/config";
import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import authHandler from "./api/auth.js";
import analysesHandler from "./api/analyses.js";
import healthHandler from "./api/health.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const port = process.env.PORT || 3000;

app.use(express.json({ limit: "10mb" }));
app.use(express.static(__dirname));
app.all("/api/auth", authHandler);
app.all("/api/analyses", analysesHandler);
app.all("/api/health", healthHandler);

app.listen(port, () => {
  console.log(`Finora running at http://localhost:${port}`);
});
