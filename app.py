import json
import datetime

from DiscordClient import (
    DiscordClient,
    serialize_category,
    serialize_channel,
)
from UserFeed import UserFeed
import auth
from config import ACTIVE_GUILD_ID, MONITOR_CHANNEL_IDS, SHORTCUT_CHANNEL_IDS, TOKEN
import asyncio
from quart import (
    Quart,
    request,
    websocket,
    abort,
    redirect,
    render_template,
    copy_current_websocket_context,
)

app = Quart(__name__)

app.feeds = {}


async def push_data(payload, channel):
    data = json.dumps(payload)

    for ws, userfeed in app.feeds.items():
        if not userfeed.authenticated:
            continue

        if not auth.check_user_permissions(userfeed.user_id, channel.guild, channel):
            continue

        await ws.send(data)


app.push_data = push_data


@app.before_serving
async def before_serving():
    app.discord_client = DiscordClient(app)
    app.get_guild = lambda: app.discord_client.client.get_guild(ACTIVE_GUILD_ID)
    app.auth_inst = auth.Auth()
    await app.auth_inst.initialize()
    asyncio.get_event_loop().create_task(app.discord_client.client.start(TOKEN))


@app.route("/")
async def index():
    return await render_template(
        "index.html", ts=str(datetime.datetime.utcnow().timestamp())
    )


@app.route("/login")
async def login():
    return redirect(auth.oauth_url())


@app.route("/api/refresh")
async def refresh_token():
    return await app.auth_inst.refresh_token(request.headers)


@app.route("/callback")
async def callback():
    return await app.auth_inst.callback(request)


@app.route("/api/data")
async def getdata():
    guild = app.get_guild()
    user = UserFeed()
    user.authenticate(request.headers.get("Authorization", ""), guild)
    if not user.authenticated:
        await abort(401)

    return json.dumps(
        {
            "guild_id": str(ACTIVE_GUILD_ID),
            "channels": [
                serialize_channel(app.get_guild().get_channel(c))
                for c in MONITOR_CHANNEL_IDS
                if app.get_guild().get_channel(c)
            ],
            "categories": sorted(
                {
                    cat.id: serialize_category(cat)
                    for c in MONITOR_CHANNEL_IDS
                    if (cat := app.get_guild().get_channel(c).category)
                }.values(),
                key=lambda x: x["position"],
            ),
            "shortcuts": [
                serialize_channel(app.get_guild().get_channel(c))
                for c in SHORTCUT_CHANNEL_IDS
                if app.get_guild().get_channel(c)
            ],
        }
    )


async def receiving():
    while True:
        data = await websocket.receive()
        obj = websocket._get_current_object()

        try:
            data = json.loads(data)
        except:
            return

        if data.get("event", None) == "authenticate" and "payload" in data:
            app.feeds[obj].authenticate(data["payload"], app.get_guild())


@app.websocket("/")
async def channel_feed_websocket():
    obj = websocket._get_current_object()

    app.feeds[obj] = UserFeed()

    consumer = asyncio.ensure_future(
        copy_current_websocket_context(receiving)(),
    )
    try:
        await asyncio.gather(consumer)
    finally:
        consumer.cancel()
        app.feeds.pop(obj, None)
