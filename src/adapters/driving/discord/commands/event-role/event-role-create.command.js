const Yargs = require("yargs");

class EventRoleCreateCommand {
  constructor({ eventMessagesCache, mongoClient }) {
    this.eventMessagesCache = eventMessagesCache;
    this.mongoClient = mongoClient;
  }

  async execute({ client, message, command }) {
    const parsed = Yargs.command("create <role> <message>").parse(
      command,
      (error, argv, output) => {}
    );

    if (!parsed.message) {
      message.reply(
        "Impossible de trouver le message de l'évènement. Vérifie le format de la commande : `event-role create <role> <message>`."
      );
      return;
    }

    if (!parsed.role) {
      message.reply(
        "Impossible de trouver le nom du rôle à créer. Vérifie le format de la commande : `event-role create <role> <message>`."
      );
      return;
    }

    let messageId;
    let channelId;
    let guildId;
    if (!parsed.message.includes("/channels")) {
      messageId = parsed.message;

      if (!message.guild) {
        message.reply(
          "Je ne peux pas gérer d'évènements créé dans des groupes privés, seuls les serveurs sont supportés."
        );
        return;
      }

      guildId = message.guild.id;
      channelId = message.channel.id;
    } else {
      const [linkPrefix, messageDescriptor] = parsed.message.split(
        "/channels/"
      );
      const messageIds = messageDescriptor.split("/");

      if (messageIds.length !== 3) {
        message.reply(
          "Je n'ai pas reconnu le format de l'url du message. Normalement, un lien vers un message est de la forme suivante : `https://discord.com/channels/<guildId>/<channelId>/<messageId>`.\n\n:bulb: Si tu utilise cette commande dans le même canal que le message de l'évènement, tu peux mettre l'ID du message au lieu du lien."
        );
        return;
      }

      guildId = messageIds[0];
      channelId = messageIds[1];
      messageId = messageIds[2];

      if (guildId.toLowerCase() === "@me") {
        message.reply(
          "Je ne peux pas gérer d'évènements créé dans des groupes privés, seuls les serveurs sont supportés."
        );
        return;
      }
    }

    if (!messageId || !guildId || !channelId) {
      message.reply(
        "Je n'ai pas été capable de retrouver le message concerné. Vérifie que le lien est correct ou que l'ID est au bon endroit dans la commande."
      );
      return;
    }

    const eventMessageGuild = await message.client.guilds.fetch(guildId);
    if (!eventMessageGuild) {
      message.reply(
        "Je n'ai pas trouvé le serveur où le message d'évènement à été publié. Je ne suis peut-être pas présent sur ce serveur.\n\n:bulb: Pour m'inviter, tu peux utiliser ce lien : {{LIEN}}."
      );
      return;
    }

    const eventMessageChannel = await message.client.channels.fetch(channelId);
    if (!eventMessageChannel) {
      message.reply(
        "Je n'ai pas trouvé le canal où le message d'évènement à été publié. Je n'ai peut-être pas les permissions de lire ce canal."
      );
      return;
    }

    const eventMessage = await eventMessageChannel.messages.fetch(messageId);
    if (!eventMessage) {
      message.reply(
        "Je n'ai pas trouvé le message d'évènement indiqué. Je n'ai peut-être pas les permissions de lire le canal, ou l'historique de ce canal."
      );
      return;
    }

    try {
      await eventMessage.react("✅");
      await eventMessage.react("📆");
      await eventMessage.react("🚫");
    } catch (error) {
      console.log({
        adapter: "DiscordAdapter",
        command: "event-role create",
        message: "Cannot react to message.",
        originalMessage: {
          content: message.content,
          id: message.id
        },
        error: {
          message: error.message,
          stack: error.stack,
          name: error.name
        },
        eventMessageId: messageId,
        guildId: guildId,
        channelId: channelId
      });

      await message.reply(
        "Je n'ai pas réussi à ajouter des réactions au mesage d'évènement. Je n'ai peut-être pas les permissions de réagir aux message dans le canal concerné."
      );
      return;
    }

    let eventRole;
    try {
      eventRole = await eventMessageGuild.roles.create({
        data: {
          name: parsed.role
        },
        reason: `La commande de création de rôle a été invoquée par ${message.author.displayName}.`
      });
    } catch (error) {
      console.log({
        adapter: "DiscordAdapter",
        command: "event-role create",
        message: "Cannot create role.",
        originalMessage: {
          content: message.content,
          id: message.id
        },
        roleName: parsed.role,
        error,
        eventMessageId: messageId,
        guildId: guildId,
        channelId: channelId
      });

      await message.reply(
        "Je n'ai pas réussi à créer le rôle pour cet évènement. Je n'ai peut-être pas les permissions de consulter ou de créer des rôles sur le serveur concerné."
      );
      return;
    }

    const db = this.mongoClient.db("nexus");
    const discordEventsCollection = db.collection("discord-events");

    await discordEventsCollection.insertOne({
      eventGuildId: guildId,
      eventChannelId: channelId,
      eventMessageId: messageId,
      eventRoleId: eventRole.id
    });
    await this.eventMessagesCache.refresh();

    const noticeMessage = await message.channel.send(
      "OK! J'ai rajouté trois réactions au message indiqué qui signifient respectivement :\n:white_check_mark: Participer.\n:calendar: Indisponible, une autre date ?\n:no_entry_sign: Pas intéressé.\n\n:bulb: Il peut être intéressant d'éditer le message pour s'assurer que cette légende soit indiquée dans l'annonce !\n\nDésormais, toute personne qui réagit avec :white_check_mark: se verra attribué le nouveau rôle créé.\nLorsque le rôle n'est plus nécessaire, pense à le supprimer soit depuis les permissions discord, soit en utilisant la commande `event-role delete <message>`, avec le lien du message d'annonce.\n\n:🧨: Tu peux supprimer ce message en toute sécurité en réagissant avec cette dynamite (il s'autodétruira au bout d'une minute également)."
    );

    await noticeMessage.react("❌");
    noticeMessage.awaitReactions((reaction, user) => {
      return (
        ["🧨"].includes(reaction.emoji.name) && user.id === message.author.id
      );
    }, { max: 1, time: '60000' }).then(async () => {
      await noticeMessage.delete();
    }).catch(() => {});
  }
}

module.exports = { EventRoleCreateCommand };
