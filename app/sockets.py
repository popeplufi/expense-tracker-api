import time
from collections import defaultdict, deque

from flask import current_app
from flask_login import current_user
from flask_socketio import emit, join_room

from .ai_bot import generate_ai_reply
from .push import send_web_push
from . import repository

_MESSAGE_RATE_WINDOW_SECONDS = 5
_MESSAGE_RATE_MAX_EVENTS = 8
_MESSAGE_RATE_TRACKER = defaultdict(deque)


def _chat_room(chat_id):
    return f"conversation_{chat_id}"


def _user_room(user_id):
    return f"user_{user_id}"


def _parse_room_to_chat_id(room_name):
    value = str(room_name or "").strip()
    if not value.startswith("conversation_"):
        return None
    suffix = value.replace("conversation_", "", 1)
    if not suffix.isdigit():
        return None
    return int(suffix)


def _extract_chat_id(payload):
    room = (payload or {}).get("room")
    chat_id = _parse_room_to_chat_id(room)
    if chat_id is not None:
        return chat_id, room
    try:
        return int((payload or {}).get("chat_id")), room
    except (TypeError, ValueError):
        return None, room


def _ai_bot_enabled():
    return str(current_app.config.get("AI_BOT_ENABLED", "1")).strip() == "1"


def _get_ai_bot_user():
    username = str(current_app.config.get("AI_BOT_USERNAME", "plufi_ai")).strip() or "plufi_ai"
    return repository.get_user_by_username(username)


def _emit_unread_summary(user_id):
    summary = repository.unread_summary_for_user(int(user_id))
    emit("unread_summary", summary, room=_user_room(int(user_id)))


def _can_send_message_now(user_id):
    now = time.time()
    queue = _MESSAGE_RATE_TRACKER[int(user_id)]
    while queue and (now - queue[0]) > _MESSAGE_RATE_WINDOW_SECONDS:
        queue.popleft()
    if len(queue) >= _MESSAGE_RATE_MAX_EVENTS:
        return False
    queue.append(now)
    return True


