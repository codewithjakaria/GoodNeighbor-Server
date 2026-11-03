import express from 'express';
import dotenv from 'dotenv';
import { MongoClient } from 'mongodb';
import { betterAuth } from 'better-auth';
import { mongodbAdapter } from '@better-auth/mongo-adapter';
import { jwt } from 'better-auth/plugins';
import { toNodeHandler } from 'better-auth/node';
import { createRequireLogin } from './auth.js';
import { sampleEvents } from './sampleEvents.js';
import { addGetRoutes } from './getEvents.js';
import { addPostRoutes } from './postEvents.js';
import { addPutRoutes } from './putEvents.js';
import { addDeleteRoutes } from './deleteEvents.js';

dotenv.config();

const app = express();
app.set('trust proxy', 1); // Render sits behind a proxy
const port = process.env.PORT || 5000;
const authURL = process.env.BETTER_AUTH_URL || 'http://localhost:' + port;

// Origins allowed to call the API. CLIENT_URL may hold one or several
// URLs separated by commas; localhost is always allowed for local dev.
const allowedOrigins = [
  ...new Set(
    [
      ...(process.env.CLIENT_URL || '').split(','),
      'http://localhost:3000',
    ]
      .map(origin => origin.trim().replace(/\/+$/, ''))
      .filter(Boolean),
  ),
];

const client = process.env.MONGODB_URI
  ? new MongoClient(process.env.MONGODB_URI)
  : null;
let authHandler = null;
let eventsCollection = null;

// Startup config summary: presence only, never the values themselves.
console.log('Allowed origins:', allowedOrigins);
console.log('Env present:', {
  MONGODB_URI: Boolean(process.env.MONGODB_URI),
  BETTER_AUTH_URL: Boolean(process.env.BETTER_AUTH_URL),
  BETTER_AUTH_SECRET: Boolean(process.env.BETTER_AUTH_SECRET),
  GOOGLE_CLIENT_ID: Boolean(process.env.GOOGLE_CLIENT_ID),
  GOOGLE_CLIENT_SECRET: Boolean(process.env.GOOGLE_CLIENT_SECRET),
});

// CORS: echo the exact allowed origin, answer preflight with 204.
app.use((req, res, next) => {
  const origin = req.headers.origin;
  const isAllowed = origin && allowedOrigins.includes(origin);

  if (isAllowed) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader(
      'Access-Control-Allow-Methods',
      'GET, POST, PUT, PATCH, DELETE, OPTIONS',
    );
    res.setHeader(
      'Access-Control-Allow-Headers',
      'Content-Type, Authorization',
    );
    res.setHeader('Vary', 'Origin');
  }

  if (req.method === 'OPTIONS') {
    return res.sendStatus(204);
  }

  next();
});

app.all('/api/auth/*splat', (req, res) => {
  if (!authHandler) {
    return res.status(503).send({ message: 'Authentication is not ready.' });
  }
  return authHandler(req, res);
});

app.use(express.json());

app.get('/', (req, res) => {
  res.send('GoodNeighbor server is running');
});

app.get('/api/health', (req, res) => {
  res.send({ success: true, message: 'Server is healthy' });
});

// Public check for the live deployment: confirms the server reads the
// expected database. Registered before the /api/events/:id route.
app.get('/api/events/health-check', async (req, res) => {
  try {
    const eventsCount = eventsCollection
      ? await eventsCollection.estimatedDocumentCount()
      : null;
    res.send({ success: true, eventsCount });
  } catch (error) {
    console.error(error);
    res.status(500).send({ success: false, message: 'Could not read events count' });
  }
});

const requireLogin = createRequireLogin(authURL);

async function startServer() {
  if (client) {
    await client.connect();

    const dbName = process.env.DB_NAME || 'goodneighbor';
    const database = client.db(dbName);
    eventsCollection = database.collection('events');

    console.log('MongoDB Connected');
    console.log('Database:', dbName);

    if (!process.env.BETTER_AUTH_SECRET) {
      throw new Error('Add BETTER_AUTH_SECRET to your .env file.');
    }

    const hasGoogle =
      Boolean(process.env.GOOGLE_CLIENT_ID) &&
      Boolean(process.env.GOOGLE_CLIENT_SECRET);

    const auth = betterAuth({
      database: mongodbAdapter(database, { client }),
      baseURL: authURL,
      secret: process.env.BETTER_AUTH_SECRET,
      trustedOrigins: allowedOrigins,
      // On Render (production) cookies must be cross-site: the client
      // runs on Vercel, so SameSite=Lax would drop them on redirects.
      ...(process.env.RENDER
        ? {
            advanced: {
              defaultCookieAttributes: { sameSite: 'none', secure: true },
            },
          }
        : {}),
      emailAndPassword: { enabled: true },
      socialProviders: hasGoogle
        ? {
            google: {
              clientId: process.env.GOOGLE_CLIENT_ID,
              clientSecret: process.env.GOOGLE_CLIENT_SECRET,
            },
          }
        : {},
      plugins: [
        jwt({
          jwt: {
            getSubject: session => session.user.id,
            definePayload: ({ user }) => ({ email: user.email }),
          },
        }),
      ],
    });

    authHandler = toNodeHandler(auth);
    console.log('BetterAuth Connected');
    console.log(
      hasGoogle ? 'Google login enabled' : 'Google login DISABLED (check .env)',
    );
  } else {
    console.log('MONGODB_URI is empty; using temporary sample events');
  }

  addGetRoutes(app, eventsCollection, sampleEvents, requireLogin);
  addPostRoutes(app, eventsCollection, sampleEvents, requireLogin);
  addPutRoutes(app, eventsCollection, sampleEvents, requireLogin);
  addDeleteRoutes(app, eventsCollection, sampleEvents, requireLogin);

  app.listen(port, () => {
    console.log('Server running at port ' + port);
  });
}

startServer().catch(error => {
  console.error('Server could not start:', error.message);
  process.exit(1);
});
