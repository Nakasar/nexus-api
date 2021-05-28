# Nexus Calendar API

## Event discord automated roles

The Nexus Bot allow to dynamically create specific roles for each events, and assign these roles to participants to allow easy mentions.

### Create an event with a dynamic role

- First, create a participation message, the format is non-normative.
- Then, copy the link or identifier of the message (right click => copy link or ID).
- Send a new message to the bot (direct messages with the bot do work):

```
+nxc event-role create "role name" <link or ID of message>
```

The bot answers by creating three reactions on the specified message: a green white check, a calendar, a no entry sign, respectively representing "participating", "not available", "not interested".

The bot also creates a new role as specified by the "r" argument of the command.

Each time a user reacts with the green white check mark, the role role created for the event is assigned to the user.
Whenener the user unreact the green white check mark, the role is removed from the user roles.

### Display participants to an event

```
+nxc event-role participants <@Role or message link or ID>
```

### Remove an event role

You can delete the role from the discord permissions tab, but the recommended way is to call the delete event-role command:


```
+nxc event-role delete <@Role or message link or ID>
```

> Note that only role managed by the bot and for active events can be removed using this command.
