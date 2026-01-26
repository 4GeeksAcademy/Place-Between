import os
from flask import request, jsonify, Blueprint
from api.models import (
    db,
    User,
    DailySession,
    Activity,
    ActivityCompletion,
    Emotion,
    EmotionCheckin,
    SessionType,
    ActivityCategory,
    ActivityType,
    Goal,
    GoalProgress,
    DailySessionGoal,
    Reminder
)
from flask_cors import CORS
from datetime import datetime, timedelta, timezone
from flask_jwt_extended import create_access_token, jwt_required, get_jwt_identity

from api.services import send_email

api = Blueprint("api", __name__)
CORS(api)


def dev_only():
    # En tu app.py, FLASK_DEBUG=1 implica desarrollo :contentReference[oaicite:4]{index=4}
    return os.getenv("FLASK_DEBUG") == "1"


@api.route("/hello", methods=["POST", "GET"])
def handle_hello():
    return jsonify({
        "message": "Hello! I'm a message that came from the backend."
    }), 200


# -------------------------
# AUTH
# -------------------------

@api.route("/register", methods=["POST"])
def register():
    body = request.get_json(silent=True) or {}

    email = (body.get("email") or "").strip().lower()
    username = (body.get("username") or "").strip()
    password = body.get("password") or ""
    tz_str = (body.get("timezone") or "UTC").strip()

    if not email or not username or not password:
        return jsonify({"msg": "email, username y password son obligatorios"}), 400

    if User.query.filter_by(email=email).first():
        return jsonify({"msg": "Ese email ya está registrado"}), 409

    if User.query.filter_by(username=username).first():
        return jsonify({"msg": "Ese username ya está registrado"}), 409

    user = User(
        email=email,
        username=username,
        timezone=tz_str,
        created_at=datetime.now(timezone.utc),
    )
    user.set_password(password)

    db.session.add(user)
    db.session.commit()

    return jsonify({
        "msg": "Usuario creado",
        "user": user.serialize()
    }), 201


@api.route("/login", methods=["POST"])
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

    # Persist last_login_at
    user.last_login_at = datetime.now(timezone.utc)
    db.session.commit()

    expires = timedelta(days=30) if remember_me else timedelta(hours=24)
    access_token = create_access_token(
        identity=str(user.id), expires_delta=expires)

    return jsonify({
        "access_token": access_token,
        "user": user.serialize()
    }), 200


# -------------------------
# SESSIONS (MINIMAL, CLEAN)
# -------------------------
@api.route("/sessions", methods=["POST"])
@jwt_required()
def create_or_get_session():
    """
    Body:
      {
        "session_type": "day" | "night",
        "date": "YYYY-MM-DD" (optional, defaults to today UTC)
      }
    """
    body = request.get_json(silent=True) or {}

    session_type_raw = (body.get("session_type") or "").strip().lower()
    if session_type_raw not in ("day", "night"):
        return jsonify({"msg": "session_type debe ser 'day' o 'night'"}), 400

    date_raw = (body.get("date") or "").strip()
    if date_raw:
        try:
            session_date = datetime.strptime(date_raw, "%Y-%m-%d").date()
        except ValueError:
            return jsonify({"msg": "date debe tener formato YYYY-MM-DD"}), 400
    else:
        session_date = datetime.now(timezone.utc).date()

    user_id = get_jwt_identity()
    try:
        user_id_int = int(user_id)
    except Exception:
        return jsonify({"msg": "Token inválido (identity)"}), 401

    user = User.query.get(user_id_int)
    if not user:
        return jsonify({"msg": "Usuario no encontrado"}), 404

    st_enum = SessionType.day if session_type_raw == "day" else SessionType.night

    session = DailySession.query.filter_by(
        user_id=user.id,
        session_date=session_date,
        session_type=st_enum
    ).first()

    if not session:
        session = DailySession(
            user_id=user.id,
            session_date=session_date,
            session_type=st_enum
        )
        db.session.add(session)
        db.session.commit()

    return jsonify(session.serialize()), 200


