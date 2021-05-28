const { Client } = require("discord.js");

const { EventRoleCommand } = require('./commands/event-role/event-role.command');
const { EventRoleCreateCommand } = require('./commands/event-role/event-role-create.command');
const { EventRoleDeleteCommand } = require('./commands/event-role/event-role-delete.command');
const { EventRoleParticipantsCommand } = require('./commands/event-role/event-role-participants.command');
const { EventMessagesCache } = require('./event-messages-cache.js');

class DiscordAdapter {
  constructor(configuration, { mongoClient }) {
    this.configuration = configuration;
    this.mongoClient = mongoClient;

    this.eventMessagesCache = new EventMessagesCache({ mongoClient });

    const eventRoleCreateCommand = new EventRoleCreateCommand({
      mongoClient,
      eventMessagesCache: this.eventMessagesCache
    });
    const eventRoleDeleteCommand = new EventRoleDeleteCommand({
      mongoClient,
      eventMessagesCache: this.eventMessagesCache
    });
    const eventRoleParticipantsCommand = new EventRoleParticipantsCommand({
      eventMessagesCache: this.eventMessagesCache
    });
    this.eventRoleCommand = new EventRoleCommand({
      eventRoleCreateCommand,
      eventRoleDeleteCommand,
      eventRoleParticipantsCommand
    });
  }

  async start() {
    this.client = new Client({ partials: ["MESSAGE", "CHANNEL", "REACTION"] });
    this.client.once("ready", () => {
      console.log({
        message: "Discord client started."
      });
    });

    this.client.on("error", error => {
      console.log({
        message: "Discord client catched an error.",
        error
      });
    });

    this.client.on("message", async message => {
      try {
        if (
          !message.content.startsWith(this.configuration.prefix) ||
          message.author.bot
        ) {
          return;
        }

        const [prefix, command, ...args] = message.content.split(" ");
        
        if (command.toLowerCase() === 'invite') {
          await message.reply(`Hey! Actuellement, seul mon créateur et les quelques personnes autorisées peuvent m'inviter. Si tu fais partie de ces chanceux, clique sur le lien suivant : ${this.configuration.inviteLink}.`);
          return;
        }

        if (!command || command.toLowerCase() !== "event-role") {
          return;
        }

        await this.eventRoleCommand.execute({
          client: message.client,
          message,
          command: args.join(" ")
        });
      } catch (error) {
        console.log({
          message: "Failed to handle message.",
          adapter: "DiscordAdapter",
          code: "MESSAGE_HANDLING_FAILED",
          originalMessage: message.content,
          error: {
            message: error.message,
            stack: error.stack,
            name: error.name
          }
        });
        return;
      }
    });

    this.client.on("messageReactionAdd", async (reaction, user) => {
      try {
        if (!["✅"].includes(reaction.emoji.name)) {
          return;
        }

        const eventMessageCached = await this.eventMessagesCache.getMessageById(
          reaction.message.id
        );

        if (!eventMessageCached) {
          return;
        }

        const guild = await this.client.guilds.fetch(
          eventMessageCached.eventGuildId
        );
        const member = await guild.members.fetch(user.id);
        await member.roles.add(
          eventMessageCached.eventRoleId,
          `L'utilisateur a réagit à l'évènement.`
        );
      } catch (error) {
        console.log({
          message: "Failed to handle messageReactionAdd event.",
          event: "messageReactionAdd",
          adapter: "DiscordAdapter",
          error
        });
      }
    });

    this.client.on("messageReactionRemove", async (reaction, user) => {
      try {
        if (!["✅"].includes(reaction.emoji.name)) {
          return;
        }

        const eventMessageCached = await this.eventMessagesCache.getMessageById(
          reaction.message.id
        );

        if (!eventMessageCached) {
          return;
        }

        const guild = await this.client.guilds.fetch(
          eventMessageCached.eventGuildId
        );
        const member = await guild.members.fetch(user.id);
        await member.roles.remove(
          eventMessageCached.eventRoleId,
          `L'utilisateur a supprimé sa réaction à l'évènement.`
        );
      } catch (error) {
        console.log({
          message: "Failed to handle messageReactionRemove event.",
          event: "messageReactionRemove",
          adapter: "DiscordAdapter",
          error
        });
      }
    });
    this.client.login(this.configuration.botToken);
  }
}

module.exports = { DiscordAdapter };
