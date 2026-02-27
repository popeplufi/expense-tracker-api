import os

bind = f"0.0.0.0:{os.getenv('PORT', '8000')}"
# Socket.IO/WebSockets are run with a single gthread worker.
workers = int(os.getenv("WEB_CONCURRENCY", "1"))
threads = int(os.getenv("GUNICORN_THREADS", "2"))
timeout = int(os.getenv("GUNICORN_TIMEOUT", "120"))
