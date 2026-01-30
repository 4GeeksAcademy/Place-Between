import os
from collections import defaultdict
from datetime import datetime, timedelta, timezone, date

from flask import request, jsonify, Blueprint
from flask_cors import CORS
from flask_jwt_extended import create_access_token, jwt_required, get_jwt_identity
from werkzeug.security import generate_password_hash

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

from api.service_loops.welcome_user import (
    send_welcome_transactional,
    LoopsError as WelcomeLoopsError,
)
from api.service_loops.reset_password import send_password_reset
from api.service_loops.verify_email import (
    send_verify_email,
    LoopsError as VerifyLoopsError,
)

api = Blueprint("api", __name__)
CORS(api)


def dev_only():
    return os.getenv("FLASK_DEBUG") == "1"


@api.route("/hello", methods=["POST", "GET"])
def handle_hello():
    return jsonify({"message": "Hello! I'm a message that came from the backend."}), 200


# -------------------------
# HELPERS
# -------------------------

def _daterange_days(start_date: date, end_date: date):
    days = []
    d = start_date
    while d <= end_date:
        days.append(d)
        d += timedelta(days=1)
    return days


def _parse_date_ymd(s: str):
    try:
        return datetime.strptime(s, "%Y-%m-%d").date()
    except Exception:
        return None


def _calc_streak(flags_by_date):
    """
    flags_by_date: lista bool en orden cronológico (True = día consistente)
    current: racha desde el final
    best: máxima racha
    """
    best = 0
    tmp = 0
    for f in flags_by_date:
        if f:
            tmp += 1
            best = max(best, tmp)
        else:
            tmp = 0

    cur = 0
    for f in reversed(flags_by_date):
        if f:
            cur += 1
        else:
            break

    return cur, best


def _utc_iso(dt: datetime):
    if not dt:
        return None
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc).isoformat().replace("+00:00", "Z")


