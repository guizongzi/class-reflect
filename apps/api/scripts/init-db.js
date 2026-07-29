import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { closeDb, query } from "../db.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const schemaPath = path.resolve(__dirname, "../schema.sql");

try {
  const schema = await fs.readFile(schemaPath, "utf8");
  await query(schema);
  console.log("database schema initialized");
} finally {
  await closeDb();
}
