import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { pool } from "../db/pool.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function initDb() {
  const schemaPath = path.join(__dirname, "..", "..", "db", "schema.sql");
  const schemaSql = await fs.readFile(schemaPath, "utf8");

  await pool.query(schemaSql);
  console.log("Database schema initialized.");
}

initDb()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
