# Network Study Room Prototype

This repository contains a minimal prototype for a "network study room".
Users can register, log in and receive their own ephemeral desktop container.
Other users' desktops are shown in read-only iframes.
A simple chat is available on the home page.

## Features

- Registration and login stored in a local SQLite database.
- Each logged in user receives a Docker container based on
  `dorowu/ubuntu-desktop-lxde-vnc:latest` exposing a noVNC interface.
- Up to 50 active containers are allowed. Inactive containers are removed
  after 10 minutes.
- Home page lists all active desktops in a scrollable grid. Your own desktop is
  interactive while others are view-only.
- Chat implemented with Socket.IO.
- Messages in chat display the sender's username.
- Remaining capacity and connection status displayed.
- Buttons to extend time or delete your container.
- Background task cleans up inactive containers every minute.
- Passwords stored using Werkzeug hashing.
- Containers run with configurable memory and CPU limits.
- Remaining time, online status and a fullscreen link shown for each desktop.

## Running

```bash
pip install -r requirements.txt
python app/server.py
```

Environment variables can be used to configure the Docker image, resource limits
and other options:

```
DESKTOP_IMAGE=your/image:tag \
DESKTOP_MEM=512m \
DESKTOP_CPUS=0.5 \
MAX_USERS=20 \
INACTIVE_TIMEOUT=300 \
SECRET_KEY=mysecret \
python app/server.py
```

Open `http://localhost:5000` in your browser.

This is only a proof of concept. Security and resource isolation need
improvements before production use.
