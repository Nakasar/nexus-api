const jwt = require("jsonwebtoken");
const { nanoid } = require("nanoid/async");
const fetch = require("node-fetch");

class AuthenticationRouter {
  constructor({ mongoClient }) {
    this.mongoClient = mongoClient;
    this.authStates = new Map();
  }

  init(router) {
    router.post("/", async (req, res, next) => {
      try {
        const authState = {
          state: await nanoid(),
          origin: req.body.origin,
          redirectUri: req.body.redirectUri
        };

        this.authStates.set(authState.state, authState);

        return res.json({
          state: authState.state,
          clientId: process.env.DISCORD_CLIENT_ID
        });
      } catch (error) {
        next(error);
      }
    });

    router.put("/:state", async (req, res, next) => {
      try {
        const { code } = req.body;
        const { state } = req.params;

        const authState = this.authStates.get(state);
        if (!authState) {
          return res.status(404).json({
            message: "No pending authentication requests."
          });
        }

        const data = new URLSearchParams();
        data.append("client_id", process.env.DISCORD_CLIENT_ID);
        data.append("client_secret", process.env.DISCORD_CLIENT_SECRET);
        data.append("grant_type", "authorization_code");
        data.append("code", code);
        data.append("redirect_uri", authState.redirectUri);
        data.append("scope", "identify");
        data.append("state", state);

        const tokenResult = await fetch(
          "https://discord.com/api/v6/oauth2/token",
          {
            method: "POST",
            headers: {
              "Content-Type": "application/x-www-form-urlencoded"
            },
            body: data
          }
        );
        if (!tokenResult.ok) {
          console.log(await tokenResult.json());
          return res.status(403).json({
            message: "Authentication failed."
          });
        }

        const discordToken = await tokenResult.json();

        const discordProfile = await fetch(
          "https://discord.com/api/v6/users/@me",
          {
            method: "GET",
            headers: {
              "Content-Type": "application/x-www-form-urlencoded",
              Authorization: `Bearer ${discordToken.access_token}`
            }
          }
        ).then(res => res.json());

        const db = this.mongoClient.db("nexus");
        const collection = db.collection("users");
        
        const user = await collection.findOne({
          discordId: discordProfile.id,
        });
        if (!user) {
          return res.status(403).json({
            message: "You are not registered in the corporation database.",
            code: 'USER_NOT_REGISTERED',
          });
        }

        const token = jwt.sign(
          {
            sub: user.id,
            username: user.username,
          },
          process.env.TOKEN_SECRET,
          { expiresIn: "1h" }
        );

        return res.status(201).json({
          token,
          redirect: authState.origin
        });
      } catch (error) {
        next(error);
      }
    });

    return router;
  }
}

module.exports = { AuthenticationRouter };
