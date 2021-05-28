class EventMessagesCache {
  constructor({ mongoClient }) {
    this.mongoClient = mongoClient;
    this.eventMessages = null;
    this.lastRefresh = null;
  }

  mustRefresh() {
    return !this.lastRefrest;
  }

  async refresh() {
    const db = this.mongoClient.db("nexus");
    const discordEventsCollection = db.collection("discord-events");

    const discordEvents = await discordEventsCollection.find().toArray();
    this.eventMessages = discordEvents.map(discordEvent => ({
      eventGuildId: discordEvent.eventGuildId,
      eventChannelId: discordEvent.eventChannelId,
      eventMessageId: discordEvent.eventMessageId,
      eventRoleId: discordEvent.eventRoleId
    }));

    this.lastRefresh = new Date();
  }

  async getMessageById(messageId) {
    if (this.mustRefresh()) {
      await this.refresh();
    }

    return this.eventMessages.find(
      candidate => candidate.eventMessageId === messageId
    );
  }

  async getMessageByRoleId(roleId) {
    if (this.mustRefresh()) {
      await this.refresh();
    }

    return this.eventMessages.find(
      candidate => candidate.eventRoleId === roleId
    );
  }
}

module.exports = { EventMessagesCache };
