import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PostgresRepository } from "../repositories/postgres-repository.js";
import { OllamaClient } from "../services/ollama-client.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function chunkText(text, size = 500) {
  const chunks = [];
  let index = 0;

  for (let start = 0; start < text.length; start += size) {
    chunks.push({
      chunkIndex: index,
      content: text.slice(start, start + size)
    });
    index += 1;
  }

  return chunks;
}

async function seed() {
  const repository = new PostgresRepository();
  const ollamaClient = new OllamaClient();
  const docsDir = path.join(__dirname, "..", "..", "docs", "knowledge");
  const fileNames = await fs.readdir(docsDir);

  for (const fileName of fileNames.filter((name) => name.endsWith(".md"))) {
    const body = await fs.readFile(path.join(docsDir, fileName), "utf8");
    const slug = fileName.replace(/\.md$/, "");
    const title = body.split("\n")[0].replace(/^#\s*/, "") || slug;
    const document = await repository.upsertDocument({
      slug,
      title,
      body,
      metadata: {
        sourcePath: `docs/knowledge/${fileName}`
      }
    });

    const rawChunks = chunkText(body);
    const chunks = [];
    for (const chunk of rawChunks) {
      let embedding = null;
      try {
        embedding = await ollamaClient.embed(chunk.content);
      } catch {
        embedding = null;
      }

      chunks.push({
        ...chunk,
        embedding,
        metadata: {
          slug
        }
      });
    }

    await repository.replaceDocumentChunks(document.id, chunks);
    console.log(`Seeded ${slug} with ${chunks.length} chunks.`);
  }
}

seed().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
