function daysFromNow(days) {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export const sampleEvents = [
  {
    _id: "event-1",
    title: "Winter Clothes Distribution",
    description: "Collect and distribute warm clothes to neighbors who need them.",
    type: "Donation",
    image: "https://images.unsplash.com/photo-1489987707025-afc232f7ea0f?auto=format&fit=crop&w=900&q=80",
    location: "Mirpur 10, Dhaka",
    date: daysFromNow(3),
    creatorEmail: "nusrat@example.com",
  },
  {
    _id: "event-2",
    title: "Neighborhood Park Cleanup",
    description: "Spend a morning cleaning the park and making it welcoming for everyone.",
    type: "Cleanup",
    image: "https://images.unsplash.com/photo-1532996122724-e3c354a0b15b?auto=format&fit=crop&w=900&q=80",
    location: "Dhanmondi, Dhaka",
    date: daysFromNow(7),
    creatorEmail: "tanvir@example.com",
  },
  {
    _id: "event-3",
    title: "Plant Trees for a Greener Block",
    description: "Plant native trees with local volunteers and help care for them.",
    type: "Plantation",
    image: "https://images.unsplash.com/photo-1416879595882-3373a0480b5b?auto=format&fit=crop&w=900&q=80",
    location: "Mohammadpur, Dhaka",
    date: daysFromNow(12),
    creatorEmail: "maliha@example.com",
  },
];
