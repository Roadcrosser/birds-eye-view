import disnake as discord
from config import ACTIVE_GUILD_ID, MONITOR_CHANNEL_IDS


class DiscordClient:
    def __init__(self, quart_app):
        self.quart_app = quart_app
        self.client = discord.Client(
            intents=discord.Intents(guilds=True, members=True, guild_messages=True)
        )

        @self.client.event
        async def on_ready():
            print(
                f"Bot running: {self.client.user.name}#{self.client.user.discriminator} ({self.client.user.id})"
            )

        @self.client.event
        async def on_message(message):
            if (
                not message.guild
                or not message.guild.id == ACTIVE_GUILD_ID
                or not message.channel.id in MONITOR_CHANNEL_IDS
            ):
                return

            data = {
                "event": "message_create",
                "payload": {
                    **serialize_message(message),
                    "author": message.author.name,
                    "avatar": (
                        message.author.avatar.with_format("png").url
                        if message.author.avatar
                        else message.author.default_avatar.with_format("png").url
                    ),
                    "nick": message.author.nick,
                    "color": str(message.author.color),
                    "guild": str(message.guild.id),
                    "channel": str(message.channel.id),
                    "bot": message.author.bot,
                    "system_content": message.system_content
                    if message.is_system()
                    else None,
                },
            }

            await self.quart_app.push_data(data, message.channel)

        @self.client.event
        async def on_message_edit(before, after):
            if (
                not before.guild
                or not before.guild.id == ACTIVE_GUILD_ID
                or not before.channel.id in MONITOR_CHANNEL_IDS
            ):
                return

            data = {
                "event": "message_edit",
                "payload": {
                    **serialize_message(after),
                    "content_edited": before.content != after.content,
                    "channel": str(before.channel.id),
                },
            }

            await self.quart_app.push_data(data, after.channel)

        @self.client.event
        async def on_message_delete(message):
            if (
                not message.guild
                or not message.guild.id == ACTIVE_GUILD_ID
                or not message.channel.id in MONITOR_CHANNEL_IDS
            ):
                return

            data = {
                "event": "message_delete",
                "payload": {
                    "id": str(message.id),
                },
            }

            await self.quart_app.push_data(data, message.channel)

        @self.client.event
        async def on_guild_channel_update(_, after):
            if not after.id in MONITOR_CHANNEL_IDS:
                return

            await self.quart_app.push_data(
                {
                    "event": "channel_update",
                    "payload": serialize_channel(after),
                },
                after,
            )


def serialize_channel(channel):
    return {
        "name": channel.name,
        "category": str(channel.category.id),
        "id": str(channel.id),
        "slowmode": channel.slowmode_delay,
        "viewable": channel.permissions_for(channel.guild.me).read_messages,
    }


def serialize_category(category):
    return {
        "id": str(category.id),
        "name": category.name,
        "position": category.position,
    }


def serialize_embed(embed):
    return embed.to_dict()


def serialize_sticker(sticker):
    return {
        "name": sticker.name,
        "format": sticker.format.file_extension,
        "url": sticker.url,
    }


def serialize_reference_author(reference):
    name = None
    color = None

    if reference:
        ref = reference.cached_message
        if not ref:
            reference.resolved

        if type(ref) == discord.DeletedReferencedMessage:
            ref = None

        if ref:
            name = ref.author.name
            color = str(ref.author.color)

    return {
        "is_reply": bool(reference),
        "name": name,
        "color": color,
    }


def serialize_message(message):
    return {
        "id": str(message.id),
        "content": message.clean_content,
        "attachments": [m.url for m in message.attachments],
        "embeds": [serialize_embed(e) for e in message.embeds],
        "stickers": [serialize_sticker(s) for s in message.stickers],
        "reply": serialize_reference_author(message.reference),
    }
