"""
This module takes care of starting the API Server, Loading the DB and Adding the endpoints
"""
from flask import Flask, request, jsonify, url_for, Blueprint
from api.models import db, User, Emotion, EmotionCheckin, Activity, ActivityCompletion, DailySession
from api.utils import generate_sitemap, APIException
from flask_cors import CORS
from datetime import datetime
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


####### GET Y DELETE Users

### GET Users
@api.route("/users", methods=["GET"])
def get_emotions():
    users = User.query.all()
    return jsonify([u.serialize() for u in users])


### DELETE Users

@api.route("/users/<int:user_id>", methods=["DELETE"])
def delete_user(user_id):
    user_id = get_jwt_identity()
    user = User.query.get(user_id)

    db.session.delete(user)
    db.session.commit()
    user_deleted = {"msg": "User deleted"}

    return jsonify(user_deleted), 200

###### DAILY SESSION 

@api.route("/sessions/<int:session_id>", methods=["POST"])
@jwt_required()
def get_or_create_session():
    request_data = request.json
    user_id = get_jwt_identity()
    user = User.query.get(user_id)
    session_type = request_data["session_type"]
    today = datetime.today()

    daily_session = DailySession.query.filter_by(
        user_id=user,
        session_date=today,
        session_type=session_type
    ).first()

    if not daily_session:
        daily_session = DailySession(
            user_id=user,
            session_date=today,
            session_type=session_type
        )
        db.session.add(daily_session)
        db.session.commit()

    return jsonify(daily_session.serialize())


###### Emotions y Checkins

### GET Emotions

@api.route("/emotions", methods=["GET"])
def get_emotions():
    emotions = Emotion.query.all()
    return jsonify([e.serialize() for e in emotions])

### GET User Emotion

@api.route("/users/<int:user_id>/emotions", methods=["GET"])
def get_user_emotions():
    request_data = request.json
    user_id = get_jwt_identity()
    user = User.query.get(user_id)
    
    emotions = EmotionCheckin(
        user_id=user,
        emotion_id=request_data["emotion_id"],
        description=request_data.get("description")
    )

    user_emotions = [e.serialize() for e in emotions]

    return jsonify(user_emotions)


### POST Emotions Checkin

@api.route("/sessions/<int:session_id>/emotions-checkin", methods=["POST"])
def create_emotions_checkin(daily_session_id):
    request_data = request.json

    checkin = EmotionCheckin(
        daily_session_id=daily_session_id,
        emotion_id=request_data["emotion_id"],
        note=request_data.get("note")
    )

    db.session.add(checkin)
    db.session.commit()

    return jsonify({
        "msg": "emotion checkin created",
        "checkin": checkin.serialize()
    }), 201

### GET MUSIC

DEFAULT_TRACK = "https://soundcloud.com/clubfuriess/default-track"

@api.route("/sessions/<int:session_id>/emotion-music", methods=["GET"])
def get_session_emotion_music(daily_session_id):
    checkin = (
        EmotionCheckin.query.filter_by(daily_session_id=daily_session_id)
        .order_by(EmotionCheckin.created_at.desc())
        .first()
    )

    if not checkin or not checkin.emotion:
        return jsonify({
            "emotion": None,
            "url_music": DEFAULT_TRACK
        }), 200

    return jsonify({
        "emotion": checkin.emotion.name,
        "url_music": checkin.emotion.url_music or DEFAULT_TRACK
    }), 200


###### Activity y Completions

### GET Activities 

@api.route("/activities", methods=["GET"])
def get_activities():
    activities = Activity.query.all()
    return jsonify([a.serialize() for a in activities])


### POST Completion

@api.route("/sessions/<int:session_id>/activity-completed", methods=["POST"])
def complete_activity(daily_session_id):
    request_data = request.json

    activity_completed = ActivityCompletion(
        daily_session_id=daily_session_id,
        activity_id=request_data["activity_id"],
        points_awarded=request_data.get("points_awarded", 0)
    )

    db.session.add(activity_completed)
    db.session.commit()

    return jsonify({
        "msg": "activity completed",
        "completion": activity_completed.serialize()
    }), 201


### GET Activities Completed

@api.route("/sessions/<int:session_id>/activity-completions", methods=["GET"])
def get_activity_completions(daily_session_id):
    activities_completed = ActivityCompletion.query.filter_by(daily_session_id=daily_session_id).all()
    return jsonify([ac.serialize() for ac in activities_completed])