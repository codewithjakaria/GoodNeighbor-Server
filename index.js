import express from "express";
import dotenv from "dotenv";
import { MongoClient, ObjectId } from "mongodb";
import { betterAuth } from "better-auth";
import { mongodbAdapter } from "@better-auth/mongo-adapter";
import { jwt } from "better-auth/plugins";
import { toNodeHandler } from "better-auth/node";
import { createRemoteJWKSet, jwtVerify } from "jose";

dotenv.config();
const app = express();
const PORT = process.env.PORT || 5000;
const client = process.env.MONGODB_URI ? new MongoClient(process.env.MONGODB_URI) : null;
const authURL = process.env.BETTER_AUTH_URL || "http://localhost:" + PORT;
const jwks = createRemoteJWKSet(new URL("/api/auth/jwks", authURL));
let eventsCollection = null;
let authHandler = null;

app.all("/api/auth/*splat", (req, res) => {
  if (!authHandler) {
    return res.status(503).json({ success: false, message: "Authentication is not ready." });
  }
  return authHandler(req, res);
});

app.use(express.json());

const daysFromNow = (days) => {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
};

// Temporary examples; MongoDB will replace these when MONGODB_URI is configured.
const sampleEvents = [
  { _id: "event-1", title: "Winter Clothes Distribution", description: "Collect and distribute warm clothes to neighbors who need them.", type: "Donation", image: "https://images.unsplash.com/photo-1489987707025-afc232f7ea0f?auto=format&fit=crop&w=900&q=80", location: "Mirpur 10, Dhaka", date: daysFromNow(3), creatorEmail: "nusrat@example.com" },
  { _id: "event-2", title: "Neighborhood Park Cleanup", description: "Spend a morning cleaning the park and making it welcoming for everyone.", type: "Cleanup", image: "https://images.unsplash.com/photo-1532996122724-e3c354a0b15b?auto=format&fit=crop&w=900&q=80", location: "Dhanmondi, Dhaka", date: daysFromNow(7), creatorEmail: "tanvir@example.com" },
  { _id: "event-3", title: "Plant Trees for a Greener Block", description: "Plant native trees with local volunteers and help care for them.", type: "Plantation", image: "https://images.unsplash.com/photo-1416879595882-3373a0480b5b?auto=format&fit=crop&w=900&q=80", location: "Mohammadpur, Dhaka", date: daysFromNow(12), creatorEmail: "maliha@example.com" },
];

app.get("/", (req, res) => res.send("GoodNeighbor server is running!"));
app.get("/api/health", (req, res) => res.json({ success: true, message: "Server is healthy" }));

// GET /api/events?limit=6 — upcoming events, sorted by date.
app.get("/api/events", async (req, res) => {
  try {
    const today = new Date().toISOString().slice(0, 10);
    const n = Number.parseInt(req.query.limit, 10);
    const limit = Number.isInteger(n) && n > 0 ? Math.min(n, 100) : 0;
    let events;

    if (eventsCollection) {
      let query = eventsCollection.find({ date: { $gte: today } }).sort({ date: 1 });
      if (limit) query = query.limit(limit);
      events = await query.toArray();
    } else {
      events = sampleEvents.filter((event) => event.date >= today).sort((a, b) => a.date.localeCompare(b.date));
      if (limit) events = events.slice(0, limit);
    }
    res.json({ success: true, count: events.length, data: events });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: "Could not load events" });
  }
});

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

// Create an event only for a logged-in user.
app.post("/api/events", requireLogin, async (req, res) => {
  const { title, description, type, image, location, date } = req.body || {};
  const fields = { title, description, type, image, location, date };
  const missing = Object.entries(fields)
    .filter(([, value]) => typeof value !== "string" || !value.trim())
    .map(([name]) => name);

  if (missing.length) {
    return res.status(400).json({ success: false, message: "Fill in all event fields.", missing });
  }

  const parsedDate = new Date(date + "T00:00:00.000Z");
  const validDate = !Number.isNaN(parsedDate.getTime()) && parsedDate.toISOString().slice(0, 10) === date;
  if (!validDate || date <= new Date().toISOString().slice(0, 10)) {
    return res.status(400).json({ success: false, message: "Event date must be in the future." });
  }

  const event = {
    title: title.trim(),
    description: description.trim(),
    type: type.trim(),
    image: image.trim(),
    location: location.trim(),
    date,
    creatorEmail: req.user.email.toLowerCase(),
  };

  try {
    if (eventsCollection) {
      const result = await eventsCollection.insertOne(event);
      event._id = result.insertedId;
    } else {
      event._id = "event-" + Date.now();
      sampleEvents.push(event);
    }
    return res.status(201).json({ success: true, message: "Event created", data: event });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ success: false, message: "Could not create event." });
  }
});

