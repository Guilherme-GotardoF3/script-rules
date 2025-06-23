import { MongoClient } from "mongodb";
import { ENVIRONMENTS } from "./environments.js";
import dotenv from "dotenv";

dotenv.config();

const pools = new Map();

export async function getDb(envKey) {
  if (pools.has(envKey)) return pools.get(envKey).db;

  const env = ENVIRONMENTS[envKey];
  if (!env?.uri || !env?.db) {
    throw new Error(`Ambiente “${envKey}” sem uri/db configurados`);
  }

  const client = new MongoClient(env.uri, { maxPoolSize: 10 });
  await client.connect();

  const db = client.db(env.db);
  pools.set(envKey, { client, db });
  console.log(`Conectado a ${env.label} (${env.db})`);
  return db;
}

export async function openConnection(envKey) {
  const env = ENVIRONMENTS[envKey];
  if (!env) throw new Error(`Ambiente desconhecido: ${envKey}`);

  const client = new MongoClient(env.uri, { maxPoolSize: 10 });
  await client.connect();
  return { client, db: client.db(env.db) };
}