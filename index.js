import express from "express";
import dotenv from "dotenv";
import { MongoClient, ObjectId } from "mongodb";

dotenv.config();
const app = express();
const PORT = process.env.PORT || 5000;
const client = process.env.MONGODB_URI ? new MongoClient(process.env.MONGODB_URI) : null;
let eventsCollection = null;
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

// POST /api/events — create an event with a future date.
app.post("/api/events", async (req, res) => {
  const { title, description, type, image, location, date, creatorEmail } = req.body;
  const fields = { title, description, type, image, location, date, creatorEmail };
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
    creatorEmail: creatorEmail.trim().toLowerCase(),
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

async function startServer() {
  if (client) {
    await client.connect();
    eventsCollection = client.db(process.env.DB_NAME || "goodneighbor").collection("events");
    console.log("MongoDB connected");
  } else {
    console.log("MONGODB_URI is empty; using temporary sample events");
  }
  app.listen(PORT, () => console.log("Server running at http://localhost:" + PORT));
}
startServer().catch((error) => {
  console.error("Server could not start:", error.message);
  process.exit(1);
});
