import mongoose from "mongoose";

export async function connectDatabase(uri, databaseName = "campusfind") {
  if (!uri) return false;
  mongoose.set("strictQuery", true);
  await mongoose.connect(uri, {
    dbName: databaseName,
    serverSelectionTimeoutMS: 10000,
  });
  console.info("MongoDB connected");
  return true;
}

export function databaseStatus() {
  return mongoose.connection.readyState === 1 ? "connected" : "disconnected";
}
