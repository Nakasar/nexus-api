require("./tracer");
const path = require("path");

const express = require("express");
const { nanoid } = require("nanoid/async");
const jwt = require("jsonwebtoken");
const MongoClient = require("mongodb").MongoClient;
const firebaseClient = require("firebase-admin");
const cors = require("cors");
const fetch = require("node-fetch");
const config = require("config");

const { Logger } = require("./logger");

const { AuthenticationRouter } = require("./routes/authentication.js");
const { CalendarsRouter } = require("./routes/calendars.js");
const { EventsRouter } = require("./routes/events.js");
const { RegistryRouter } = require("./routes/registry.js");
const { PoisRouter } = require("./routes/pois.js");

const {
  DiscordAdapter
} = require("./adapters/driving/discord/discord.adapter");

const logger = new Logger();
logger.replaceConsole();

const mongoClient = new MongoClient(process.env.MONGODB_URL, {
  useNewUrlParser: true,
  useUnifiedTopology: true
});
mongoClient.connect((error, client) => {
  if (error) {
    console.error({
      message: "Database connection failed.",
      error: {
        message: error.message,
        stack: error.stack
      }
    });
  }
});

firebaseClient.initializeApp({
  credential: firebaseClient.credential.cert({
    type: "service_account",
    project_id: config.get("services.firebase.projectId"),
    private_key_id: config.get("services.firebase.privateKeyId"),
    private_key: config
      .get("services.firebase.privateKey")
      .replace(/\\n/g, "\n"),
    client_email: config.get("services.firebase.clientEmail"),
    client_id: config.get("services.firebase.clientId")
  })
});

const discordAdapter = new DiscordAdapter({
  botToken: config.get("services.discord.botToken"),
  prefix: "+nxc",
  inviteLink: 'https://discord.com/api/oauth2/authorize?client_id=736495315393445978&scope=bot&permissions=268823632'
}, { mongoClient });

discordAdapter.start().catch(error => {
  console.log({
    error
  });
  process.exit(1);
});

const authenticationRouter = new AuthenticationRouter({ mongoClient });
const calendarsRouter = new CalendarsRouter({ mongoClient });
const eventsRouter = new EventsRouter({ mongoClient });
const registryRouter = new RegistryRouter({ mongoClient });
const poisRouter = new PoisRouter({ mongoClient, firebaseClient });

const app = express();
app.use(
  cors([
    "https://nexus-calendar.glitch.me",
    "https://nexuscorp.glitch.me",
    "http://localhost:3000",
    "https://vigilant-montalcini-dca052.netlify.app",
    "https://flamboyant-fermat-a0ecc2.netlify.app",
    "https://nexuscorp.nakasar.xyz"
  ])
);
app.use(express.json());

// LOGGER
app.use((req, res, next) => {
  const startDate = new Date();
  console.log({
    text: "Request received.",
    startDate: startDate.toISOString(),
    path: req.path
  });

  req.on("close", () => {
    const endDate = new Date();

    console.log({
      text: "Request concluded.",
      status: res.status,
      endDate: endDate.toISOString(),
      duration: endDate.getTime() - startDate.getTime()
    });
  });

  next();
});

// AUTHENTICATION
app.use(async (req, res, next) => {
  try {
    const authorizationHeader = req.get("Authorization");

    if (!authorizationHeader) {
      res.locals.authenticated = false;
      return next();
    }

    const [authenticationType, authenticationValue] = authorizationHeader.split(
      " "
    );
    switch (authenticationType) {
      case "Bearer":
        try {
          const payload = jwt.verify(
            authenticationValue,
            process.env.TOKEN_SECRET
          );

          res.locals.authenticated = true;
          res.locals.user = {
            token: authenticationValue,
            issuer: payload.iss,
            id: payload.sub,
            username: payload.username
          };

          return next();
        } catch (error) {
          console.log({
            message: "Authenticatication with Bearer Token failed.",
            error: {
              stack: error.stack,
              message: error.message
            }
          });
          return res.status(403).json({
            code: "BEARER_AUTHENTICATION_FAILED",
            message: "The authentication provided as Bearer Token is not valid."
          });
        }

        return next();
      default:
        return res.status(401).json({
          code: "UNSUPPORTED_AUTHENTICATION_TYPE",
          message: "The authentication provided is not supported."
        });
    }
  } catch (error) {
    next();
  }
});

app.use("/authentication", authenticationRouter.init(express.Router()));
app.use("/calendars", calendarsRouter.init(express.Router()));
app.use("/users", registryRouter.init(express.Router()));
app.use("/events", eventsRouter.init(express.Router()));
app.use("/pois", poisRouter.init(express.Router()));

app.listen(process.env.PORT, () => {
  console.log("Application started.");
});
