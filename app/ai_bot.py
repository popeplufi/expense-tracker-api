import json
import urllib.error
import urllib.request


def _fallback_reply(text, history=None):
    value = (text or "").strip()
    lowered = value.lower()
    recent = history[-3:] if history else []
    if any(word in lowered for word in ("hello", "hi", "hey")):
        return "Hey. I am your AI assistant in Plufi Chat. Ask me anything."
    if "help" in lowered:
        return (
            "I can help with ideas, writing, coding, budgeting plans, and quick answers. "
            "Try asking me to summarize, rewrite, plan, or explain."
        )
    if "budget" in lowered:
        return "A simple rule to start: 50% needs, 30% wants, 20% savings/debt payoff."
    if "summarize" in lowered and recent:
        sample = " | ".join((item.get("body") or "").strip() for item in recent if item.get("body"))
        sample = sample[:220] if sample else "No recent content."
        return f"Recent chat summary: {sample}"
    if not value:
        return "Send a message and I will respond."
    return f"I received: \"{value}\". Tell me what you want me to do with it."


def _build_input_messages(system_prompt, user_message, history, bot_username):
    messages = [{"role": "system", "content": [{"type": "input_text", "text": system_prompt}]}]
    for item in history[-12:]:
        sender = str(item.get("sender_username", "")).strip().lower()
        role = "assistant" if sender == bot_username.lower() else "user"
        body = str(item.get("body", "")).strip()
        if not body:
            continue
        messages.append({"role": role, "content": [{"type": "input_text", "text": body}]})
    messages.append(
        {"role": "user", "content": [{"type": "input_text", "text": str(user_message or "")}]}
    )
    return messages


def generate_ai_reply(user_message, config, history=None, user_name=None):
    history = history or []
    api_key = str(config.get("OPENAI_API_KEY", "")).strip()
    if not api_key:
        return _fallback_reply(user_message, history=history)

    base_system_prompt = str(
        config.get(
            "AI_BOT_SYSTEM_PROMPT",
            "You are a concise, helpful assistant inside a chat app.",
        )
    ).strip()
    if user_name:
        system_prompt = (
            f"{base_system_prompt}\n"
            f"User display name: {user_name}.\n"
            "Keep replies practical, clear, and short unless user asks for detail."
        )
    else:
        system_prompt = base_system_prompt
    model = str(config.get("AI_BOT_MODEL", "gpt-4o-mini")).strip() or "gpt-4o-mini"
    bot_username = str(config.get("AI_BOT_USERNAME", "plufi_ai")).strip() or "plufi_ai"

    payload = {
        "model": model,
        "input": _build_input_messages(system_prompt, user_message, history, bot_username),
    }
    req = urllib.request.Request(
        "https://api.openai.com/v1/responses",
        data=json.dumps(payload).encode("utf-8"),
        headers={
            "Content-Type": "application/json",
            "Authorization": f"Bearer {api_key}",
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=12) as response:
            body = json.loads(response.read().decode("utf-8"))
            text = body.get("output_text")
            if text:
                return str(text).strip()
    except (urllib.error.URLError, urllib.error.HTTPError, TimeoutError, json.JSONDecodeError):
        pass
    return _fallback_reply(user_message, history=history)
