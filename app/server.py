import os
import socket
import threading
from datetime import datetime, timedelta

from flask import Flask, redirect, render_template, request, session as flask_session, url_for
from flask_sqlalchemy import SQLAlchemy
from flask_socketio import SocketIO, emit
from werkzeug.security import generate_password_hash, check_password_hash
import docker

app = Flask(__name__)
app.config['SECRET_KEY'] = 'secret'
app.config['SQLALCHEMY_DATABASE_URI'] = 'sqlite:///data.db'
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False

socketio = SocketIO(app)
db = SQLAlchemy(app)
client = docker.from_env()

MAX_USERS = 50
IMAGE = os.environ.get("DESKTOP_IMAGE", "dorowu/ubuntu-desktop-lxde-vnc:latest")
MEM_LIMIT = os.environ.get("DESKTOP_MEM", "512m")
CPU_LIMIT = float(os.environ.get("DESKTOP_CPUS", "0.5"))
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
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
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
        ports={'6080/tcp': port},
        mem_limit=MEM_LIMIT,
        nano_cpus=int(CPU_LIMIT * 1e9)
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


def cleanup_loop():
    while True:
        socketio.sleep(60)
        with app.app_context():
            cleanup_inactive()


@app.route('/extend')
def extend():
    if 'user_id' not in flask_session:
        return redirect(url_for('login'))
    sess = Session.query.filter_by(user_id=flask_session['user_id']).first()
    if sess:
        sess.last_active = datetime.utcnow()
        db.session.commit()
    return redirect(url_for('index'))


@app.route('/delete')
def delete():
    if 'user_id' not in flask_session:
        return redirect(url_for('login'))
    sess = Session.query.filter_by(user_id=flask_session['user_id']).first()
    if sess:
        try:
            container = client.containers.get(sess.container_id)
            container.remove(force=True)
        except docker.errors.NotFound:
            pass
        db.session.delete(sess)
        db.session.commit()
    return redirect(url_for('index'))


@app.route('/', methods=['GET'])
def index():
    if 'user_id' not in flask_session:
        return redirect(url_for('login'))
    cleanup_inactive()
    user = User.query.get(flask_session['user_id'])
    sess = Session.query.filter_by(user_id=user.id).first()
    if not sess and Session.query.count() < MAX_USERS:
        sess = start_container(user)
    remaining = MAX_USERS - Session.query.count()
    sessions = Session.query.all()
    sessions.sort(key=lambda s: 0 if s.user_id == user.id else 1)
    session_info = []
    now = datetime.utcnow()
    for s in sessions:
        remain = INACTIVE_TIMEOUT - int((now - s.last_active).total_seconds())
        view_only = s.user_id != user.id
        session_info.append({'session': s, 'remaining': max(0, remain), 'view_only': view_only})
    return render_template('index.html', sessions=session_info, self_id=user.id, remaining=remaining)


@app.route('/full/<int:sid>')
def full_view(sid):
    if 'user_id' not in flask_session:
        return redirect(url_for('login'))
    s = Session.query.get_or_404(sid)
    view_only = 'true' if s.user_id != flask_session['user_id'] else 'false'
    return render_template('full.html', session=s, view_only=view_only)


@app.route('/register', methods=['GET', 'POST'])
def register():
    if request.method == 'POST':
        username = request.form['username']
        password = request.form['password']
        if User.query.filter_by(username=username).first():
            return 'User exists', 400
        user = User(username=username, password=generate_password_hash(password))
        db.session.add(user)
        db.session.commit()
        flask_session['user_id'] = user.id
        return redirect(url_for('index'))
    return render_template('register.html')


@app.route('/login', methods=['GET', 'POST'])
def login():
    if request.method == 'POST':
        username = request.form['username']
        password = request.form['password']
        user = User.query.filter_by(username=username).first()
        if user and not check_password_hash(user.password, password):
            user = None
        if not user:
            return 'Invalid credentials', 400
        flask_session['user_id'] = user.id
        return redirect(url_for('index'))
    return render_template('login.html')


@app.route('/logout')
def logout():
    flask_session.clear()
    return redirect(url_for('login'))


@socketio.on('chat')
def handle_chat(msg):
    emit('chat', msg, broadcast=True)


@socketio.on('ping')
def handle_ping():
    if 'user_id' in flask_session:
        sess = Session.query.filter_by(user_id=flask_session['user_id']).first()
        if sess:
            sess.last_active = datetime.utcnow()
            db.session.commit()


@socketio.on('connect')
def handle_connect():
    pass


@socketio.on('disconnect')
def handle_disconnect():
    pass


def init_db():
    db.create_all()


if __name__ == '__main__':
    init_db()
    socketio.start_background_task(cleanup_loop)
    socketio.run(app, host='0.0.0.0', port=5000)