def build_mirror_range_payload(user_id: int, start_date, end_date):
    # 1) sesiones en rango
    sessions = (
        DailySession.query
        .filter(
            DailySession.user_id == user_id,
            DailySession.session_date >= start_date,
            DailySession.session_date <= end_date
        )
        .all()
    )

    # 2) inicializa days map (siempre incluye todos los días aunque no haya datos)
    days_map = {}
    for d in _daterange_days(start_date, end_date):
        iso = d.isoformat()
        days_map[iso] = {
            "date": iso,
            "points_total": 0,
            "points_day": 0,
            "points_night": 0,
            "completions_count": 0,
            "principal_count": 0,      # points_awarded >= 10
            "recommended_count": 0,    # points_awarded == 20
            "categories": {},          # {cat_name: points}
            "emotions": {},            # {emotion_name: {count, intensity_avg}}
            "emotion_entries": [],     # [{name,intensity,note,created_at}]
            # [{name,category_name,points,session_type,completed_at,external_id}]
            "activities": [],
        }

    # 3) puntos day/night por sesión
    session_ids = []
    session_by_id = {}

    for s in sessions:
        session_ids.append(s.id)
        session_by_id[s.id] = s

        key = s.session_date.isoformat()
        pts = int(s.points_earned or 0)

        if key in days_map:
            days_map[key]["points_total"] += pts
            if s.session_type == SessionType.day:
                days_map[key]["points_day"] += pts
            else:
                days_map[key]["points_night"] += pts

    # si no hay sesiones, devolvemos vacío pero con días
    if not session_ids:
        days_list = list(days_map.values())
        flags = [False for _ in days_list]
        cur, best = _calc_streak(flags)
        return {
            "range": {
                "start": start_date.isoformat(),
                "end": end_date.isoformat(),
                "days": len(days_list),
                "timezone": "UTC"
            },
            "days": days_list,
            "totals": {
                "points_total": 0,
                "completions_total": 0,
                "principal_days": 0,
                "recommended_days": 0
            },
            "streak": {"current": cur, "best": best},
            "distributions": {"categories_points": {}, "emotions": {}},
        }

    # 4) completions + categorías + ACTIVITIES[] por día
    completions = (
        ActivityCompletion.query
        .join(Activity, ActivityCompletion.activity_id == Activity.id)
        .join(ActivityCategory, Activity.category_id == ActivityCategory.id)
        .filter(ActivityCompletion.daily_session_id.in_(session_ids))
        .all()
    )

    dist_cat_points = defaultdict(int)

    for c in completions:
        s = session_by_id.get(c.daily_session_id)
        if not s:
            continue

        day_key = s.session_date.isoformat()
        if day_key not in days_map:
            continue

        pts = int(c.points_awarded or 0)
        cat_name = "General"
        act_name = "Actividad"

        if c.activity:
            act_name = c.activity.name or act_name
            if c.activity.category:
                cat_name = c.activity.category.name or cat_name

        days_map[day_key]["completions_count"] += 1
        if pts >= 10:
            days_map[day_key]["principal_count"] += 1
        if pts == 20:
            days_map[day_key]["recommended_count"] += 1

        # puntos por categoría por día
        day_cats = days_map[day_key]["categories"]
        day_cats[cat_name] = int(day_cats.get(cat_name, 0)) + pts

        # distribución global por categoría
        dist_cat_points[cat_name] += pts

        # DRILLDOWN: lista de actividades del día
        completed_at = None
        try:
            completed_at = c.completed_at.isoformat() + "Z" if c.completed_at else None
        except Exception:
            completed_at = None

        days_map[day_key]["activities"].append({
            "external_id": c.activity.external_id if c.activity else None,
            "name": c.activity.name if c.activity else "Actividad",
            "category_name": cat_name,
            "points": pts,
            "session_type": s.session_type.value,
            "completed_at": (c.completed_at.isoformat() + "Z") if c.completed_at else None,
        })

    # ordena activities por hora (si existe)
    for d in days_map.values():
        d["activities"].sort(key=lambda x: (x.get("completed_at") or ""))

    # 5) emociones (freq + intensidad avg)
    checkins = (
        EmotionCheckin.query
        .join(DailySession, EmotionCheckin.daily_session_id == DailySession.id)
        .join(Emotion, EmotionCheckin.emotion_id == Emotion.id)
        .filter(DailySession.id.in_(session_ids))
        .all()
    )

    dist_emotions = {}  # name -> {count, intensity_sum, intensity_count}

    for ch in checkins:
        s = session_by_id.get(ch.daily_session_id)
        if not s:
            continue

        day_key = s.session_date.isoformat()
        if day_key not in days_map:
            continue

        name = ch.emotion.name if ch.emotion else "Desconocida"

        days_map[day_key]["emotion_entries"].append({
            "name": name,
            "intensity": int(ch.intensity) if ch.intensity is not None else None,
            "note": ch.note if ch.note else None,
            "created_at": (ch.created_at.isoformat() + "Z") if ch.created_at else None
        })

        # por día
        day_em = days_map[day_key]["emotions"].get(
            name, {"count": 0, "intensity_sum": 0, "intensity_count": 0})
        day_em["count"] += 1
        if ch.intensity is not None:
            day_em["intensity_sum"] += int(ch.intensity)
            day_em["intensity_count"] += 1
        days_map[day_key]["emotions"][name] = day_em

        # global
        g = dist_emotions.get(
            name, {"count": 0, "intensity_sum": 0, "intensity_count": 0})
        g["count"] += 1
        if ch.intensity is not None:
            g["intensity_sum"] += int(ch.intensity)
            g["intensity_count"] += 1
        dist_emotions[name] = g

    # normaliza intensity_avg (día + global)
    for d in days_map.values():
        for name, obj in list(d["emotions"].items()):
            ic = obj.get("intensity_count", 0)
            avg = (obj["intensity_sum"] / ic) if ic else None
            d["emotions"][name] = {"count": obj["count"], "intensity_avg": avg}

    dist_emotions_out = {}
    for name, obj in dist_emotions.items():
        ic = obj.get("intensity_count", 0)
        avg = (obj["intensity_sum"] / ic) if ic else None
        dist_emotions_out[name] = {"count": obj["count"], "intensity_avg": avg}

    for da in days_map.values():
        da["emotion_entries"].sort(key=lambda x: (x.get("created_at") or ""), reverse=True)

    # 6) totales + streak
    days_list = list(days_map.values())

    # Consistencia: día con >= 1 "principal" (points_awarded >= 10)
    # IMPORTANTE: "racha actual" debe medirse hasta HOY, no hasta el final del rango
    today_utc = datetime.now(timezone.utc).date()
    cutoff_date = min(end_date, today_utc)

    def _day_leq_cutoff(day_obj):
        try:
            d = date.fromisoformat(day_obj["date"])
            return d <= cutoff_date
        except Exception:
            # Si por algún motivo falla el parseo, no bloqueamos el streak
            return True

    consistency_flags_all = [d["principal_count"] > 0 for d in days_list]
    consistency_flags_upto_today = [d["principal_count"] > 0 for d in days_list if _day_leq_cutoff(d)]

    # Best streak puede calcularse con todo el rango (da igual que haya futuros a False, no reduce el máximo),
    # pero current streak debe excluir días futuros.
    _, streak_best = _calc_streak(consistency_flags_all)
    streak_cur, _ = _calc_streak(consistency_flags_upto_today)

    totals = {
        "points_total": sum(int(d["points_total"] or 0) for d in days_list),
        "completions_total": sum(int(d["completions_count"] or 0) for d in days_list),
        "principal_days": sum(1 for d in days_list if (d["principal_count"] or 0) > 0),
        "recommended_days": sum(1 for d in days_list if (d["recommended_count"] or 0) > 0),
    }

    return {
        "range": {
            "start": start_date.isoformat(),
            "end": end_date.isoformat(),
            "days": len(days_list),
            "timezone": "UTC"
        },
        "days": days_list,
        "totals": totals,
        "streak": {"current": streak_cur, "best": streak_best},
        "distributions": {
            "categories_points": dict(dist_cat_points),
            "emotions": dist_emotions_out
        },
    }


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

    # Loops: welcome (best-effort)
    try:
        transactional_id = os.getenv("LOOPS_WELCOME_TRANSACTIONAL_ID")
        if not transactional_id:
            raise WelcomeLoopsError(
                "Falta LOOPS_WELCOME_TRANSACTIONAL_ID en el .env")

        send_welcome_transactional(
            email=user.email,
            transactional_id=transactional_id,
            data=user.username.capitalize(),
        )
    except Exception as e:
        print("Error Loops welcome (debug):", repr(e))

    # Loops: verify email (best-effort)
    try:
        verify_id = os.getenv("LOOPS_VERIFY_EMAIL_TRANSACTIONAL_ID")
        if not verify_id:
            raise VerifyLoopsError("Falta LOOPS_VERIFY_EMAIL_TRANSACTIONAL_ID")

        verify_token = create_access_token(identity=str(
            user.id), expires_delta=timedelta(hours=24))

        # OJO: idealmente FRONTEND_URL y una ruta real del front
        frontend_url = (os.getenv("FRONTEND_URL")
                        or "http://localhost:3000").rstrip("/")
        verify_url = f"{frontend_url}/auth/verify?token={verify_token}"

        send_verify_email(
            email=user.email,
            transactional_id=verify_id,
            username=user.username,
            url_verify=verify_url,
        )
    except Exception as e:
        print("Error Loops verify email (debug):", repr(e))

    return jsonify({"msg": "Usuario creado", "user": user.serialize()}), 201


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

    user.last_login_at = datetime.now(timezone.utc)
    db.session.commit()

    expires = timedelta(days=30) if remember_me else timedelta(hours=24)
    access_token = create_access_token(
        identity=str(user.id), expires_delta=expires)

    return jsonify({"access_token": access_token, "user": user.serialize()}), 200


