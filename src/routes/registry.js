const Ajv = require("ajv");
const { nanoid } = require("nanoid/async");
const _ = require('lodash');

class RegistryRouter {
  constructor({ mongoClient }) {
    this.mongoClient = mongoClient;
  }

  init(router) {
    router.post("/", async (req, res) => {
      try {
        if (!res.locals.authenticated) {
          return res.status(403).json({
            message:
              "Authenticated user is not allowed to register other users.",
            code: "INSUFFICIENT_PRIVILEGES"
          });
        }
        
        const db = this.mongoClient.db("nexus");
        const collection = db.collection("users");
        
        const authenticatedUser = await collection.findOne({
          id: res.locals.user.id
        });
        if (!authenticatedUser || _.difference(res.locals.roles, ['SITE_ENGINEER', 'FOUNDER', 'OFFICER']).length > 0) {
          return res.status(403).json({
            message: "You are not authorized to retrieve user data.",
            code: "INSUFFICIENT_PRIVILEGES"
          });
        }

        const user = req.body;

        const ajv = new Ajv();
        var valid = ajv.validate(
          {
            title: "User",
            description: "A user registered.",
            type: "object",
            properties: {
              username: {
                type: "string",
                maxLength: 50,
                minLength: 1
              },
              discordId: {
                type: "string"
              },
              roles: {
                type: "array",
                items: {
                  type: "string",
                  enum: ["FOUNDER", "OFFICER", "SITE_ENGINEER", "MEMBER", "CANDIDATE"]
                }
              }
            },
            additionalProperties: false,
            required: ["username", "discordId", "roles"]
          },
          user
        );
        if (!valid) {
          return res.status(400).json({
            message: "User resource described is not valid.",
            code: "INVALID_USER",
            validationError: ajv.errors
          });
        }

        user.id = await nanoid(10);

        await collection.insertOne({
          id: user.id,
          username: user.username,
          discordId: user.discordId,
          roles: user.roles
        });

        res.status(201).json({
          id: user.id,
          username: user.username,
          discordId: user.discordId,
          roles: user.roles
        });
      } catch (error) {
        console.log({
          error: {
            message: error.message,
            stack: error.stack
          },
          text: "An error occurend when creating a user in registry."
        });
        return res.status(500).json({
          message: "An error occurred.",
          code: "INTERNAL_SERVER_ERROR"
        });
      }
    });

    router.get("/:userId", async (req, res) => {
      try {
        if (!res.locals.authenticated) {
          return res.status(403).json({
            message:
              "Authenticated user is not allowed to register other users.",
            code: "INSUFFICIENT_PRIVILEGES"
          });
        }
        
        const db = this.mongoClient.db("nexus");
        const collection = db.collection("users");
        
        const authenticatedUser = await collection.findOne({
          id: res.locals.user.id
        });
        if (!authenticatedUser) {
          return res.status(403).json({
            message: "You are not authorized to retrieve user data.",
            code: "INSUFFICIENT_PRIVILEGES"
          });
        }

        const user = await collection.findOne({
          id: req.params.userId
        });

        if (!user) {
          return res.status(404).json({
            message: "No user found in registry.",
            code: "RESOURCE_NOT_FOUND"
          });
        }
        
        const userPresented = {
          id: user.id,
          username: user.username,
          roles: user.roles
        };
        if (
          authenticatedUser.roles.includes("SITE_ENGINEER") ||
          authenticatedUser.roles.includes("FOUNDER") ||
          authenticatedUser.roles.includes("OFFICER")
        ) {
          userPresented.discordId = user.discordId;
        }

        res.json(userPresented);
      } catch (error) {
        console.log({
          error: {
            message: error.message,
            stack: error.stack
          },
          text: "An error occurend when retrieving a user in registry."
        });
        return res.status(500).json({
          message: "An error occurred.",
          code: "INTERNAL_SERVER_ERROR"
        });
      }
    });

    return router;
  }
}

module.exports = { RegistryRouter };
