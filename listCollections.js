import { MongoClient } from "mongodb";
import dotenv from "dotenv";

dotenv.config();

const client = new MongoClient(process.env.MONGO_URI);

async function listCollections(dbName) {
  await client.connect();
  const db = client.db(dbName);

  const collections = await db.listCollections().toArray();

  console.log(`Collections em "${dbName}":`);
  collections.forEach(col => console.log(`→ ${col.name}`));

  await client.close();
}

listCollections("dev");
