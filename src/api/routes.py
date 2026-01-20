"""
This module takes care of starting the API Server, Loading the DB and Adding the endpoints
"""
from flask import Flask, request, jsonify, url_for, Blueprint
from api.models import db, User, DailySession, ActivityCompletion, EmotionCheckin
from api.utils import generate_sitemap, APIException
from flask_cors import CORS
from datetime import datetime ,timedelta
from flask_jwt_extended import create_access_token, jwt_required, get_jwt_identity

api = Blueprint('api', __name__)

# Allow CORS requests to this API
CORS(api)


@api.route('/hello', methods=['POST', 'GET'])
def handle_hello():

    response_body = {
        "message": "Hello! I'm a message that came from the backend, check the network tab on the google inspector and you will see the GET request"
    }

    return jsonify(response_body), 200

@api.route('/register', methods=['POST'])
def register():
    body = request.get_json()

    email = (body.get("email") or "").strip().lower()
    username = (body.get("username") or "").strip()
    password = body.get("password") or ""
    timezone = (body.get("timezone") or "UTC").strip()

    # Validaciones basicas
    if not email or not username or not password:
        return jsonify({"msg": "email, username y password son obligatorios"}), 400

    # Evitar duplicados
    if User.query.filter_by(email=email).first():
        return jsonify({"msg": "Ese email ya está registrado"}), 409

    if User.query.filter_by(username=username).first():
        return jsonify({"msg": "Ese username ya está registrado"}), 409

    # Crear usuario
    user = User(
        email=email,
        username=username,
        timezone=timezone,
        created_at=datetime.utcnow(),
    )

    user.set_password(password)

    db.session.add(user)
    db.session.commit()

    # TODO: Aquí luego llamas a Loops.so para welcome email
    # loops_service.send_welcome_email(user.email, user.username)
    # user.welcome_email_sent_at = datetime.utcnow()
    # db.session.commit()

    return jsonify({
        "msg": "Usuario creado",
        "user": user.serialize()
    }), 201

@api.route('/login', methods=['POST'])
def login():
    body = request.get_json(silent=True) or {}

    email = (body.get("email") or "").strip().lower()
    password = body.get("password") or ""
    remember_me = body.get("remember_me", False)

    if not email or not password:
        return jsonify({"msg": "email y password son obligatorios"}), 400

    user = User.query.filter_by(email=email).first()
    if not user or not user.check_password(password):
        return jsonify({"msg": "Credenciales inválidas"}), 401


    # actualiza last_login_at
    user.last_login_at = datetime.utcnow()
    db.session.commit()

    if remember_me:
        expires = timedelta(days=30)
    else:
        expires = timedelta(hours=24)

    # crea token
    access_token = create_access_token(identity=str(user.id),expires_delta=expires)

    return jsonify({
        "access_token": access_token,
        "user": user.serialize()
    }), 200

@api.route("/mirror/today", methods=["GET"])
@jwt_required()
def mirror_today():
    user_id = get_jwt_identity()
    user = User.query.get(user_id)

    if not user:
        return jsonify({"msg": "Usuario no encontrado"}), 404

    today = datetime.utcnow().date()

    # buscar cualquier sesión de hoy (day o night)
    session = DailySession.query.filter_by(
        user_id=user.id,
        session_date=today
    ).first()

    # 🟡 Caso: no hay sesión hoy
    if not session:
        return jsonify({
            "date": today.isoformat(),
            "session_type": None,
            "points_today": 0,
            "activities": [],
            "emotion": None,
            "message": "Aún no has registrado actividades ni emociones hoy"
        }), 200

    # actividades
    completions = ActivityCompletion.query.filter_by(
        daily_session_id=session.id
    ).all()

    activities = []
    for c in completions:
        activities.append({
            "id": c.activity.id,
            "name": c.activity.name,
            "points": c.points_awarded
        })

    # emoción principal (última registrada)
    emotion_checkin = (
        EmotionCheckin.query
        .filter_by(daily_session_id=session.id)
        .order_by(EmotionCheckin.created_at.desc())
        .first()
    )

    emotion = None
    if emotion_checkin:
        emotion = {
            "name": emotion_checkin.emotion.name,
            "intensity": emotion_checkin.intensity
        }

    return jsonify({
        "date": today.isoformat(),
        "session_type": session.session_type.value,
        "points_today": session.points_earned,
        "activities": activities,
        "emotion": emotion
    }), 200