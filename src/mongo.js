import { MongoClient } from "mongodb";
import dotenv from "dotenv";

dotenv.config();
const client = new MongoClient(process.env.MONGO_URI);
let db = null;

export async function getDb() {
  if (!db) {
    await client.connect();
    const dbName = process.env.DB_NAME;
    if (!dbName) throw new Error("DB_NAME não definido.");
    db = client.db(dbName);
    console.log(`Conectado ao banco: ${dbName}`);
  }
  return db;
}