// GET /api/events/:id — public details for one event.
app.get("/api/events/:id", async (req, res) => {
  try {
    const id = req.params.id;
    const event = eventsCollection
      ? await eventsCollection.findOne(ObjectId.isValid(id) ? { _id: new ObjectId(id) } : { _id: id })
      : sampleEvents.find((item) => item._id === id);
    if (!event) return res.status(404).json({ success: false, message: "Event not found" });
    res.json({ success: true, data: event });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: "Could not load event" });
  }
});

// Convert an event ID from the URL into MongoDB's ID format when needed.
function getEventId(id) {
  return ObjectId.isValid(id) ? new ObjectId(id) : id;
}

// Update an event only when the logged-in user created it.
app.put("/api/events/:id", requireLogin, async (req, res) => {
  const allowedFields = ["title", "description", "type", "image", "location", "date"];
  const updates = {};
  const body = req.body || {};

  for (const field of allowedFields) {
    if (typeof body[field] === "string" && body[field].trim()) {
      updates[field] = body[field].trim();
    }
  }

  if (Object.keys(updates).length === 0) {
    return res.status(400).json({ success: false, message: "Send at least one event field to update." });
  }

  if (updates.date) {
    const parsedDate = new Date(updates.date + "T00:00:00.000Z");
    const validDate = !Number.isNaN(parsedDate.getTime()) && parsedDate.toISOString().slice(0, 10) === updates.date;
    if (!validDate || updates.date <= new Date().toISOString().slice(0, 10)) {
      return res.status(400).json({ success: false, message: "Event date must be in the future." });
    }
  }

  try {
    const id = getEventId(req.params.id);
    let event;

    if (eventsCollection) {
      const result = await eventsCollection.updateOne(
        { _id: id, creatorEmail: req.user.email.toLowerCase() },
        { $set: updates }
      );
      if (result.matchedCount) {
        event = await eventsCollection.findOne({ _id: id });
      }
    } else {
      event = sampleEvents.find((item) => item._id === req.params.id && item.creatorEmail === req.user.email.toLowerCase());
      if (event) Object.assign(event, updates);
    }

    if (!event) return res.status(404).json({ success: false, message: "Your event was not found." });
    return res.json({ success: true, message: "Event updated", data: event });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ success: false, message: "Could not update event." });
  }
});

// Delete an event only when the logged-in user created it.
app.delete("/api/events/:id", requireLogin, async (req, res) => {
  try {
    const id = getEventId(req.params.id);
    let deleted = false;

    if (eventsCollection) {
      const result = await eventsCollection.deleteOne({
        _id: id,
        creatorEmail: req.user.email.toLowerCase(),
      });
      deleted = result.deletedCount > 0;
    } else {
      const index = sampleEvents.findIndex(
        (item) => item._id === req.params.id && item.creatorEmail === req.user.email.toLowerCase()
      );
      if (index !== -1) {
        sampleEvents.splice(index, 1);
        deleted = true;
      }
    }

    if (!deleted) return res.status(404).json({ success: false, message: "Your event was not found." });
    return res.json({ success: true, message: "Event deleted" });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ success: false, message: "Could not delete event." });
  }
});

// Save the logged-in user's email when they join an event.
app.post("/api/events/:id/join", requireLogin, async (req, res) => {
  try {
    const id = getEventId(req.params.id);
    const email = req.user.email.toLowerCase();
    let event;

    if (eventsCollection) {
      event = await eventsCollection.findOne({ _id: id });
      if (event) {
        await eventsCollection.updateOne({ _id: id }, { $addToSet: { joinedEmails: email } });
        event = await eventsCollection.findOne({ _id: id });
      }
    } else {
      event = sampleEvents.find((item) => item._id === req.params.id);
      if (event) {
        event.joinedEmails ??= [];
        if (!event.joinedEmails.includes(email)) event.joinedEmails.push(email);
      }
    }

    if (!event) return res.status(404).json({ success: false, message: "Event not found." });
    return res.json({ success: true, message: "You joined the event", data: event });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ success: false, message: "Could not join event." });
  }
});

// Show joined events to their logged-in owner only.
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
  app.listen(PORT, () => console.log("Server running at http://localhost:" + PORT));
}
startServer().catch((error) => {
  console.error("Server could not start:", error.message);
  process.exit(1);
});
