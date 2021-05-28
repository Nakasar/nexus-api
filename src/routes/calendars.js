const _ = require("lodash");
const Ajv = require("ajv");
const { nanoid } = require("nanoid/async");
const ical = require("ical-generator");

class CalendarsRouter {
  constructor({ mongoClient }) {
    this.mongoClient = mongoClient;
  }

  init(router) {
    router.get("/", async (req, res) => {
      try {
        const db = this.mongoClient.db("nexus");
        const usersCollection = db.collection("users");

        const authenticatedUser = res.locals.authenticated
          ? await usersCollection.findOne({
              id: res.locals.user.id
            })
          : null;

        const calendarsCollection = db.collection("calendars");
        let calendars;
        if (req.query.as_admin) {
          if (
            !authenticatedUser ||
            !authenticatedUser.roles.includes("SITE_ENGINEER")
          ) {
            return res.status(403).json({
              message: "as_admin requires appropriate permissions.",
              code: "INSUFFICIEN_PRIVILEGES"
            });
          }

          calendars = await calendarsCollection
            .find(
              {},
              {
                projection: {
                  id: 1,
                  name: 1,
                  shortUrl: 1,
                  color: 1,
                  permissions: 1
                }
              }
            )
            .toArray();
        } else {
          const query = {
            $or: [{ "permissions.readAccess.public": true }]
          };

          if (authenticatedUser) {
            for (const role of authenticatedUser.roles) {
              query["$or"].push({ "permissions.readAccess.roles": role });
            }
          }

          calendars = await calendarsCollection
            .find(query, {
              projection: {
                id: 1,
                name: 1,
                shortUrl: 1,
                color: 1,
                permissions: 1
              }
            })
            .toArray();
        }

        res.status(206).json(
          calendars.map(calendar => {
            let canWrite = false;
            if (
              authenticatedUser &&
              (_.difference(
                calendar.permissions.writeAccess.roles,
                authenticatedUser.roles
              ).length !== calendar.permissions.writeAccess.roles.length ||
                calendar.permissions.writeAccess.users.includes(
                  authenticatedUser.id
                ))
            ) {
              canWrite = true;
            }

            return {
              id: calendar.id,
              name: calendar.name,
              shortUrl: calendar.shortUrl,
              color: calendar.color,
              permissions: req.query.as_admin
                ? calendar.permissions
                : undefined,
              canWrite
            };
          })
        );
      } catch (error) {
        console.log({
          error: {
            message: error.message,
            stack: error.stack
          },
          text: "An error occurend when retrieving calendars."
        });
        return res.status(500).json({
          message: "An error occurend when retrieving calendars.",
          code: "INTERNAL_SERVER_ERROR"
        });
      }
    });

    router.post("/", async (req, res, next) => {
      try {
        if (!res.locals.authenticated) {
          return res.status(403).json({
            message:
              "Authenticated user is not allowed to register other users.",
            code: "INSUFFICIENT_PRIVILEGES"
          });
        }

        const db = this.mongoClient.db("nexus");
        const usersCollection = db.collection("users");

        const authenticatedUser = await usersCollection.findOne({
          id: res.locals.user.id
        });
        if (
          !authenticatedUser ||
          _.difference(res.locals.roles, [
            "SITE_ENGINEER",
            "FOUNDER",
            "OFFICER"
          ]).length > 0
        ) {
          return res.status(403).json({
            message: "You are not authorized to create a calendar.",
            code: "INSUFFICIENT_PRIVILEGES"
          });
        }

        const calendar = req.body;

        const ajv = new Ajv({
          useDefaults: true,
          strictKeywords: true,
          format: "full"
        });
        const valid = ajv.validate(
          {
            title: "Calendar",
            description: "A calendar.",
            type: "object",
            properties: {
              name: {
                type: "string",
                minLength: 1,
                maxLength: 50
              },
              shortUrl: {
                type: "string",
                minLength: 1,
                maxLength: 20,
                pattern: "[a-zA-Z]+"
              },
              color: {
                type: "string",
                pattern: "^#[0-9A-F]{6}$"
              },
              permissions: {
                type: "object",
                properties: {
                  readAccess: {
                    type: "object",
                    properties: {
                      public: {
                        type: "boolean",
                        default: false
                      },
                      roles: {
                        type: "array",
                        items: {
                          type: "string",
                          enum: ["FOUNDER", "OFFICER", "MEMBER"]
                        },
                        default: []
                      },
                      users: {
                        type: "array",
                        items: {
                          type: "string",
                          minLength: 10,
                          maxLength: 10
                        },
                        default: []
                      }
                    },
                    additionalProperties: false,
                    required: ["public", "roles", "users"],
                    default: {}
                  },
                  writeAccess: {
                    type: "object",
                    properties: {
                      public: {
                        type: "boolean",
                        enum: [false],
                        default: false
                      },
                      roles: {
                        type: "array",
                        items: {
                          type: "string",
                          enum: ["FOUNDER", "OFFICER", "MEMBER"]
                        },
                        default: []
                      },
                      users: {
                        type: "array",
                        items: {
                          type: "string",
                          minLength: 10,
                          maxLength: 10
                        },
                        default: []
                      }
                    },
                    additionalProperties: false,
                    required: ["public", "roles", "users"],
                    default: {}
                  }
                },
                additionalProperties: false,
                default: {},
                required: ["readAccess", "writeAccess"]
              }
            },
            additionalProperties: false,
            required: ["name", "shortUrl", "color", "permissions"]
          },
          calendar
        );
        if (!valid) {
          return res.status(400).json({
            message: "Calendar resource described is not valid.",
            code: "INVALID_CALENDAR",
            validationError: ajv.errors
          });
        }

        calendar.id = await nanoid(10);

        const calendarsCollection = db.collection("calendars");
        const existingCalendars = await calendarsCollection.countDocuments({
          $or: [{ name: calendar.name }, { shortUrl: calendar.shortUrl }]
        });

        if (existingCalendars > 0) {
          return res.status(409).json({
            message:
              "The name and the short url of the calendar must be unique.",
            code: "CALENDAR_NAME_OR_SHORTURL_NOT_UNIQUE"
          });
        }

        await calendarsCollection.insertOne({
          id: calendar.id,
          name: calendar.name,
          shortUrl: calendar.shortUrl,
          permissions: calendar.permissions,
          createdAt: new Date().toISOString(),
          createdBy: authenticatedUser.id
        });

        res.status(201).json({
          id: calendar.id,
          name: calendar.name,
          shortUrl: calendar.shortUrl
        });
      } catch (error) {
        console.log({
          error: {
            message: error.message,
            stack: error.stack
          },
          text: "An error occurend when creating the calendar."
        });
        return res.status(500).json({
          message: "An error occurend when creating the calendar.",
          code: "INTERNAL_SERVER_ERROR"
        });
      }
    });
    
    router.get("/nexus/calendar.ics", async (req, res, next) => {
      try {
        const calendarIcal = ical({
            domain: "nexus-api.nakasar.xyz/",
            prodId: `//Nexus Corporation//NXC//FR`,
            timezone: "Europe/Paris",
            name: "Evenements Nexus",
            ttl: 60*60,
            events: [
              {
                start: "2021-05-06T18:45:00Z",
                end: "2021-05-06T21:00:00Z",
                summary: "Search & Rescue",
                location: 'Port Tressler (PU)',
                description: "Un appel d'urgence, et une course pour y répondre le plus rapidement possible et retrouver un naufragé.",
                status: 'confirmed',
                organizer: {
                  name: "NEXUS CORP",
                  email: 'nexus.corp.sc@gmail.com'
                }
              },
              {
                start: "2021-05-12T17:00:00Z",
                end: "2021-05-12T21:30:00Z",
                summary: "Event Mammon",
                location: 'Grim Hex (PU)',
                description: "Double phases. Phase 1 : combat massive flotte contre flotte 25v25. Phase 2 : combat dans 890 Jump.",
                status: 'tentative',
                organizer: {
                  name: "NEXUS CORP",
                  email: 'nexus.corp.sc@gmail.com'
                }
              },
              {
                start: "2021-05-13T18:45:00Z",
                end: "2021-05-13T21:00:00Z",
                summary: "Roi de la Montagne",
                location: 'Port Tressler (PU)',
                description: "Combat FPS. Plusieurs équipes et un plateau en altitude à tenir le plus longtemps possible.",
                status: 'confirmed',
                organizer: {
                  name: "NEXUS CORP",
                  email: 'nexus.corp.sc@gmail.com'
                }
              },
            ],
          });

          res
            .set({
              "Content-Type": "text/calendar; charset=utf-8"
            })
            .send(calendarIcal.toString());
      } catch (error) {
          console.log({
            error: {
              message: error.message,
              stack: error.stack
            },
            text: "An error occurend when exporting the calendar to iCal."
          });
          return res.status(500).json({
            message: "An error occurend when exporting the calendar to iCal.",
            code: "INTERNAL_SERVER_ERROR"
          });
        }
    });

    router.get("/:calendarId/events", async (req, res, next) => {
      try {
        const { startDate, endDate } = req.query;
        const today = new Date();

        let startDateQuery = startDate ? new Date(startDate) : undefined;
        if (!startDateQuery) {
          startDateQuery = new Date();
          startDateQuery.setDate(1);
          startDateQuery.setHours(0);
          startDateQuery.setMinutes(0);
          startDateQuery.setSeconds(0);
          startDateQuery.setMilliseconds(0);
        }

        let endDateQuery = endDate ? new Date(endDate) : undefined;
        if (!endDateQuery) {
          endDateQuery = new Date(startDateQuery);
          endDateQuery.setMonth(endDateQuery.getMonth() + 1);
        }

        const db = this.mongoClient.db("nexus");
        const usersCollection = db.collection("users");
        const calendarsCollection = db.collection("calendars");
        const eventsCollection = db.collection("events");

        const calendar = await calendarsCollection.findOne({
          id: req.params.calendarId
        });
        if (!calendar) {
          return res.status(404).json({
            message: "The queried calendar does not exist.",
            code: "RESOURCE_NOT_FOUND"
          });
        }

        if (!calendar.permissions.readAccess.public) {
          if (!res.locals.authenticated) {
            return res.status(402).json({
              message:
                "This calendar is not public, authentication is required to retrieve its events.",
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

          if (
            _.difference(
              calendar.permissions.readAccess.roles,
              authenticatedUser.roles
            ).length === calendar.permissions.readAccess.roles.length &&
            !calendar.permissions.readAccess.users.includes(
              authenticatedUser.id
            )
          ) {
            if (
              !req.query.as_admin ||
              !authenticatedUser.roles.includes("SITE_ENGINEER")
            ) {
              return res.status(403).json({
                message:
                  "You are not authorized to retrieve events from this calendar.",
                code: "INSUFFICIENT_PRIVILEGES"
              });
            }
          }
        }

        const events = await eventsCollection
          .find(
            {
              calendarId: calendar.id,
              start: {
                $gte: startDateQuery.toISOString(),
                $lte: endDateQuery.toISOString()
              }
            },
            {
              projection: {
                id: 1,
                calendarId: 1,
                createdBy: 1,
                createdAt: 1,
                title: 1,
                start: 1,
                end: 1
              },
              limit: 25
            }
          )
          .toArray()
          .then(async events =>
            Promise.all(
              events.map(async event => {
                const calendar = await calendarsCollection.findOne(
                  { id: event.calendarId },
                  { projection: { id: 1, name: 1 } }
                );
                const creator = await usersCollection.findOne(
                  { id: event.createdBy },
                  { projection: { id: 1, username: 1 } }
                );

                return {
                  id: event.id,
                  calendar: {
                    id: calendar.id,
                    name: calendar.name
                  },
                  createdBy: {
                    id: creator.id,
                    username: creator.username
                  },
                  createdAt: event.createdAt,
                  title: event.title,
                  start: event.start,
                  end: event.end
                };
              })
            )
          );

        return res.status(206).json(events);
      } catch (error) {
        console.log({
          error: {
            message: error.message,
            stack: error.stack
          },
          text: "An error occurend when retrieving events of the calendar."
        });
        return res.status(500).json({
          message: "An error occurend when retrieving events of the calendar.",
          code: "INTERNAL_SERVER_ERROR"
        });
      }
    });

    router.post("/:calendarId/events", async (req, res, next) => {
      try {
        const db = this.mongoClient.db("nexus");
        const usersCollection = db.collection("users");
        const calendarsCollection = db.collection("calendars");
        const eventsCollection = db.collection("events");

        const calendar = await calendarsCollection.findOne({
          id: req.params.calendarId
        });
        if (!calendar) {
          return res.status(404).json({
            message: "The queried calendar does not exist.",
            code: "RESOURCE_NOT_FOUND"
          });
        }

        if (!res.locals.authenticated) {
          return res.status(402).json({
            message: "Authentication is required to create events.",
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
                "You are not authorized to create events for this calendar.",
              code: "INSUFFICIENT_PRIVILEGES"
            });
          }
        }

        const eventDto = req.body;

        const ajv = new Ajv({
          useDefaults: true,
          strictKeywords: true,
          format: "full"
        });
        const valid = ajv.validate(
          {
            title: "Event",
            description: "An event part of a calendar.",
            type: "object",
            properties: {
              title: {
                type: "string",
                maxLength: 50,
                minLength: 1
              },
              start: {
                type: "string",
                format: "date-time"
              },
              end: {
                type: "string",
                format: "date-time"
              }
            },
            additionalProperties: false,
            required: ["title", "start", "end"]
          },
          eventDto
        );
        if (!valid) {
          return res.status(400).json({
            message: "Event resource described is not valid.",
            code: "INVALID_USER",
            validationError: ajv.errors
          });
        }

        const event = {
          id: await nanoid(10),
          calendarId: calendar.id,
          title: eventDto.title,
          start: eventDto.start,
          end: eventDto.end,
          createdBy: authenticatedUser.id,
          createdAt: new Date().toISOString()
        };

        await eventsCollection.insertOne(event);

        return res.status(201).json({
          id: event.id,
          calendar: {
            id: event.calendarId,
            name: calendar.name
          },
          title: event.title,
          start: event.start,
          end: event.end,
          createdAt: event.createdAt
        });
      } catch (error) {
        console.log({
          error: {
            message: error.message,
            stack: error.stack
          },
          text: "An error occurend when creating an event for the calendar."
        });
        return res.status(500).json({
          message: "An error occurend when creating an event for the calendar.",
          code: "INTERNAL_SERVER_ERROR"
        });
      }
    });

    router.delete("/:calendarId/events/:eventId", async (req, res, next) => {
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

    router.get(
      "/:calendarId/:accessKey/calendar.ics",
      async (req, res, next) => {
        try {
          const db = this.mongoClient.db("nexus");
          const usersCollection = db.collection("users");
          const calendarsCollection = db.collection("calendars");
          const calendarAccessKeysCollection = db.collection(
            "calendarAccessKeys"
          );
          const eventsCollection = db.collection("events");

          const calendar = await calendarsCollection.findOne({
            $or: [
              { id: req.params.calendarId },
              { shortUrl: req.params.calendarId }
            ]
          });
          if (!calendar) {
            return res.status(404).json({
              message: "The calendar does not exist.",
              code: "RESOURCE_NOT_FOUND"
            });
          }

          const accessKey = await calendarAccessKeysCollection.findOne({
            id: req.params.accessKey
          });
          if (!accessKey) {
            return res.status(403).json({
              message: "The access key provided is not valid.",
              code: "AUTHENTICATION_REQUIRED"
            });
          }

          const authenticatedUser = await usersCollection.findOne({
            id: accessKey.createdBy
          });
          if (!authenticatedUser) {
            return res.status(402).json({
              message: "Authentication could not be retrieved from acess key.",
              code: "AUTHENTICATED_USER_NOT_REGISTERED"
            });
          }

          if (
            !calendar.permissions.readAccess.public &&
            _.difference(
              calendar.permissions.readAccess.roles,
              authenticatedUser.roles
            ).length === calendar.permissions.readAccess.roles.length &&
            !calendar.permissions.readAccess.users.includes(
              authenticatedUser.id
            )
          ) {
            if (
              !req.query.as_admin ||
              !authenticatedUser.roles.includes("SITE_ENGINEER")
            ) {
              return res.status(403).json({
                message:
                  "Owner of the access key is authorized to retrieve events from this calendar.",
                code: "INSUFFICIENT_PRIVILEGES"
              });
            }
          }

          let startDateQuery = new Date();
          startDateQuery.setDate(1);
          startDateQuery.setHours(0);
          startDateQuery.setMinutes(0);
          startDateQuery.setSeconds(0);
          startDateQuery.setMonth(startDateQuery.getMonth() - 1);
          startDateQuery.setMilliseconds(0);

          let endDateQuery = new Date(startDateQuery);
          endDateQuery.setMonth(endDateQuery.getMonth() + 2);

          console.log({
            startDate: startDateQuery.toISOString(),
            endDate: endDateQuery.toISOString()
          });

          const events = await eventsCollection
            .find(
              {
                calendarId: calendar.id,
                start: {
                  $gte: startDateQuery.toISOString(),
                  $lte: endDateQuery.toISOString()
                }
              },
              {
                projection: {
                  id: 1,
                  calendarId: 1,
                  createdBy: 1,
                  createdAt: 1,
                  title: 1,
                  start: 1,
                  end: 1
                },
                limit: 25
              }
            )
            .toArray()
            .then(async events =>
              Promise.all(
                events.map(async event => {
                  const calendar = await calendarsCollection.findOne(
                    { id: event.calendarId },
                    { projection: { id: 1, name: 1 } }
                  );
                  const creator = await usersCollection.findOne(
                    { id: event.createdBy },
                    { projection: { id: 1, username: 1 } }
                  );

                  return {
                    id: event.id,
                    calendar: {
                      id: calendar.id,
                      name: calendar.name
                    },
                    createdBy: {
                      id: creator.id,
                      username: creator.username
                    },
                    createdAt: event.createdAt,
                    title: event.title,
                    start: event.start,
                    end: event.end
                  };
                })
              )
            );

          const calendarIcal = ical({
            domain: "nexus-calendar.glitch.me",
            prodId: `//Nexus Corporation//${calendar.name}//FR`,
            timezone: "Europe/Paris",
            name: calendar.name,
            ttl: 60*60,
            events: events.map(event => ({
              start: event.start,
              end: event.end,
              summary: event.title
            }))
          });

          res
            .set({
              "Content-Type": "text/calendar; charset=utf-8"
            })
            .send(calendarIcal.toString());
        } catch (error) {
          console.log({
            error: {
              message: error.message,
              stack: error.stack
            },
            text: "An error occurend when exporting the calendar to iCal."
          });
          return res.status(500).json({
            message: "An error occurend when exporting the calendar to iCal.",
            code: "INTERNAL_SERVER_ERROR"
          });
        }
      }
    );

    router.get("/:calendarId/keys", async (req, res, next) => {
      try {
        const db = this.mongoClient.db("nexus");
        const usersCollection = db.collection("users");
        const calendarsCollection = db.collection("calendars");
        const calendarAccessKeysCollection = db.collection(
          "calendarAccessKeys"
        );

        const calendar = await calendarsCollection.findOne({
          id: req.params.calendarId
        });
        if (!calendar) {
          return res.status(404).json({
            message: "The calendar does not exist.",
            code: "RESOURCE_NOT_FOUND"
          });
        }

        if (!res.locals.authenticated) {
          return res.status(402).json({
            message:
              "Authentication is required to create calendar access keys.",
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

        const keys = await calendarAccessKeysCollection
          .find({
            createdBy: authenticatedUser.id,
            calendarId: calendar.id
          })
          .limit(50)
          .toArray();

        return res.status(206).json(
          keys.map(key => ({
            key: key.id,
            calendar: {
              id: calendar.id,
              name: calendar.name,
              shortUrl: calendar.shortUrl
            }
          }))
        );
      } catch (error) {
        console.log({
          error: {
            message: error.message,
            stack: error.stack
          },
          text: "An error occurend when retrieving keys for this calendar."
        });
        return res.status(500).json({
          message: "An error occurend when retrieving keys for this calendar.",
          code: "INTERNAL_SERVER_ERROR"
        });
      }
    });

    router.post("/:calendarId/keys", async (req, res, next) => {
      try {
        const db = this.mongoClient.db("nexus");
        const usersCollection = db.collection("users");
        const calendarsCollection = db.collection("calendars");
        const calendarAccessKeysCollection = db.collection(
          "calendarAccessKeys"
        );

        const calendar = await calendarsCollection.findOne({
          id: req.params.calendarId
        });
        if (!calendar) {
          return res.status(404).json({
            message: "The calendar does not exist.",
            code: "RESOURCE_NOT_FOUND"
          });
        }

        if (!res.locals.authenticated) {
          return res.status(402).json({
            message:
              "Authentication is required to create calendar access keys.",
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

        if (
          !calendar.permissions.readAccess.public &&
          _.difference(
            calendar.permissions.readAccess.roles,
            authenticatedUser.roles
          ).length === calendar.permissions.readAccess.roles.length &&
          !calendar.permissions.readAccess.users.includes(authenticatedUser.id)
        ) {
          if (
            !req.query.as_admin ||
            !authenticatedUser.roles.includes("SITE_ENGINEER")
          ) {
            return res.status(403).json({
              message:
                "You are not authorized to retrieve events from this calendar, hence you cannot create an access key for it.",
              code: "INSUFFICIENT_PRIVILEGES"
            });
          }
        }

        const key = {
          id: await nanoid(10),
          createdBy: authenticatedUser.id,
          calendarId: calendar.id
        };

        await calendarAccessKeysCollection.insertOne(key);

        return res.status(201).json({
          key: key.id,
          calendar: {
            id: key.calendarId,
            name: calendar.name,
            shortUrl: calendar.shortUrl
          }
        });
      } catch (error) {
        console.log({
          error: {
            message: error.message,
            stack: error.stack
          },
          text: "An error occurend when creating a key for this calendar."
        });
        return res.status(500).json({
          message: "An error occurend when creating a key for this calendar.",
          code: "INTERNAL_SERVER_ERROR"
        });
      }
    });

    return router;
  }
}

module.exports = { CalendarsRouter };
