class EventRoleParticipantsCommand {
  constructor({ eventMessagesCache }) {
    this.eventMessagesCache = eventMessagesCache;
  }

  async execute({ client, message, command }) {
    const args = command.split(" ");

    if (args.length !== 1) {
      message.reply(
        "Pour afficher les participants à un évènement, utilise la commande suivante `event-role participants <message|role>`, avec en message le lien vers l'annonce ou le rôle associé."
      );
      return;
    }

    const messageArgument = args[0];

    let eventMessage;
    if (messageArgument.includes("@&")) {
      // message argument is a role
      const matches = messageArgument.match(/^<@&(\d+)>$/);

      if (!matches) {
        message.reply("Je n'ai pas pu identifier un rôle dans ta commande.");
        return;
      }

      const roleId = matches[1];

      eventMessage = await this.eventMessagesCache.getMessageByRoleId(roleId);
      if (!eventMessage) {
        message.reply(
          "Le role spécifié n'est pas associé à un évènement enregistré."
        );
        return;
      }
    } else {
      // message argument is a message link or ID
      const messageIds = messageArgument.split("/");

      let messageId;
      if (messageIds.length === 1) {
        messageId = messageIds[0];
      } else {
        messageId = messageIds[2];
      }

      if (!messageId) {
        message.reply(
          "Je n'ai pas pu reconnaître un ID de message dans l'argument de la commande. Précise le lien vers le message ou son ID discord."
        );
        return;
      }

      eventMessage = await this.eventMessagesCache.getMessageById(messageId);
      if (!eventMessage) {
        message.reply(
          "Le message spécifié n'est pas enregistré comme une annonce d'évènement."
        );
        return;
      }
    }

    const guild = await client.guilds.fetch(eventMessage.eventGuildId);
    const role = await guild.roles.fetch(eventMessage.eventRoleId);

    await message.channel.send(
      `Les participants à l'évènement associé au rôle ${role} sont: ${role.members
        .map(member => member.displayName)
        .join(", ")}.`
    );
  }
}

module.exports = { EventRoleParticipantsCommand };
