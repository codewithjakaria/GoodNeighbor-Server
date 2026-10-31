import express from "express";
import dotenv from "dotenv";
import { MongoClient } from "mongodb";
import { betterAuth } from "better-auth";
import { mongodbAdapter } from "@better-auth/mongo-adapter";
import { jwt } from "better-auth/plugins";
import { toNodeHandler } from "better-auth/node";
import { createRequireLogin } from "./auth.js";
import { sampleEvents } from "./sampleEvents.js";
import { addGetRoutes } from "./getEvents.js";
import { addPostRoutes } from "./postEvents.js";
import { addPutRoutes } from "./putEvents.js";
import { addDeleteRoutes } from "./deleteEvents.js";

dotenv.config();

const app = express();
const port = process.env.PORT || 5000;
const authURL = process.env.BETTER_AUTH_URL || "http://localhost:" + port;
const client = process.env.MONGODB_URI ? new MongoClient(process.env.MONGODB_URI) : null;
let authHandler = null;

// BetterAuth must receive its request before Express reads JSON bodies.
app.all("/api/auth/*splat", (req, res) => {
  if (!authHandler) {
    return res.status(503).send({ message: "Authentication is not ready." });
  }
  return authHandler(req, res);
});

app.use(express.json());

app.get("/", (req, res) => {
  res.send("GoodNeighbor server is running");
});

app.get("/api/health", (req, res) => {
  res.send({ success: true, message: "Server is healthy" });
});

const requireLogin = createRequireLogin(authURL);

async function startServer() {
  let eventsCollection = null;

  if (client) {
    await client.connect();
    console.log("MongoDB Connected");

    const database = client.db(process.env.DB_NAME || "goodneighbor");
    eventsCollection = database.collection("events");

    if (!process.env.BETTER_AUTH_SECRET) {
      throw new Error("Add BETTER_AUTH_SECRET to your .env file.");
    }

    const auth = betterAuth({
      database: mongodbAdapter(database, { client }),
      baseURL: authURL,
      secret: process.env.BETTER_AUTH_SECRET,
      trustedOrigins: [process.env.CLIENT_URL || "http://localhost:3000"],
      emailAndPassword: { enabled: true },
      plugins: [
        jwt({
          jwt: {
            getSubject: (session) => session.user.id,
            definePayload: ({ user }) => ({ email: user.email }),
          },
        }),
      ],
    });

    authHandler = toNodeHandler(auth);
    console.log("BetterAuth Connected");
  } else {
    console.log("MONGODB_URI is empty; using temporary sample events");
  }

  addGetRoutes(app, eventsCollection, sampleEvents, requireLogin);
  addPostRoutes(app, eventsCollection, sampleEvents, requireLogin);
  addPutRoutes(app, eventsCollection, sampleEvents, requireLogin);
  addDeleteRoutes(app, eventsCollection, sampleEvents, requireLogin);

  app.listen(port, () => {
    console.log("Server running at http://localhost:" + port);
  });
}

startServer().catch((error) => {
  console.error("Server could not start:", error.message);
  process.exit(1);
});