# -------------------------
# MIRROR (STABLE)
# -------------------------
@api.route("/mirror/today", methods=["GET"])
@jwt_required()
def mirror_today():
    """
    Optional query:
      ?session_type=day|night   (if omitted, returns combined summary for today)
    """
    user_id = get_jwt_identity()
    try:
        user_id_int = int(user_id)
    except Exception:
        return jsonify({"msg": "Token inválido (identity)"}), 401

    user = User.query.get(user_id_int)
    if not user:
        return jsonify({"msg": "Usuario no encontrado"}), 404

    today = datetime.now(timezone.utc).date()
    session_type_q = (request.args.get("session_type") or "").strip().lower()

    sessions_q = DailySession.query.filter_by(
        user_id=user.id, session_date=today)

    if session_type_q in ("day", "night"):
        st_enum = SessionType.day if session_type_q == "day" else SessionType.night
        sessions = sessions_q.filter_by(session_type=st_enum).all()
    else:
        sessions = sessions_q.all()

    if not sessions:
        return jsonify({
            "date": today.isoformat(),
            "sessions": [],
            "points_today": 0,
            "activities": [],
            "emotion": None,
            "message": "Aún no has registrado actividades ni emociones hoy"
        }), 200

    # Aggregate across sessions
    points_today = sum(s.points_earned or 0 for s in sessions)

    # Activities across sessions (enriquecido + puntos por categoría)
    activities = []
    points_by_category = {}

    for s in sessions:
        completions = (
            ActivityCompletion.query
            .join(Activity, ActivityCompletion.activity_id == Activity.id)
            .join(ActivityCategory, Activity.category_id == ActivityCategory.id)
            .filter(ActivityCompletion.daily_session_id == s.id)
            .all()
        )

        for c in completions:
            cat_name = c.activity.category.name if c.activity and c.activity.category else "General"
            pts = int(c.points_awarded or 0)

            points_by_category[cat_name] = points_by_category.get(cat_name, 0) + pts

            activities.append({
                "id": c.activity.id,
                "external_id": c.activity.external_id,
                "name": c.activity.name,
                "category_name": cat_name,
                "points": pts,
                "session_type": s.session_type.value,
                "completed_at": c.completed_at.isoformat() + "Z"
            })


    # Orden cronológico (para sendero y lista)
    activities.sort(key=lambda x: x.get("completed_at") or "")
    

    # Latest emotion checkin across sessions
    latest_checkin = (
        EmotionCheckin.query
        .join(DailySession, EmotionCheckin.daily_session_id == DailySession.id)
        .filter(DailySession.user_id == user.id, DailySession.session_date == today)
        .order_by(EmotionCheckin.created_at.desc())
        .first()
    )

    emotion = None
    if latest_checkin and latest_checkin.emotion:
        emotion = {
            "name": latest_checkin.emotion.name,
            "value": latest_checkin.emotion.value,
            "intensity": latest_checkin.intensity,
            "note": latest_checkin.note,
            "created_at": latest_checkin.created_at.isoformat() + "Z"
        }

    return jsonify({
        "date": today.isoformat(),
        "sessions": [s.serialize() for s in sessions],
        "points_today": points_today,
        "points_by_category": points_by_category,
        "activities": activities,
        "emotion": emotion
    }), 200


# -------------------------
# READ-ONLY LISTS (safe)
# -------------------------
@api.route("/emotions", methods=["GET"])
#@jwt_required()
def get_all_emotions():
    emotions = Emotion.query.all()
    return jsonify([e.serialize() for e in emotions]), 200


@api.route("/activities", methods=["GET"])
#@jwt_required()
def get_all_activities():
    activities = Activity.query.filter_by(is_active=True).all()
    return jsonify([a.serialize() for a in activities]), 200


