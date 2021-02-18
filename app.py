import json
import asyncio
import discord
from quart import Quart, render_template, websocket, copy_current_websocket_context

import yaml

try:
    from yaml import CLoader as Loader, CDumper as Dumper
except ImportError:
    from yaml import Loader, Dumper

app = Quart(__name__)
client = discord.Client(intents=discord.Intents(guilds=True, messages=True))

with open("config.yaml", encoding="utf-8") as o:
    config = yaml.load(o.read(), Loader=Loader)

feeds = set()

guild_id = config["guild_id"]
channels = config["channel_ids"]


@app.route("/")
async def index():
    return await render_template("index.html")


@app.route("/data")
async def getdata():
    return json.dumps(
        {
            "guild": str(guild_id),
            "channels": [
                serialize_channel(client.get_guild(guild_id).get_channel(c))
                for c in channels
                if client.get_guild(guild_id).get_channel(c)
            ],
        }
    )


async def receiving():
    while True:
        # We won't be receiving any data so why is this here
        data = await websocket.receive()


@app.websocket("/")
async def channel_feed_websocket():
    obj = websocket._get_current_object()

    feeds.add(obj)

    consumer = asyncio.ensure_future(copy_current_websocket_context(receiving)(),)
    try:
        await asyncio.gather(consumer)
    finally:
        consumer.cancel()
        feeds.remove(obj)


@client.event
async def on_ready():
    print(
        f"Bot running: {client.user.name}#{client.user.discriminator} ({client.user.id})"
    )
    await app.run_task()


def serialize_channel(channel):
    return {
        "name": channel.name,
        "id": str(channel.id),
        "slowmode": channel.slowmode_delay,
        "viewable": channel.permissions_for(channel.guild.me).read_messages,
    }


def serialize_embed(embed):
    return embed.to_dict()


def serialize_message(message):
    return {
        "id": str(message.id),
        "content": message.clean_content,
        "attachments": [m.url for m in message.attachments],
        "embeds": [serialize_embed(e) for e in message.embeds],
    }


@client.event
async def on_message(message):
    if (
        not message.guild
        or not message.guild.id == guild_id
        or not message.channel.id in channels
    ):
        return

    data = {
        "event": "message_create",
        "payload": {
            **serialize_message(message),
            "author": message.author.name,
            "avatar": str(message.author.avatar_url_as(format="png", size=1024)),
            "nick": message.author.nick,
            "color": str(message.author.color),
            "guild": str(guild_id),
            "channel": str(message.channel.id),
            "bot": message.author.bot,
            "system_content": message.system_content if message.is_system() else None,
        },
    }

    await push_data(data)


@client.event
async def on_message_edit(before, after):
    if (
        not before.guild
        or not before.guild.id == guild_id
        or not before.channel.id in channels
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

    await push_data(data)


@client.event
async def on_message_delete(message):
    if (
        not message.guild
        or not message.guild.id == guild_id
        or not message.channel.id in channels
    ):
        return

    data = {
        "event": "message_delete",
        "payload": {"id": str(message.id),},
    }

    await push_data(data)


@client.event
async def on_guild_channel_update(before, after):
    if not after.id in channels:
        return

    await push_data(
        {"event": "channel_update", "payload": serialize_channel(after),}
    )


async def push_data(payload):
    data = json.dumps(payload)

    for ws in feeds:
        await ws.send(data)


client.run(config["token"])
