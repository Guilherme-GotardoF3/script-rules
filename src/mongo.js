import { MongoClient } from "mongodb";
import { ENVIRONMENTS } from "./environments.js";
import dotenv from "dotenv";

dotenv.config();

let client;
let db;

export async function getDb () {
  if (db) return db;

  const uri     = process.env.MONGO_URI;
  const dbName  = process.env.DB_NAME;

  if (!uri || !dbName)
    throw new Error("MONGO_URI / DB_NAME não definidos");

  client = new MongoClient(uri, { maxPoolSize: 10 });
  await client.connect();

  db = client.db(dbName);
  console.log(`Conectado a ${dbName}`);
  return db;
}

export async function openConnection(envKey) {
  const env = ENVIRONMENTS[envKey];
  if (!env) throw new Error(`Ambiente desconhecido: ${envKey}`);

  const client = new MongoClient(env.uri, { maxPoolSize: 10 });
  await client.connect();
  return { client, db: client.db(env.db) };
}