@api.route("/activities/complete", methods=["POST"])
@jwt_required()
def complete_activity():
    body = request.get_json(silent=True) or {}

    external_id = body.get("external_id")
    session_type = body.get("session_type")  # "day" | "night"
    is_recommended = body.get("is_recommended", False)

    if not external_id or session_type not in ("day", "night"):
        return jsonify({"msg": "Datos incompletos"}), 400

    user_id = int(get_jwt_identity())
    today = datetime.now(timezone.utc).date()

    user = User.query.get(user_id)
    if not user:
        return jsonify({"msg": "Usuario no encontrado"}), 404

    activity = Activity.query.filter_by(
        external_id=external_id,
        is_active=True
    ).first()

    if not activity:
        return jsonify({"msg": "Actividad no encontrada"}), 404

    st_enum = (
        SessionType.day if session_type == "day"
        else SessionType.night
    )

    session = DailySession.query.filter_by(
        user_id=user.id,
        session_date=today,
        session_type=st_enum
    ).first()

    if not session:
        session = DailySession(
            user_id=user.id,
            session_date=today,
            session_type=st_enum,
            points_earned=0
        )
        db.session.add(session)
        db.session.commit()

    # Idempotencia
    existing = ActivityCompletion.query.filter_by(
        daily_session_id=session.id,
        activity_id=activity.id
    ).first()

    if existing:
        return jsonify({
            "points_awarded": 0,
            "points_total": session.points_earned,
            "already_completed": True
        }), 200

    # Scoring FINAL
    source = body.get("source", "today")  # today | catalog

    if is_recommended:
        points = 20
    elif source == "catalog":
        points = 5
    else:
        points = 10

    completion = ActivityCompletion(
        daily_session_id=session.id,
        activity_id=activity.id,
        points_awarded=points
    )

    session.points_earned += points

    db.session.add(completion)
    db.session.commit()

    return jsonify({
        "points_awarded": points,
        "points_total": session.points_earned,
        "session_id": session.id,
        "activity_id": activity.external_id
    }), 201


@api.route("/mirror/week", methods=["GET"])
@jwt_required()
def mirror_week():
    user_id = int(get_jwt_identity())
    today = datetime.now(timezone.utc).date()

    start = today - timedelta(days=6)

    sessions = (
        DailySession.query
        .filter(
            DailySession.user_id == user_id,
            DailySession.session_date >= start,
            DailySession.session_date <= today
        )
        .all()
    )

    days = {}
    for i in range(7):
        d = start + timedelta(days=i)
        days[d.isoformat()] = {
            "date": d.isoformat(),
            "points": 0,
            "day": 0,
            "night": 0,
        }

    for s in sessions:
        key = s.session_date.isoformat()
        days[key]["points"] += s.points_earned or 0
        if s.session_type == SessionType.day:
            days[key]["day"] += s.points_earned or 0
        else:
            days[key]["night"] += s.points_earned or 0

    return jsonify(list(days.values())), 200


# -------------------------
# SEED-ACTIVITIES
# -------------------------

@api.route("/emotions/checkin", methods=["POST"])
@jwt_required()
def create_emotion_checkin():
    """
    Body:
      {
        "emotion_id": 1,
        "intensity": 1..10,
        "note": "texto opcional"
      }
    Guarda un check-in emocional ligado a la sesión NIGHT de hoy (UTC date).
    """
    body = request.get_json(silent=True) or {}

    emotion_id = body.get("emotion_id")
    intensity = body.get("intensity")
    note_text = (body.get("note") or "").strip()

    # Validaciones
    try:
        emotion_id = int(emotion_id)
    except Exception:
        return jsonify({"msg": "emotion_id inválido"}), 400

    try:
        intensity = int(intensity)
    except Exception:
        return jsonify({"msg": "intensity inválido"}), 400

    # Refuerzo de API (además del CheckConstraint en DB)
    if intensity < 1 or intensity > 10:
        return jsonify({"msg": "intensity debe estar entre 1 y 10"}), 400

    user_id = int(get_jwt_identity())
    today = datetime.now(timezone.utc).date()

    user = User.query.get(user_id)
    if not user:
        return jsonify({"msg": "Usuario no encontrado"}), 404

    emotion = Emotion.query.get(emotion_id)
    if not emotion:
        return jsonify({"msg": "Emoción no encontrada"}), 404

    # Crear o recuperar sesión NIGHT de hoy
    st_enum = SessionType.night
    session = DailySession.query.filter_by(
        user_id=user.id,
        session_date=today,
        session_type=st_enum
    ).first()

    if not session:
        session = DailySession(
            user_id=user.id,
            session_date=today,
            session_type=st_enum,
            points_earned=0
        )
        db.session.add(session)
        db.session.commit()

    checkin = EmotionCheckin(
        daily_session_id=session.id,
        emotion_id=emotion.id,
        intensity=intensity,
        note=note_text if note_text else None
    )

    db.session.add(checkin)
    db.session.commit()

    return jsonify({
        "msg": "Emotion check-in guardado",
        "checkin": checkin.serialize(),
        "emotion": emotion.serialize()
    }), 201


