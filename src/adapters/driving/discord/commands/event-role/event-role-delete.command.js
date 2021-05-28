class EventRoleDeleteCommand {
  constructor({ eventMessagesCache, mongoClient }) {
    this.eventMessagesCache = eventMessagesCache;
    this.mongoClient = mongoClient;
  }

  async execute({ client, message, command }) {
    const args = command.split(" ");

    if (args.length !== 1) {
      message.reply(
        "Pour supprimer un rôle d'évènement, utilise la commande suivante `event-role delete <message|role>`, avec en message le lien vers l'annonce ou le rôle associé."
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
      let messageId;
      if (!messageArgument.includes("/channels")) {
        messageId = messageArgument;

        if (!message.guild) {
          message.reply(
            "En spécifiant uniquement l'ID de l'évènement, la commande doit être exécutée dans le même canal que l'annonce de l'évènement.\n\n:bulb: Pour exécuter la commande de n'importe où, utilise plutôt le lien du message dans la commande."
          );
          return;
        }
      } else {
        const [linkPrefix, messageDescriptor] = messageArgument.split(
          "/channels/"
        );
        const messageIds = messageDescriptor.split("/");

        if (messageIds.length !== 3) {
          message.reply(
            "Je n'ai pas reconnu le format de l'url du message. Normalement, un lien vers un message est de la forme suivante : `https://discord.com/channels/<guildId>/<channelId>/<messageId>`.\n\n:bulb: Si tu utilise cette commande dans le même canal que le message de l'évènement, tu peux mettre l'ID du message au lieu du lien."
          );
          return;
        }

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
    await role.delete(
      `La commande de suppression de rôle a été invoquée par ${message.author.displayName}.`
    );

    const db = this.mongoClient.db("nexus");
    const discordEventsCollection = db.collection("discord-events");

    await discordEventsCollection.deleteOne({
      eventRoleId: eventMessage.eventRoleId
    });
    await this.eventMessagesCache.refresh();

    await message.reply("OK! J'ai supprimé le rôle de l'évènement.");
  }
}

module.exports = { EventRoleDeleteCommand };
