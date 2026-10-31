import express from "express";
import dotenv from "dotenv";
import { MongoClient } from "mongodb";
import { betterAuth } from "better-auth";
import { mongodbAdapter } from "@better-auth/mongo-adapter";
import { jwt } from "better-auth/plugins";
import { toNodeHandler } from "better-auth/node";
import { createRemoteJWKSet, jwtVerify } from "jose";
import { registerEventRoutes } from "./eventRoutes.js";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;
const client = process.env.MONGODB_URI ? new MongoClient(process.env.MONGODB_URI) : null;
const authURL = process.env.BETTER_AUTH_URL || "http://localhost:" + PORT;
const jwks = createRemoteJWKSet(new URL("/api/auth/jwks", authURL));
let eventsCollection = null;
let authHandler = null;

// Temporary examples appear when MongoDB is not connected.
const daysFromNow = (days) => {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
};

const sampleEvents = [
  { _id: "event-1", title: "Winter Clothes Distribution", description: "Collect and distribute warm clothes to neighbors who need them.", type: "Donation", image: "https://images.unsplash.com/photo-1489987707025-afc232f7ea0f?auto=format&fit=crop&w=900&q=80", location: "Mirpur 10, Dhaka", date: daysFromNow(3), creatorEmail: "nusrat@example.com" },
  { _id: "event-2", title: "Neighborhood Park Cleanup", description: "Spend a morning cleaning the park and making it welcoming for everyone.", type: "Cleanup", image: "https://images.unsplash.com/photo-1532996122724-e3c354a0b15b?auto=format&fit=crop&w=900&q=80", location: "Dhanmondi, Dhaka", date: daysFromNow(7), creatorEmail: "tanvir@example.com" },
  { _id: "event-3", title: "Plant Trees for a Greener Block", description: "Plant native trees with local volunteers and help care for them.", type: "Plantation", image: "https://images.unsplash.com/photo-1416879595882-3373a0480b5b?auto=format&fit=crop&w=900&q=80", location: "Mohammadpur, Dhaka", date: daysFromNow(12), creatorEmail: "maliha@example.com" },
];

// BetterAuth handles its own request body, so mount it before express.json().
app.all("/api/auth/*splat", (req, res) => {
  if (!authHandler) {
    return res.status(503).json({ success: false, message: "Authentication is not ready." });
  }
  return authHandler(req, res);
});

app.use(express.json());

app.get("/", (req, res) => res.send("GoodNeighbor server is running!"));
app.get("/api/health", (req, res) => res.json({ success: true, message: "Server is healthy" }));

async function requireLogin(req, res, next) {
  const token = req.headers.authorization?.startsWith("Bearer ")
    ? req.headers.authorization.slice(7)
    : null;

  if (!token) {
    return res.status(401).json({ success: false, message: "Please log in first." });
  }

  try {
    const { payload } = await jwtVerify(token, jwks, { issuer: authURL, audience: authURL });
    if (typeof payload.email !== "string") {
      return res.status(401).json({ success: false, message: "Invalid login token." });
    }
    req.user = { email: payload.email };
    return next();
  } catch {
    return res.status(401).json({ success: false, message: "Invalid or expired login token." });
  }
}

// Show the logged-in user's joined events, sorted by date.
app.get("/api/users/:email/events", requireLogin, async (req, res) => {
  const email = req.params.email.toLowerCase();

  if (email !== req.user.email.toLowerCase()) {
    return res.status(403).json({ success: false, message: "You can only view your own joined events." });
  }

  try {
    const events = eventsCollection
      ? await eventsCollection.find({ joinedEmails: email }).sort({ date: 1 }).toArray()
      : sampleEvents.filter((event) => event.joinedEmails?.includes(email)).sort((a, b) => a.date.localeCompare(b.date));
    return res.json({ success: true, count: events.length, data: events });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ success: false, message: "Could not load joined events." });
  }
});

async function startServer() {
  if (client) {
    await client.connect();
    const database = client.db(process.env.DB_NAME || "goodneighbor");
    eventsCollection = database.collection("events");

    if (!process.env.BETTER_AUTH_SECRET) {
      throw new Error("Add BETTER_AUTH_SECRET to your .env file.");
    }

    const auth = betterAuth({
      database: mongodbAdapter(database, { client }),
      secret: process.env.BETTER_AUTH_SECRET,
      baseURL: authURL,
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
    console.log("MongoDB and BetterAuth connected");
  } else {
    console.log("MONGODB_URI is empty; using temporary sample events");
    console.log("Login-protected routes need MongoDB configured");
  }

  registerEventRoutes(app, { eventsCollection, sampleEvents, requireLogin });
  app.listen(PORT, () => console.log("Server running at http://localhost:" + PORT));
}

startServer().catch((error) => {
  console.error("Server could not start:", error.message);
  process.exit(1);
});
