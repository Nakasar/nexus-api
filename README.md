# Nexus Calendar API

## Event discord automated roles

The Nexus Bot allow to dynamically create specific roles for each events, and assign these roles to participants to allow easy mentions.

### Create an event with a dynamic role

- First, create a participation message, the format is non-normative.
- Then, copy the link or identifier of the message (right click => copy link or ID).
- Send a new message to the bot (direct messages with the bot do work):

```
+nxc event-role create -r "role name" <link or ID of message>
```

The bot answers by creating three reactions on the specified message: a green white check, a calendar, a no entry sign, respectively representing "participating", "not available", "not interested".

The bot also creates a new role as specified by the "r" argument of the command.

Each time a user reacts with the green white check mark, the role role created for the event is assigned to the user.
Whenener the user unreact the green white check mark, the role is removed from the user roles.