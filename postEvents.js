import { ObjectId } from "mongodb";

export function addPostRoutes(app, eventsCollection, sampleEvents, requireLogin) {
  // Create an event for the logged-in user.
  app.post("/api/events", requireLogin, async (req, res) => {
    const { title, description, type, image, location, date } = req.body || {};
    if (
      typeof title !== "string" || !title.trim() ||
      typeof description !== "string" || !description.trim() ||
      typeof type !== "string" || !type.trim() ||
      typeof image !== "string" || !image.trim() ||
      typeof location !== "string" || !location.trim() ||
      typeof date !== "string" || !date.trim()
    ) {
      return res.status(400).send({ message: "Fill in all event fields." });
    }

    const eventDate = new Date(date + "T00:00:00.000Z");
    const validDate = !Number.isNaN(eventDate.getTime()) && eventDate.toISOString().slice(0, 10) === date;
    const today = new Date().toISOString().slice(0, 10);

    if (!validDate || date <= today) {
      return res.status(400).send({ message: "Event date must be in the future." });
    }

    const event = {
      title: title.trim(),
      description: description.trim(),
      type: type.trim(),
      image: image.trim(),
      location: location.trim(),
      date,
      creatorEmail: req.user.email.toLowerCase(),
      createdAt: new Date(),
    };

    try {
      if (eventsCollection) {
        const result = await eventsCollection.insertOne(event);
        event._id = result.insertedId;
      } else {
        event._id = "event-" + Date.now();
        sampleEvents.push(event);
      }

      res.status(201).send({ success: true, message: "Event created", data: event });
    } catch (error) {
      console.error(error);
      res.status(500).send({ message: "Could not create event." });
    }
  });

  // Join an event using the logged-in user's email.
  app.post("/api/events/:id/join", requireLogin, async (req, res) => {
    try {
      const id = req.params.id;
      const eventId = ObjectId.isValid(id) ? new ObjectId(id) : id;
      const email = req.user.email.toLowerCase();
      let event;

      if (eventsCollection) {
        event = await eventsCollection.findOne({ _id: eventId });
        if (event) {
          await eventsCollection.updateOne(
            { _id: eventId },
            { $addToSet: { joinedEmails: email } }
          );
          event = await eventsCollection.findOne({ _id: eventId });
        }
      } else {
        event = sampleEvents.find((item) => item._id === id);
        if (event) {
          event.joinedEmails ??= [];
          if (!event.joinedEmails.includes(email)) event.joinedEmails.push(email);
        }
      }

      if (!event) return res.status(404).send({ message: "Event not found." });
      res.send({ success: true, message: "You joined the event", data: event });
    } catch (error) {
      console.error(error);
      res.status(500).send({ message: "Could not join event." });
    }
  });
}
