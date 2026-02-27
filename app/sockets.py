from flask_login import current_user
from flask_socketio import emit, join_room

from . import repository


def _chat_room(chat_id):
    return f"conversation_{chat_id}"


def _parse_room_to_chat_id(room_name):
    value = str(room_name or "").strip()
    if not value.startswith("conversation_"):
        return None
    suffix = value.replace("conversation_", "", 1)
    if not suffix.isdigit():
        return None
    return int(suffix)


def register_socket_events(socketio):
    @socketio.on("connect")
    def on_connect():
        if not current_user.is_authenticated:
            return False
        repository.set_user_online(int(current_user.get_id()), True)

    @socketio.on("disconnect")
    def on_disconnect():
        if not current_user.is_authenticated:
            return
        user_id = int(current_user.get_id())
        repository.set_user_online(user_id, False)
        repository.touch_last_seen(user_id)

    @socketio.on("join_chat")
    def on_join_chat(data):
        if not current_user.is_authenticated:
            return

        payload = data or {}
        room = payload.get("room")
        chat_id_raw = payload.get("chat_id")
        chat_id = _parse_room_to_chat_id(room)
        if chat_id is None:
            try:
                chat_id = int(chat_id_raw)
            except (TypeError, ValueError):
                return

        if not repository.user_in_chat(int(current_user.get_id()), chat_id):
            return

        join_room(room or _chat_room(chat_id))

    @socketio.on("send_message")
    def on_send_message(data):
        if not current_user.is_authenticated:
            return

        payload = data or {}
        room = payload.get("room")
        chat_id_raw = payload.get("chat_id")
        body = str(payload.get("body", payload.get("message", ""))).strip()

        chat_id = _parse_room_to_chat_id(room)
        if chat_id is None:
            try:
                chat_id = int(chat_id_raw)
            except (TypeError, ValueError):
                return

        if not body:
            return

        sender_id = int(current_user.get_id())
        if not repository.user_in_chat(sender_id, chat_id):
            return

        members = repository.get_chat_member_ids(chat_id)
        if len(members) == 2:
            peer_id = members[0] if members[1] == sender_id else members[1]
            if not repository.are_friends(sender_id, peer_id):
                return

        message_id = repository.create_message(chat_id, sender_id, body)
        message = repository.get_message_by_id(message_id)
        if not message:
            return

        target_room = room or _chat_room(chat_id)
        emit("new_message", message, room=target_room)
        # Compatibility event name, matching common examples.
        emit("receive_message", message, room=target_room)
