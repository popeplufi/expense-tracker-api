from flask_login import UserMixin


class SessionUser(UserMixin):
    def __init__(self, user_id, username):
        self.id = int(user_id)
        self.username = username

    def get_id(self):
        return str(self.id)
