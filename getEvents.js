import { ObjectId } from "mongodb";

export function addGetRoutes(app, eventsCollection, sampleEvents, requireLogin) {
  // Get upcoming events, starting with the nearest date.
  app.get("/api/events", async (req, res) => {
    try {
      const today = new Date().toISOString().slice(0, 10);
      const limit = Number.parseInt(req.query.limit, 10) || 0;
      let events;

      if (eventsCollection) {
        let query = eventsCollection.find({ date: { $gte: today } }).sort({ date: 1 });
        if (limit > 0) query = query.limit(limit);
        events = await query.toArray();
      } else {
        events = sampleEvents
          .filter((event) => event.date >= today)
          .sort((first, second) => first.date.localeCompare(second.date));
        if (limit > 0) events = events.slice(0, limit);
      }

      res.send({ success: true, count: events.length, data: events });
    } catch (error) {
      console.error(error);
      res.status(500).send({ message: "Could not load events" });
    }
  });

  // Get the details for one event.
  app.get("/api/events/:id", async (req, res) => {
    try {
      const id = req.params.id;
      const eventId = ObjectId.isValid(id) ? new ObjectId(id) : id;
      let event;

      if (eventsCollection) {
        event = await eventsCollection.findOne({ _id: eventId });
      } else {
        event = sampleEvents.find((item) => item._id === id);
      }

      if (!event) return res.status(404).send({ message: "Event not found" });
      res.send({ success: true, data: event });
    } catch (error) {
      console.error(error);
      res.status(500).send({ message: "Could not load event" });
    }
  });

  // Get joined events for the logged-in user only.
  app.get("/api/users/:email/events", requireLogin, async (req, res) => {
    const email = req.params.email.toLowerCase();

    if (email !== req.user.email.toLowerCase()) {
      return res.status(403).send({ message: "You can only view your own joined events." });
    }

    try {
      let events;
      if (eventsCollection) {
        events = await eventsCollection.find({ joinedEmails: email }).sort({ date: 1 }).toArray();
      } else {
        events = sampleEvents
          .filter((event) => event.joinedEmails?.includes(email))
          .sort((first, second) => first.date.localeCompare(second.date));
      }

      res.send({ success: true, count: events.length, data: events });
    } catch (error) {
      console.error(error);
      res.status(500).send({ message: "Could not load joined events." });
    }
  });
}
