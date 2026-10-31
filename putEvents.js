import { ObjectId } from "mongodb";

export function addPutRoutes(app, eventsCollection, sampleEvents, requireLogin) {
  // Change event details only when the logged-in user created the event.
  app.put("/api/events/:id", requireLogin, async (req, res) => {
    const { title, description, type, image, location, date } = req.body || {};
    const updatedData = {};

    if (typeof title === "string" && title.trim()) updatedData.title = title.trim();
    if (typeof description === "string" && description.trim()) updatedData.description = description.trim();
    if (typeof type === "string" && type.trim()) updatedData.type = type.trim();
    if (typeof image === "string" && image.trim()) updatedData.image = image.trim();
    if (typeof location === "string" && location.trim()) updatedData.location = location.trim();
    if (typeof date === "string" && date.trim()) updatedData.date = date.trim();

    if (Object.keys(updatedData).length === 0) {
      return res.status(400).send({ message: "Send at least one event field to update." });
    }

    if (updatedData.date) {
      const eventDate = new Date(updatedData.date + "T00:00:00.000Z");
      const validDate = !Number.isNaN(eventDate.getTime()) && eventDate.toISOString().slice(0, 10) === updatedData.date;
      const today = new Date().toISOString().slice(0, 10);

      if (!validDate || updatedData.date <= today) {
        return res.status(400).send({ message: "Event date must be in the future." });
      }
    }

    try {
      const id = req.params.id;
      const eventId = ObjectId.isValid(id) ? new ObjectId(id) : id;
      const ownerEmail = req.user.email.toLowerCase();
      let event;

      if (eventsCollection) {
        const result = await eventsCollection.updateOne(
          { _id: eventId, creatorEmail: ownerEmail },
          { $set: updatedData }
        );
        if (result.matchedCount > 0) {
          event = await eventsCollection.findOne({ _id: eventId });
        }
      } else {
        event = sampleEvents.find(
          (item) => item._id === id && item.creatorEmail === ownerEmail
        );
        if (event) Object.assign(event, updatedData);
      }

      if (!event) return res.status(404).send({ message: "Your event was not found." });
      res.send({ success: true, message: "Event updated", data: event });
    } catch (error) {
      console.error(error);
      res.status(500).send({ message: "Could not update event." });
    }
  });
}