# --------------------------
# PASSWORD RESET
# --------------------------

@api.route("/auth/forgot-password", methods=["POST"])
def forgot_password():
    """
    Respuesta siempre 200 para evitar enumeración de emails.
    """
    body = request.get_json(silent=True) or {}
    email = (body.get("email") or "").strip().lower()

    if not email:
        return jsonify({"msg": "email es obligatorio"}), 400

    user = User.query.filter_by(email=email).first()
    if user:
        token = create_access_token(identity=str(
            user.id), expires_delta=timedelta(hours=1))
        frontend_url = (os.getenv("FRONTEND_URL")
                        or "http://localhost:3000").rstrip("/")
        url_reset = f"{frontend_url}/auth/reset?token={token}"
        try:
            send_password_reset(email, url_reset)
        except Exception as e:
            print("Error send_password_reset (debug):", repr(e))

    return jsonify({"msg": "Si el email existe, recibirás un enlace para restablecer tu contraseña."}), 200


@api.route("/auth/reset-password", methods=["POST"])
@jwt_required()
def reset_password():
    """
    Token JWT viene en Authorization (Bearer), identity = user_id.
    Body: { "password": "..." }
    """
    body = request.get_json(silent=True) or {}
    password = body.get("password")

    if not password:
        return jsonify({"msg": "password es obligatorio"}), 400

    user_id = get_jwt_identity()
    try:
        user_id_int = int(user_id)
    except Exception:
        return jsonify({"msg": "Token inválido (identity)"}), 401

    user = User.query.get(user_id_int)
    if user is None:
        return jsonify({"msg": "Usuario no encontrado"}), 404

    user.password_hash = generate_password_hash(password)
    db.session.add(user)
    db.session.commit()

    return jsonify({"success": True}), 200


