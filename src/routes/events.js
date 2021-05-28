const _ = require("lodash");

class EventsRouter {
  constructor({ mongoClient }) {
    this.mongoClient = mongoClient;
  }

  init(router) {
    router.delete("/:eventId", async (req, res, next) => {
      try {
        const db = this.mongoClient.db("nexus");
        const usersCollection = db.collection("users");
        const calendarsCollection = db.collection("calendars");
        const eventsCollection = db.collection("events");

        if (!res.locals.authenticated) {
          return res.status(402).json({
            message: "Authentication is required to remove events.",
            code: "AUTHENTICATION_REQUIRED"
          });
        }

        const authenticatedUser = await usersCollection.findOne({
          id: res.locals.user.id
        });
        if (!authenticatedUser) {
          return res.status(402).json({
            message: "Authentication could not be retrieved from registry.",
            code: "AUTHENTICATED_USER_NOT_REGISTERED"
          });
        }

        const event = await eventsCollection.findOne({
          id: req.params.eventId
        });
        if (!event) {
          return res.status(404).json({
            message: "The queried event does not exist.",
            code: "RESOURCE_NOT_FOUND"
          });
        }

        const calendar = await calendarsCollection.findOne({
          id: event.calendarId
        });
        if (!calendar) {
          return res.status(404).json({
            message: "The calendar associated with this event does not exist.",
            code: "RESOURCE_NOT_FOUND"
          });
        }

        if (
          _.difference(
            calendar.permissions.writeAccess.roles,
            authenticatedUser.roles
          ).length === calendar.permissions.writeAccess.roles.length &&
          !calendar.permissions.writeAccess.users.includes(authenticatedUser.id)
        ) {
          if (
            !req.query.as_admin ||
            !authenticatedUser.roles.includes("SITE_ENGINEER")
          ) {
            return res.status(403).json({
              message:
                "You are not authorized to remove events of this calendar.",
              code: "INSUFFICIENT_PRIVILEGES"
            });
          }
        }
        
        await eventsCollection.remove({
          id: event.id,
        });
        
        return res.sendStatus(204);
      } catch (error) {
        console.log({
          error: {
            message: error.message,
            stack: error.stack
          },
          text: "An error occurend when deleting the event."
        });
        return res.status(500).json({
          message: "An error occurend when deleting the event.",
          code: "INTERNAL_SERVER_ERROR"
        });
      }
    });

    return router;
  }
}

module.exports = { EventsRouter };
