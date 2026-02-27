import json

from flask import current_app

try:
    from pywebpush import WebPushException, webpush
except Exception:  # pragma: no cover - optional runtime dependency guard
    WebPushException = Exception
    webpush = None


def is_push_dependency_available():
    return webpush is not None


def is_push_configured():
    return bool(
        is_push_dependency_available()
        and current_app.config.get("VAPID_CLAIMS_SUB")
        and current_app.config.get("VAPID_CLAIMS_SUB").startswith("mailto:")
        and current_app.config.get("VAPID_PUBLIC_KEY")
        and current_app.config.get("VAPID_PRIVATE_KEY")
    )


def send_web_push(subscription, payload):
    if not is_push_configured():
        return False, "not_configured"

    endpoint = subscription.get("endpoint")
    p256dh = subscription.get("p256dh")
    auth = subscription.get("auth")
    if not endpoint or not p256dh or not auth:
        return False, "invalid_subscription"

    private_key = current_app.config.get("VAPID_PRIVATE_KEY")
    if not private_key:
        return False, "not_configured"

    try:
        webpush(
            subscription_info={
                "endpoint": endpoint,
                "keys": {"p256dh": p256dh, "auth": auth},
            },
            data=json.dumps(payload),
            vapid_private_key=private_key,
            vapid_claims={"sub": current_app.config.get("VAPID_CLAIMS_SUB", "mailto:admin@example.com")},
            ttl=60,
        )
        return True, None
    except WebPushException as exc:
        status_code = getattr(getattr(exc, "response", None), "status_code", None)
        if status_code in (404, 410):
            return False, "gone"
        current_app.logger.warning("Web push failed: %s", exc)
        return False, "failed"
    except Exception as exc:
        current_app.logger.warning("Unexpected web push failure: %s", exc)
        return False, "failed"