@api.route("/dev/seed/activities/bulk", methods=["POST"])
def dev_seed_activities_bulk():
    if not dev_only():
        return jsonify({"msg": "Not found"}), 404
    body = request.get_json(silent=True) or {}
    items = body.get("activities") or []
    if not isinstance(items, list) or not items:
        return jsonify({"msg": "activities debe ser una lista no vacía"}), 400

    # Cache categorías por nombre
    cat_cache = {}

    def get_or_create_category(name: str):
        name = (name or "General").strip()
        if name in cat_cache:
            return cat_cache[name]
        cat = ActivityCategory.query.filter_by(name=name).first()
        if not cat:
            cat = ActivityCategory(name=name, description=None)
            db.session.add(cat)
            db.session.commit()
        cat_cache[name] = cat
        return cat

    created = 0
    updated = 0
    skipped = 0

    for a in items:
        ext = (a.get("id") or "").strip()
        if not ext:
            skipped += 1
            continue

        branch = (a.get("branch") or "General").strip()
        category = get_or_create_category(branch)

        phase = (a.get("phase") or "").strip().lower()
        if phase == "day":
            at_enum = ActivityType.day
        elif phase == "night":
            at_enum = ActivityType.night
        else:
            at_enum = ActivityType.both

        name = (a.get("title") or ext).strip()
        desc = (a.get("description") or "").strip() or None

        activity = Activity.query.filter_by(external_id=ext).first()
        if not activity:
            activity = Activity(
                external_id=ext,
                category_id=category.id,
                name=name,
                description=desc,
                activity_type=at_enum,
                is_active=True
            )
            db.session.add(activity)
            created += 1
        else:
            activity.category_id = category.id
            activity.name = name
            activity.description = desc
            activity.activity_type = at_enum
            activity.is_active = True
            updated += 1

    db.session.commit()

    return jsonify({
        "msg": "Seed bulk completado",
        "created": created,
        "updated": updated,
        "skipped": skipped
    }), 200


# -------------------------
# DEV-THINGS (problematic)
# -------------------------

@api.route("/dev/reset/today", methods=["POST"])
@jwt_required()
def dev_reset_today():
    if not dev_only():
        return jsonify({"msg": "Not found"}), 404
    user_id = int(get_jwt_identity())
    today = datetime.now(timezone.utc).date()

    sessions = DailySession.query.filter_by(
        user_id=user_id, session_date=today).all()
    session_ids = [s.id for s in sessions]

    if session_ids:
        ActivityCompletion.query.filter(ActivityCompletion.daily_session_id.in_(
            session_ids)).delete(synchronize_session=False)
        EmotionCheckin.query.filter(EmotionCheckin.daily_session_id.in_(
            session_ids)).delete(synchronize_session=False)
        DailySession.query.filter(DailySession.id.in_(
            session_ids)).delete(synchronize_session=False)

    db.session.commit()

    return jsonify({"msg": "Reset de hoy completado"}), 200


@api.route("/dev/activities/deactivate", methods=["POST"])
def dev_deactivate_activity():
    if not dev_only():
        return jsonify({"msg": "Not found"}), 404

    body = request.get_json(silent=True) or {}
    external_id = (body.get("external_id") or "").strip()
    if not external_id:
        return jsonify({"msg": "external_id es obligatorio"}), 400

    activity = Activity.query.filter_by(external_id=external_id).first()
    if not activity:
        return jsonify({"msg": "Actividad no encontrada"}), 404

    activity.is_active = False
    db.session.commit()

    return jsonify({"msg": "Actividad desactivada", "external_id": external_id}), 200

