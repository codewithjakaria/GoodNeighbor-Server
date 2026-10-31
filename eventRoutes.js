import { ObjectId } from "mongodb";

function getEventId(id) {
  return ObjectId.isValid(id) ? new ObjectId(id) : id;
}

export function registerEventRoutes(app, { eventsCollection, sampleEvents, requireLogin }) {
  // Show upcoming events sorted by date. Use ?limit=6 to show only six.
  app.get("/api/events", async (req, res) => {
    try {
      const today = new Date().toISOString().slice(0, 10);
      const requestedLimit = Number.parseInt(req.query.limit, 10);
      const limit = Number.isInteger(requestedLimit) && requestedLimit > 0
        ? Math.min(requestedLimit, 100)
        : 0;
      let events;

      if (eventsCollection) {
        let query = eventsCollection.find({ date: { $gte: today } }).sort({ date: 1 });
        if (limit) query = query.limit(limit);
        events = await query.toArray();
      } else {
        events = sampleEvents
          .filter((event) => event.date >= today)
          .sort((a, b) => a.date.localeCompare(b.date));
        if (limit) events = events.slice(0, limit);
      }

      return res.json({ success: true, count: events.length, data: events });
    } catch (error) {
      console.error(error);
      return res.status(500).json({ success: false, message: "Could not load events" });
    }
  });

  // Create an event for the logged-in user.
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

  // Show the details of one event.
  app.get("/api/events/:id", async (req, res) => {
    try {
      const id = getEventId(req.params.id);
      const event = eventsCollection
        ? await eventsCollection.findOne({ _id: id })
        : sampleEvents.find((item) => item._id === req.params.id);

      if (!event) return res.status(404).json({ success: false, message: "Event not found" });
      return res.json({ success: true, data: event });
    } catch (error) {
      console.error(error);
      return res.status(500).json({ success: false, message: "Could not load event" });
    }
  });

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
        if (result.matchedCount) event = await eventsCollection.findOne({ _id: id });
      } else {
        event = sampleEvents.find(
          (item) => item._id === req.params.id && item.creatorEmail === req.user.email.toLowerCase()
        );
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
}
