from app import create_app

app = create_app()


if __name__ == "__main__":
    import os
    from app import socketio

    socketio.run(
        app,
        host="0.0.0.0",
        port=int(os.environ.get("PORT", "5000")),
        debug=os.environ.get("FLASK_DEBUG") == "1",
    )
