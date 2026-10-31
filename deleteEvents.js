import { ObjectId } from "mongodb";

export function addDeleteRoutes(app, eventsCollection, sampleEvents, requireLogin) {
  // Delete an event only when the logged-in user created the event.
  app.delete("/api/events/:id", requireLogin, async (req, res) => {
    try {
      const id = req.params.id;
      const eventId = ObjectId.isValid(id) ? new ObjectId(id) : id;
      const ownerEmail = req.user.email.toLowerCase();
      let deleted = false;

      if (eventsCollection) {
        const result = await eventsCollection.deleteOne({
          _id: eventId,
          creatorEmail: ownerEmail,
        });
        deleted = result.deletedCount > 0;
      } else {
        const eventIndex = sampleEvents.findIndex(
          (item) => item._id === id && item.creatorEmail === ownerEmail
        );
        if (eventIndex !== -1) {
          sampleEvents.splice(eventIndex, 1);
          deleted = true;
        }
      }

      if (!deleted) return res.status(404).send({ message: "Your event was not found." });
      res.send({ success: true, message: "Event deleted" });
    } catch (error) {
      console.error(error);
      res.status(500).send({ message: "Could not delete event." });
    }
  });
}
