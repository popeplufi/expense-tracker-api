import os

bind = f"0.0.0.0:{os.getenv('PORT', '8000')}"
# Socket.IO/WebSockets are most reliable with a single eventlet worker.
workers = int(os.getenv("WEB_CONCURRENCY", "1"))
threads = int(os.getenv("GUNICORN_THREADS", "1"))
timeout = int(os.getenv("GUNICORN_TIMEOUT", "120"))
