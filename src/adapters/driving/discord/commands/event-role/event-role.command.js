class EventRoleCommand {
  constructor({
    eventRoleCreateCommand,
    eventRoleDeleteCommand,
    eventRoleParticipantsCommand
  }) {
    this.eventRoleCreateCommand = eventRoleCreateCommand;
    this.eventRoleDeleteCommand = eventRoleDeleteCommand;
    this.eventRoleParticipantsCommand = eventRoleParticipantsCommand;
  }

  async execute({ client, message, command }) {
    const [subCommand, ...args] = command.split(" ");

    switch (subCommand.toLowerCase()) {
      case "create":
        return this.eventRoleCreateCommand.execute({
          client,
          message,
          command: [subCommand, ...args].join(" ")
        });
      case "delete":
        return this.eventRoleDeleteCommand.execute({
          client,
          message,
          command: args.join(" ")
        });
      case "participants":
        return this.eventRoleParticipantsCommand.execute({
          client,
          message,
          command: args.join(" ")
        });
    }
  }
}

module.exports = { EventRoleCommand };
