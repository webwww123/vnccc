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
- Home page displays up to six desktops simultaneously (the current user and
  others in view-only mode).
- Chat implemented with Socket.IO.

## Running

```bash
pip install -r requirements.txt
python app/server.py
```

Open `http://localhost:5000` in your browser.

This is only a proof of concept. Security aspects such as password hashing and
resource isolation need to be improved for production use.