def register_socket_events(socketio):
    @socketio.on("connect")
    def on_connect():
        if not current_user.is_authenticated:
            return False
        user_id = int(current_user.get_id())
        join_room(_user_room(user_id))
        repository.set_user_online(user_id, True)
        _emit_unread_summary(user_id)

    @socketio.on("disconnect")
    def on_disconnect():
        if not current_user.is_authenticated:
            return
        user_id = int(current_user.get_id())
        _MESSAGE_RATE_TRACKER.pop(user_id, None)
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

    @socketio.on("typing_start")
    def on_typing_start(data):
        if not current_user.is_authenticated:
            return
        payload = data or {}
        chat_id, room = _extract_chat_id(payload)
        if chat_id is None:
            return
        sender_id = int(current_user.get_id())
        if not repository.user_in_chat(sender_id, chat_id):
            return
        emit(
            "typing_start",
            {
                "chat_id": chat_id,
                "user_id": sender_id,
                "username": getattr(current_user, "username", ""),
            },
            room=room or _chat_room(chat_id),
            include_self=False,
        )

    @socketio.on("typing_stop")
    def on_typing_stop(data):
        if not current_user.is_authenticated:
            return
        payload = data or {}
        chat_id, room = _extract_chat_id(payload)
        if chat_id is None:
            return
        sender_id = int(current_user.get_id())
        if not repository.user_in_chat(sender_id, chat_id):
            return
        emit(
            "typing_stop",
            {
                "chat_id": chat_id,
                "user_id": sender_id,
                "username": getattr(current_user, "username", ""),
            },
            room=room or _chat_room(chat_id),
            include_self=False,
        )

    @socketio.on("send_message")
    def on_send_message(data):
        if not current_user.is_authenticated:
            return

        payload = data or {}
        client_msg_id = str(payload.get("client_msg_id", "")).strip() or None
        body = str(payload.get("body", payload.get("message", ""))).strip()

        chat_id, room = _extract_chat_id(payload)
        if chat_id is None:
            emit("socket_error", {"code": "invalid_chat", "message": "Invalid chat selected."})
            return

        if not body:
            emit("socket_error", {"code": "empty_message", "message": "Message body is required."})
            return

        sender_id = int(current_user.get_id())
        if not repository.user_in_chat(sender_id, chat_id):
            emit("socket_error", {"code": "forbidden", "message": "You are not in this chat."})
            return
        if not _can_send_message_now(sender_id):
            emit(
                "socket_error",
                {
                    "code": "rate_limited",
                    "message": "Too many messages too quickly. Please slow down.",
                },
            )
            return

        members = repository.get_chat_member_ids(chat_id)
        if len(members) == 2:
            peer_id = members[0] if members[1] == sender_id else members[1]
            if not repository.are_friends(sender_id, peer_id):
                emit("socket_error", {"code": "not_friends", "message": "Only friends can message each other."})
                return

        message_id = repository.create_message(chat_id, sender_id, body)
        message = repository.get_message_by_id(message_id)
        if not message:
            emit("socket_error", {"code": "send_failed", "message": "Unable to send message."})
            return

        target_room = room or _chat_room(chat_id)
        emit("message_sent", {"client_msg_id": client_msg_id, "message": message})
        emit("new_message", message, room=target_room, include_self=False)
        # Compatibility event name for older clients.
        emit("receive_message", message, room=target_room, include_self=False)

        receiver_ids = [member for member in members if int(member) != sender_id]
        for receiver_id in receiver_ids:
            socketio.emit(
                "unread_summary",
                repository.unread_summary_for_user(int(receiver_id)),
                room=_user_room(int(receiver_id)),
            )
        subscriptions = repository.list_push_subscriptions_for_users(receiver_ids)
        if subscriptions:
            payload = {
                "title": message.get("sender_username", "New message"),
                "body": message.get("body", ""),
                "chat_id": chat_id,
                "url": f"/?chat={chat_id}",
            }
            for item in subscriptions:
                ok, reason = send_web_push(item, payload)
                if not ok and reason == "gone":
                    repository.delete_push_subscription_by_endpoint(
                        int(item["user_id"]), item["endpoint"]
                    )
                elif not ok and reason not in {"not_configured", "invalid_subscription"}:
                    current_app.logger.info("Push not delivered for subscription %s", item.get("id"))

        # AI bot auto-reply for direct chat with bot account.
        if _ai_bot_enabled():
            bot_user = _get_ai_bot_user()
            if bot_user and int(sender_id) != int(bot_user["id"]) and int(bot_user["id"]) in {
                int(member) for member in members
            }:
                history = repository.list_chat_messages(chat_id, limit=16)
                bot_text = generate_ai_reply(
                    body,
                    current_app.config,
                    history=history,
                    user_name=getattr(current_user, "username", ""),
                )
                if bot_text:
                    bot_message_id = repository.create_message(chat_id, int(bot_user["id"]), bot_text)
                    bot_message = repository.get_message_by_id(bot_message_id)
                    if bot_message:
                        emit("new_message", bot_message, room=target_room)
                        emit("receive_message", bot_message, room=target_room)
                        socketio.emit(
                            "unread_summary",
                            repository.unread_summary_for_user(sender_id),
                            room=_user_room(sender_id),
                        )

    @socketio.on("mark_seen")
    def on_mark_seen(data):
        if not current_user.is_authenticated:
            return
        payload = data or {}
        chat_id, room = _extract_chat_id(payload)
        if chat_id is None:
            return
        viewer_id = int(current_user.get_id())
        if not repository.user_in_chat(viewer_id, chat_id):
            return
        message_ids = repository.mark_messages_seen(chat_id, viewer_id)
        if not message_ids:
            return
        emit(
            "messages_seen",
            {"chat_id": chat_id, "message_ids": message_ids, "seen_by": viewer_id},
            room=room or _chat_room(chat_id),
        )
        _emit_unread_summary(viewer_id)

    @socketio.on("call_offer")
    def on_call_offer(data):
        if not current_user.is_authenticated:
            return
        payload = data or {}
        chat_id, room = _extract_chat_id(payload)
        if chat_id is None:
            return
        sender_id = int(current_user.get_id())
        if not repository.user_in_chat(sender_id, chat_id):
            return
        emit(
            "call_offer",
            {
                "chat_id": chat_id,
                "sender_id": sender_id,
                "sender_username": getattr(current_user, "username", ""),
                "offer": payload.get("offer"),
                "call_type": str(payload.get("call_type") or "audio"),
            },
            room=room or _chat_room(chat_id),
            include_self=False,
        )

    @socketio.on("call_answer")
    def on_call_answer(data):
        if not current_user.is_authenticated:
            return
        payload = data or {}
        chat_id, room = _extract_chat_id(payload)
        if chat_id is None:
            return
        sender_id = int(current_user.get_id())
        if not repository.user_in_chat(sender_id, chat_id):
            return
        emit(
            "call_answer",
            {
                "chat_id": chat_id,
                "sender_id": sender_id,
                "sender_username": getattr(current_user, "username", ""),
                "answer": payload.get("answer"),
            },
            room=room or _chat_room(chat_id),
            include_self=False,
        )

    @socketio.on("call_ice_candidate")
    def on_call_ice_candidate(data):
        if not current_user.is_authenticated:
            return
        payload = data or {}
        chat_id, room = _extract_chat_id(payload)
        if chat_id is None:
            return
        sender_id = int(current_user.get_id())
        if not repository.user_in_chat(sender_id, chat_id):
            return
        emit(
            "call_ice_candidate",
            {
                "chat_id": chat_id,
                "sender_id": sender_id,
                "candidate": payload.get("candidate"),
            },
            room=room or _chat_room(chat_id),
            include_self=False,
        )

    @socketio.on("call_end")
    def on_call_end(data):
        if not current_user.is_authenticated:
            return
        payload = data or {}
        chat_id, room = _extract_chat_id(payload)
        if chat_id is None:
            return
        sender_id = int(current_user.get_id())
        if not repository.user_in_chat(sender_id, chat_id):
            return
        emit(
            "call_end",
            {
                "chat_id": chat_id,
                "sender_id": sender_id,
                "sender_username": getattr(current_user, "username", ""),
            },
            room=room or _chat_room(chat_id),
            include_self=False,
        )
