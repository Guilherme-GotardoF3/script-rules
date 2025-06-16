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

  function isGroupEqWithParam(eqArr) {
    if (!Array.isArray(eqArr) || eqArr.length !== 2) return false;

    const [a, b] = eqArr;
    const isParam = x => typeof x === "string" && x.startsWith("p:");
    const isGroup = x => x === "$support.group._id";

    return (isGroup(a) && isParam(b)) || (isGroup(b) && isParam(a));
  }

  (function walk(node, path = "") {
    if (Array.isArray(node)) {
      return node.forEach((n, i) => walk(n, `${path}[${i}]`));
    }

    if (node && typeof node === "object") {
      if (node.$lookup?.from === "rubrics") {
        walk(node.$lookup.pipeline || [], `${path}.$lookup.pipeline`);
      }

      if (isGroupEqWithParam(node.$eq)) {
        const paramStr = node.$eq.find(e => typeof e === "string" && e.startsWith("p:"));
        const idStr    = paramStr.slice(2);
        console.log("p: encontrado em", path, idStr);
        if (ObjectId.isValid(idStr)) paramIds.add(idStr);
      }

      Object.entries(node).forEach(([k, v]) => walk(v, `${path}.${k}`));
    }
  })(aggregation, "");

  if (!paramIds.size) return [];

  const params = await db.collection("parameters").find({
    _id: { $in: [...paramIds].map(id => new ObjectId(id)) }
  }).toArray();

  const groupIds = params
    .map(p => p.value)
    .filter(v => ObjectId.isValid(v))
    .map(v => v.toString());

  return [...new Set(groupIds)].map(s => new ObjectId(s));
}

