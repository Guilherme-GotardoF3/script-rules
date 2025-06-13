import fs from "fs-extra";
import path from "path";
import { ObjectId } from "mongodb";

export async function saveJson(dir, fileName, data) {
  const outputDir = path.resolve(dir);
  await fs.ensureDir(outputDir);
  const outputPath = path.join(outputDir, `${fileName}.json`);
  await fs.writeJson(outputPath, data, { spaces: 2 });
  console.log(`Saved: ${outputPath}`);
}

export function clearDirIfExistis(dirPath) {
  if (fs.existsSync(dirPath)) {
    fs.rmSync(dirPath, { recursive: true, force: true });
    console.log(`Processo "${dirPath}" já exstia e foi removido.`);
  }
}

export async function extractRubricsGroupIds(aggregation, db) {
  const paramIds = new Set();

  (function walk(node) {
    if (Array.isArray(node)) return node.forEach(walk);

    if (node && typeof node === "object") {
      if (
        node.$lookup?.from === "rubrics" &&
        node.$lookup?.as === "definition_rubric"
      ) {
        walk(node.$lookup.pipeline || []);
      }

      if (node.$eq && Array.isArray(node.$eq)) {
        const param = node.$eq.find(
          (e) => typeof e === "string" && e.startsWith("p:")
        );
        if (param) {
          const id = param.slice(2);
          if (ObjectId.isValid(id)) paramIds.add(id);
        }
      }
      Object.values(node).forEach(walk);
    }
  })(aggregation);

  if (!paramIds.size) return [];

  const params = await db
    .collection("parameters")
    .find({ _id: { $in: [...paramIds].map((id) => new ObjectId(id)) } })
    .toArray();

  const values = params
    .map((p) => p.value)
    .filter((v) => ObjectId.isValid(v))
    .map((v) => new ObjectId(v));

    return [... new Set(values.map((v) => v.toString()))].map((s) => new ObjectId(s));
}