# -------------------------
# SESSIONS
# -------------------------

@api.route("/sessions", methods=["POST"])
@jwt_required()
def create_or_get_session():
    """
    Body:
      { "session_type": "day"|"night", "date": "YYYY-MM-DD" (optional) }
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
        session_type=st_enum,
    ).first()

    if not session:
        session = DailySession(
            user_id=user.id,
            session_date=session_date,
            session_type=st_enum,
            points_earned=0,
        )
        db.session.add(session)
        db.session.commit()

    return jsonify(session.serialize()), 200


# -------------------------
# MIRROR
# -------------------------

@api.route("/mirror/today", methods=["GET"])
@jwt_required()
def mirror_today():
    """
    Optional query: ?session_type=day|night
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
            "points_by_category": {},
            "activities": [],
            "emotion": None,
            "message": "Aún no has registrado actividades ni emociones hoy",
        }), 200

    points_today = sum(s.points_earned or 0 for s in sessions)

    activities = []
    points_by_category = {}

    for s in sessions:
        completions = (
            ActivityCompletion.query
            .join(Activity, ActivityCompletion.activity_id == Activity.id)
            .join(ActivityCategory, Activity.category_id == ActivityCategory.id)
            .filter(ActivityCompletion.daily_session_id == s.id)
            .order_by(ActivityCompletion.completed_at.asc())
            .all()
        )

        for c in completions:
            cat_name = c.activity.category.name if c.activity and c.activity.category else "General"
            pts = int(c.points_awarded or 0)
            points_by_category[cat_name] = points_by_category.get(
                cat_name, 0) + pts

            activities.append({
                "id": c.activity.id,
                "external_id": c.activity.external_id,
                "name": c.activity.name,
                "category_name": cat_name,
                "points": pts,
                "session_type": s.session_type.value,
                "completed_at": _utc_iso(c.completed_at),
            })

    activities.sort(key=lambda x: x.get("completed_at") or "")

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
            "created_at": _utc_iso(latest_checkin.created_at),
        }

    return jsonify({
        "date": today.isoformat(),
        "sessions": [s.serialize() for s in sessions],
        "points_today": points_today,
        "points_by_category": points_by_category,
        "activities": activities,
        "emotion": emotion,
    }), 200


