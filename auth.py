import asyncio
import datetime
import aiohttp
import json
import jwt

from urllib.parse import quote

from config import CLIENT_ID, CLIENT_SECRET, REDIRECT_URI, JWT_KEY, WHITELIST_ROLE_ID

from quart import abort, url_for

BASE_URL = "https://discordapp.com/api"


def oauth_url():
    return f"https://discord.com/api/oauth2/authorize?client_id={CLIENT_ID}&redirect_uri={quote(REDIRECT_URI)}&response_type=code&scope=identify"


class Auth:
    def __init__(self):
        self.session = None

    async def initialize(self):
        self.session = aiohttp.ClientSession(loop=asyncio.get_event_loop())

    async def get_discord_user_info(self, token):
        async with self.session.get(
            BASE_URL + "/oauth2/@me",
            headers={
                "Content-Type": "application/json",
                "Authorization": f"Bearer {token}",
            },
        ) as r:
            resp = await r.json()

        if "error" in resp:
            await abort(400)

        return resp

    async def refresh_token(self, headers):
        token = headers.get("Authorization")
        if not token:
            abort(401)

        token = await decrypt_token(token)
        discord_token = await self.get_discord_token(
            token["refresh_token"], refresh=True
        )

        expiry = datetime.datetime.utcnow().timestamp() + discord_token["expires_in"]
        token = encrypt_token(discord_token, token["user_id"], expiry)

        return json.dumps({"token": token, "expires_at": expiry})

    async def get_discord_token(self, code, refresh=False):
        async with self.session.post(
            BASE_URL + "/oauth2/token",
            data={
                "client_id": CLIENT_ID,
                "client_secret": CLIENT_SECRET,
                "grant_type": "refresh_token" if refresh else "authorization_code",
                "refresh_token" if refresh else "code": code,
                "redirect_uri": REDIRECT_URI,
                "scope": "identify",
            },
        ) as r:
            token = await r.json()

        if "error" in token:
            await abort(400)

        return token

    async def callback(self, request):
        values = await request.values
        if values.get("error", None):
            await abort(400)

        code = values.get("code", None)
        if not code:
            await abort(400)

        token = await self.get_discord_token(code)

        expiry = datetime.datetime.utcnow().timestamp() + token["expires_in"]

        user = await self.get_discord_user_info(
            token["access_token"],
        )

        user_token = encrypt_token(token, int(user["user"]["id"]))

        return f"""<script>
    localStorage.setItem("token", "{user_token}");
    localStorage.setItem("expires_at", "{expiry}");
    window.location.replace("{url_for(".index")}");    
    </script>"""


def check_user_permissions(user_id, guild, channel=None):
    if not (user_id and guild):
        return False

    member = guild.get_member(user_id)
    if not member:
        return False

    if not WHITELIST_ROLE_ID in [r.id for r in member.roles]:
        return False

    if channel and (not channel.permissions_for(member).read_messages):
        return False

    return True


def encrypt_token(token, user_id, expiry=None):
    token["user_id"] = user_id
    if not token.get("expires_at"):
        token["expires_at"] = (
            expiry
            if expiry
            else datetime.datetime.utcnow().timestamp() + token["expires_in"]
        )

    return jwt.encode(
        {
            i: token[i]
            for i in [
                "access_token",
                "expires_at",
                "refresh_token",
                "scope",
                "user_id",
            ]
            if i in token
        },
        JWT_KEY,
        algorithm="HS256",
    )


def _decrypt_token(token):
    return jwt.decode(token, JWT_KEY, algorithms=["HS256"])


async def decrypt_token(token):
    try:
        token = _decrypt_token(token)
    except:
        await abort(401)
    return token
