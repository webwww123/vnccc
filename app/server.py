import os
import socket
from datetime import datetime, timedelta

from flask import Flask, redirect, render_template, request, session, url_for
from flask_sqlalchemy import SQLAlchemy
from flask_socketio import SocketIO, emit
import docker

app = Flask(__name__)
app.config['SECRET_KEY'] = 'secret'
app.config['SQLALCHEMY_DATABASE_URI'] = 'sqlite:///data.db'
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False

socketio = SocketIO(app)
db = SQLAlchemy(app)
client = docker.from_env()

MAX_USERS = 50
IMAGE = "dorowu/ubuntu-desktop-lxde-vnc:latest"
INACTIVE_TIMEOUT = 600  # seconds

class User(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    username = db.Column(db.String(80), unique=True, nullable=False)
    password = db.Column(db.String(128), nullable=False)

class Session(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('user.id'))
    container_id = db.Column(db.String(64))
    port = db.Column(db.Integer)
    last_active = db.Column(db.DateTime, default=datetime.utcnow)


def get_free_port():
    s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    s.bind(('', 0))
    port = s.getsockname()[1]
    s.close()
    return port


def start_container(user):
    port = get_free_port()
    container = client.containers.run(
        IMAGE,
        detach=True,
        ports={'6080/tcp': port}
    )
    sess = Session(user_id=user.id, container_id=container.id, port=port)
    db.session.add(sess)
    db.session.commit()
    return sess


def cleanup_inactive():
    now = datetime.utcnow()
    for sess in Session.query.all():
        if now - sess.last_active > timedelta(seconds=INACTIVE_TIMEOUT):
            try:
                container = client.containers.get(sess.container_id)
                container.remove(force=True)
            except docker.errors.NotFound:
                pass
            db.session.delete(sess)
    db.session.commit()


@app.route('/', methods=['GET'])
def index():
    if 'user_id' not in session:
        return redirect(url_for('login'))
    cleanup_inactive()
    user = User.query.get(session['user_id'])
    sess = Session.query.filter_by(user_id=user.id).first()
    if not sess and Session.query.count() < MAX_USERS:
        sess = start_container(user)
    sessions = Session.query.all()[:6]
    return render_template('index.html', sessions=sessions, self_id=user.id)


@app.route('/register', methods=['GET', 'POST'])
def register():
    if request.method == 'POST':
        username = request.form['username']
        password = request.form['password']
        if User.query.filter_by(username=username).first():
            return 'User exists', 400
        user = User(username=username, password=password)
        db.session.add(user)
        db.session.commit()
        session['user_id'] = user.id
        return redirect(url_for('index'))
    return render_template('register.html')


@app.route('/login', methods=['GET', 'POST'])
def login():
    if request.method == 'POST':
        username = request.form['username']
        password = request.form['password']
        user = User.query.filter_by(username=username, password=password).first()
        if not user:
            return 'Invalid credentials', 400
        session['user_id'] = user.id
        return redirect(url_for('index'))
    return render_template('login.html')


@app.route('/logout')
def logout():
    session.clear()
    return redirect(url_for('login'))


@socketio.on('chat')
def handle_chat(msg):
    emit('chat', msg, broadcast=True)


def init_db():
    db.create_all()


if __name__ == '__main__':
    init_db()
    socketio.run(app, host='0.0.0.0', port=5000)
