import { MongoClient } from "mongodb";

let clientPromise;

export function getClient() {
  if (!process.env.MONGODB_URI) {
    throw new Error("MONGODB_URI is not configured");
  }
  if (!clientPromise) {
    clientPromise = new MongoClient(process.env.MONGODB_URI).connect();
  }
  return clientPromise;
}

export async function getDb() {
  const client = await getClient();
  return client.db(process.env.MONGODB_DB || "finora");
}
