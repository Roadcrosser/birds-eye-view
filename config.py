import yaml

try:
    from yaml import CLoader as Loader
except ImportError:
    from yaml import Loader

with open("config.yml", encoding="utf-8") as o:
    config = yaml.load(o.read(), Loader=Loader)

TOKEN = config["TOKEN"]
JWT_KEY = config["JWT_KEY"]

ACTIVE_GUILD_ID = config["ACTIVE_GUILD_ID"]
MONITOR_CHANNEL_IDS = config["MONITOR_CHANNEL_IDS"]
SHORTCUT_CHANNEL_IDS = config["SHORTCUT_CHANNEL_IDS"]

WHITELIST_ROLE_ID = config["WHITELIST_ROLE_ID"]

CLIENT_ID = config["CLIENT_ID"]
CLIENT_SECRET = config["CLIENT_SECRET"]
REDIRECT_URI = config["REDIRECT_URI"]