@api.route("/mirror/range", methods=["GET"])
@jwt_required()
def mirror_range():
    user_id_raw = get_jwt_identity()
    try:
        user_id = int(user_id_raw)
    except Exception:
        return jsonify({"message": "Token inválido (identity)."}), 401

    start_s = request.args.get("start")
    end_s = request.args.get("end")

    start = _parse_date_ymd(start_s) if start_s else None
    end = _parse_date_ymd(end_s) if end_s else None

    if not start or not end:
        return jsonify({"message": "start y end son obligatorios (YYYY-MM-DD)."}), 400
    if start > end:
        return jsonify({"message": "start debe ser <= end."}), 400

    payload = build_mirror_range_payload(
        user_id=user_id, start_date=start, end_date=end)
    return jsonify(payload), 200


# -------------------------
# MIRROR week/month (stable payload)
# -------------------------

@api.route("/mirror/week", methods=["GET"])
@jwt_required()
def mirror_week():
    user_id_raw = get_jwt_identity()
    try:
        user_id = int(user_id_raw)
    except Exception:
        return jsonify({"message": "Token inválido (identity)."}), 401

    today = datetime.now(timezone.utc).date()
    start = today - timedelta(days=6)

    payload = build_mirror_range_payload(
        user_id=user_id, start_date=start, end_date=today)
    return jsonify(payload), 200


@api.route("/mirror/month", methods=["GET"])
@jwt_required()
def mirror_month():
    user_id_raw = get_jwt_identity()
    try:
        user_id = int(user_id_raw)
    except Exception:
        return jsonify({"message": "Token inválido (identity)."}), 401

    today = datetime.now(timezone.utc).date()
    start = today - timedelta(days=29)

    payload = build_mirror_range_payload(
        user_id=user_id, start_date=start, end_date=today)
    return jsonify(payload), 200


# -------------------------
# READ-ONLY LISTS
# -------------------------

@api.route("/emotions", methods=["GET"])
def get_all_emotions():
    emotions = Emotion.query.all()
    return jsonify([e.serialize() for e in emotions]), 200


@api.route("/activities", methods=["GET"])
def get_all_activities():
    activities = Activity.query.filter_by(is_active=True).all()
    return jsonify([a.serialize() for a in activities]), 200


# -------------------------
# ACTIVITIES COMPLETE (SCORING)
# -------------------------

@api.route("/activities/complete", methods=["POST"])
@jwt_required()
def complete_activity():
    body = request.get_json(silent=True) or {}

    external_id = body.get("external_id")
    session_type = body.get("session_type")  # "day" | "night"
    is_recommended = bool(body.get("is_recommended", False))
    source = (body.get("source") or "today").strip().lower()  # today | catalog

    if not external_id or session_type not in ("day", "night"):
        return jsonify({"msg": "Datos incompletos"}), 400

    user_id = int(get_jwt_identity())
    today = datetime.now(timezone.utc).date()

    user = User.query.get(user_id)
    if not user:
        return jsonify({"msg": "Usuario no encontrado"}), 404

    activity = Activity.query.filter_by(
        external_id=external_id, is_active=True).first()
    if not activity:
        return jsonify({"msg": "Actividad no encontrada"}), 404

    st_enum = SessionType.day if session_type == "day" else SessionType.night

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

    # idempotencia (misma activity en misma sesión)
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
    session.points_earned = int(session.points_earned or 0) + points

    db.session.add(completion)
    db.session.commit()

    return jsonify({
        "points_awarded": points,
        "points_total": session.points_earned,
        "session_id": session.id,
        "activity_id": activity.external_id
    }), 201


# -------------------------
# EMOTION CHECKIN
# -------------------------

@api.route("/emotions/checkin", methods=["POST"])
@jwt_required()
def create_emotion_checkin():
    """
    Guarda un check-in emocional ligado a la sesión NIGHT de hoy (UTC date).
    Body: { emotion_id, intensity (1..10), note? }
    """
    body = request.get_json(silent=True) or {}

    emotion_id = body.get("emotion_id")
    intensity = body.get("intensity")
    note_text = (body.get("note") or "").strip()

    try:
        emotion_id = int(emotion_id)
    except Exception:
        return jsonify({"msg": "emotion_id inválido"}), 400

    try:
        intensity = int(intensity)
    except Exception:
        return jsonify({"msg": "intensity inválido"}), 400

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


