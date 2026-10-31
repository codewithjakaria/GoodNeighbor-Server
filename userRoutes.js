export function registerUserRoutes(app, { eventsCollection, sampleEvents, requireLogin }) {
  // Show the logged-in user's joined events, sorted by date.
  app.get("/api/users/:email/events", requireLogin, async (req, res) => {
    const email = req.params.email.toLowerCase();

    if (email !== req.user.email.toLowerCase()) {
      return res.status(403).json({ success: false, message: "You can only view your own joined events." });
    }

    try {
      const events = eventsCollection
        ? await eventsCollection.find({ joinedEmails: email }).sort({ date: 1 }).toArray()
        : sampleEvents
            .filter((event) => event.joinedEmails?.includes(email))
            .sort((a, b) => a.date.localeCompare(b.date));

      return res.json({ success: true, count: events.length, data: events });
    } catch (error) {
      console.error(error);
      return res.status(500).json({ success: false, message: "Could not load joined events." });
    }
  });
}