# -------------------------
# TEMPORARILY DISABLED ROUTES
# (They are currently inconsistent / broken: params, jwt, GET body usage)
# Re-enable later with a clean contract.
# -------------------------

# @api.route("/users", methods=["GET"])
# def get_all_users():
#     users = User.query.all()
#     return jsonify([u.serialize() for u in users])

# @api.route("/users/<int:user_id>", methods=["DELETE"])
# @jwt_required()
# def delete_user(user_id):
#     # TODO: decide policy. For now, delete only self, or require admin.
#     pass

# ... other session/emotion/activity completion routes TODO ...

######## GOALS y REMINDERS

#### POST GOAL 

@api.route("/users/<int:user_id>/goals", methods=["POST"])
def create_goal(user_id):
    goal = Goal(user_id=user_id, **request.json)
    db.session.add(goal)
    db.session.commit()
    return jsonify(goal.serialize()), 201

#### POST DAILY SESSION GOALS

@api.route("/sessions/<int:session_id>/goals/<int:goal_id>", methods=["POST"])
def plan_goal(session_id):
    goal_id = request.json["goal_id"]

    dailyGoal = DailySessionGoal(
        daily_session_id=session_id,
        goal_id=goal_id
    )
    db.session.add(dailyGoal)
    db.session.commit()
    return jsonify(dailyGoal.serialize()), 201

#### POST  GOAL PROGRESS

@api.route("/sessions/<int:session_id>/goals/<int:goal_id>/progress", methods=["POST"])
def goal_progress(session_id, goal_id):
    goal = Goal.query.get(goal_id)

    goal_progress = GoalProgress(
        goal_id=goal_id,
        daily_session_id=session_id,
        delta_value=1
    )

    goal.current_value += 1

    if goal.current_value >= goal.target_value:
        goal.completed_at = datetime.utcnow()
        goal.is_active = False

    db.session.add(goal_progress)
    db.session.commit()

    return jsonify({
        "goal": goal.serialize(),
        "progress": goal_progress.serialize()
    }), 201


#### REMINDERS (LOOPS)

#### instalar pytz para asegurar hora local del usuario dependiendo de su ubicación 
#### pip install pytz
#### IMPORTANTE !!!  ver services.py para función de envío de email

@api.route("/internal_place/reminders/send", methods=["POST"])
def send_reminders():
    now_utc = datetime.utcnow().replace(tzinfo=pytz.utc)
    reminders = Reminder.query.filter_by(is_active=True).all()
    sent = 0

    for reminder in reminders:
        user = reminder.user
        user_now = now_utc.astimezone(pytz.timezone(user.timezone))
        should_send = False

        # daily filter 
        if reminder.days_of_week != "daily":
            allowed = reminder.days_of_week.split(",")
            today = user_now.strftime("%a").lower()[:3]
            if today not in allowed:
                continue

        # FIXED TIME MODE 
        if reminder.mode == "fixed":
            if reminder.local_time:
                already_sent_today = (
                    reminder.last_sent_at and
                    reminder.last_sent_at.date() == user_now.date()
                )

                if not already_sent_today:
                    if (
                        user_now.hour == reminder.local_time.hour and
                        user_now.minute == reminder.local_time.minute
                    ):
                        should_send = True

        # INACTIVITY 
        elif reminder.mode == "inactivity":
            if reminder.inactive_after_minutes:
                if not user.last_activity_at:
                    should_send = True
                else:
                    diff = user_now - user.last_activity_at
                    if diff.total_seconds() > reminder.inactive_after_minutes * 60:
                        should_send = True

        # send email
        if should_send:
            send_email(user, reminder)
            reminder.last_sent_at = now_utc
            sent += 1

    db.session.commit()

    return jsonify({"sent": sent}), 200


### GET EMOTION MUSIC AND DEFAULT TRACK

DEFAULT_TRACK = "https://soundcloud.com/sant_iagoo/sets/default-track"

@api.route("/music/emotion-music", methods=["GET"])
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

@api.route("/music/default", methods=["GET"])
def get_default_music():
    return jsonify({
        "url_music": DEFAULT_TRACK
    }), 200