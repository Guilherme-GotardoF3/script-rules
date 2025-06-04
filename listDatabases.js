import { MongoClient } from "mongodb";
import dotenv from "dotenv";

dotenv.config();

const client = new MongoClient(process.env.MONGO_URI);

async function listDatabases() {
  await client.connect();
  const admin = client.db().admin();
  const { databases } = await admin.listDatabases();

  console.log("Databases disponíveis:");
  databases.forEach(db => console.log(`→ ${db.name}`));

  await client.close();
}

listDatabases();