# -------------------------
# DEV: SEED + RESET
# -------------------------

@api.route("/dev/seed/activities/bulk", methods=["POST"])
def dev_seed_activities_bulk():
    if not dev_only():
        return jsonify({"msg": "Not found"}), 404

    body = request.get_json(silent=True) or {}
    items = body.get("activities") or []
    if not isinstance(items, list) or not items:
        return jsonify({"msg": "activities debe ser una lista no vacía"}), 400

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

    return jsonify({"msg": "Seed bulk completado", "created": created, "updated": updated, "skipped": skipped}), 200


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

# GOALS y REMINDERS

# POST GOAL


@api.route("/users/<int:user_id>/goals", methods=["POST"])
def create_goal(user_id):
    goal = Goal(user_id=user_id, **request.json)
    db.session.add(goal)
    db.session.commit()
    return jsonify(goal.serialize()), 201

# POST DAILY SESSION GOALS


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

# POST  GOAL PROGRESS


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


# REMINDERS (LOOPS)

# instalar pytz para asegurar hora local del usuario dependiendo de su ubicación
# pip install pytz
# IMPORTANTE !!!  ver services.py para función de envío de email

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


# GET EMOTION MUSIC AND DEFAULT TRACK

DEFAULT_TRACK = "https://soundcloud.com/sant_iagoo/sets/default-track"

EMOTION_PLAYLISTS = {
    "alegria": {
        "day": "https://soundcloud.com/sant_iagoo/sets/focus",
        "night": "https://soundcloud.com/sant_iagoo/sets/luz-suave"
    },
    "tristeza": {
        "day": "https://soundcloud.com/sant_iagoo/sets/focus",
        "night": "https://soundcloud.com/sant_iagoo/sets/contencion"
    },
    "ira": {
        "day": "https://soundcloud.com/sant_iagoo/sets/descarga_controlada",
        "night": "https://soundcloud.com/sant_iagoo/sets/contencion"
    },
    "miedo/ansiedad": {
        "day": "https://soundcloud.com/sant_iagoo/sets/descarga_controlada",
        "night": "https://soundcloud.com/sant_iagoo/sets/contencion"
    }, 
    "ansiedad": {
        "day": "https://soundcloud.com/sant_iagoo/sets/descarga_controlada",
        "night": "https://soundcloud.com/sant_iagoo/sets/contencion"
    }, 
    "miedo": {
        "day": "https://soundcloud.com/sant_iagoo/sets/descarga_controlada",
        "night": "https://soundcloud.com/sant_iagoo/sets/contencion"
    }, 
    "default": {
        "day": "https://soundcloud.com/sant_iagoo/sets/default-track",
        "night": "https://soundcloud.com/sant_iagoo/sets/default-track"
    }
}


@api.route("/music/emotion-music", methods=["GET"])
def get_session_emotion_music():
    daily_session_id = request.args.get("daily_session_id")

    if not daily_session_id:
        return jsonify({"msg": "daily_session_id requerido"}), 400

    session = DailySession.query.get(daily_session_id)
    if not session:
        return jsonify({"msg": "Session no encontrada"}), 404

    # session enum define el tipo: day o night 

    phase = "day" if session.session_type == SessionType.day else "night"

    checkin = (
        EmotionCheckin.query
        .filter_by(daily_session_id=daily_session_id)
        .order_by(EmotionCheckin.created_at.desc())
        .first()
    )

    if not checkin or not checkin.emotion:
        return jsonify({
            "emotion": None,
            "url_music": EMOTION_PLAYLISTS["default"][phase]
        }), 200

    emotion_name = checkin.emotion.name.lower()

    if emotion_name in EMOTION_PLAYLISTS:
        url_music = EMOTION_PLAYLISTS[emotion_name][phase]
    else:
        url_music = EMOTION_PLAYLISTS["default"][phase]

    return jsonify({
        "emotion": emotion_name,
        "session_type": phase,
        "url_music": url_music
    }), 200


@api.route("/music/default", methods=["GET"])
def get_default_music():
    return jsonify({
        "url_music": DEFAULT_TRACK
    }), 200
