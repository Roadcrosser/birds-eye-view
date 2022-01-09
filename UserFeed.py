import datetime
from auth import _decrypt_token, check_user_permissions
from config import WHITELIST_ROLE_ID


class UserFeed:
    def __init__(self):
        self.user_id = None
        self.authenticated = False

    def authenticate(self, token, guild):
        if not self.authenticated:
            try:
                token = _decrypt_token(token)
            except:
                return

            user_id = token.get("user_id", None)

            if not check_user_permissions(user_id, guild):
                return

            if token.get("expires_in", 0) < datetime.datetime.utcnow().timestamp():
                self.user_id = user_id
                self.authenticated = True

        return
