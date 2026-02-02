import os, json
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
    GoalCategory,
    GoalTemplate, 
    GoalProgress,
    GoalSize,
    DailySessionGoal,
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
        da["emotion_entries"].sort(key=lambda x: (
            x.get("created_at") or ""), reverse=True)

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
    consistency_flags_upto_today = [
        d["principal_count"] > 0 for d in days_list if _day_leq_cutoff(d)]

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

# Bulk seed de actividades
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

# Seed desde presets en JSON (sin terminal)
@api.route("/dev/seed/activities/presets", methods=["POST"])
def dev_seed_activities_presets():
    if not dev_only():
        return jsonify({"msg": "Not found"}), 404

    # 1) Lee el JSON del front (fuente única)
    base_dir = os.path.dirname(os.path.realpath(__file__))  # .../src/api
    seed_path = os.path.join(base_dir, "..", "front", "data", "activities.seed.json")

    try:
        with open(seed_path, "r", encoding="utf-8") as f:
            catalog = json.load(f)
    except Exception as e:
        return jsonify({"msg": f"No se pudo leer activities.seed.json: {e}"}), 500

    day_items = catalog.get("day") or []
    night_items = catalog.get("night") or []
    if not isinstance(day_items, list) or not isinstance(night_items, list):
        return jsonify({"msg": "Formato inválido: se espera {day:[], night:[]}" }), 400

    items = []
    items.extend(day_items)
    items.extend(night_items)

    if not items:
        return jsonify({"msg": "activities.seed.json no contiene actividades"}), 400

    # 2) Misma lógica que el bulk, pero usando `items` directamente
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
        # NOTA: el JSON puede tener muchos campos extra (image, run, etc.)
        # El seed solo consume id/branch/phase/title/description
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
        "msg": "Seed presets completado",
        "created": created,
        "updated": updated,
        "skipped": skipped
    }), 200



# Bulk seed de plantillas de objetivos
@api.route("/dev/seed/goals/templates/bulk", methods=["POST"])
@jwt_required()
def dev_seed_goal_templates_bulk():
    if not dev_only():
        return jsonify({"msg": "Not found"}), 404

    body = request.get_json(silent=True) or {}
    items = body.get("templates") or []
    if not isinstance(items, list) or not items:
        return jsonify({"msg": "templates debe ser una lista no vacía"}), 400

    cat_cache = {}

    def get_or_create_goal_category(name: str):
        name = (name or "General").strip()
        if name in cat_cache:
            return cat_cache[name]
        cat = GoalCategory.query.filter_by(name=name).first()
        if not cat:
            cat = GoalCategory(name=name, description=None)
            db.session.add(cat)
            db.session.commit()
        cat_cache[name] = cat
        return cat

    created = 0
    updated = 0
    skipped = 0

    for t in items:
        ext = (t.get("id") or "").strip()
        if not ext:
            skipped += 1
            continue

        category_name = (t.get("category") or "General").strip()
        cat = get_or_create_goal_category(category_name)

        size_raw = (t.get("size") or "small").strip().lower()
        size_enum = _parse_goal_size(size_raw) or GoalSize.small

        frequency = (t.get("frequency") or "daily").strip().lower()
        if frequency not in ("daily", "weekly", "monthly"):
            frequency = "daily"

        try:
            target_value = int(t.get("target_value") or 1)
        except Exception:
            target_value = 1
        if target_value < 0:
            target_value = 0

        try:
            points_reward = int(t.get("points_reward") or 0)
        except Exception:
            points_reward = 0
        if points_reward < 0:
            points_reward = 0

        title = (t.get("title") or ext).strip()
        desc = (t.get("description") or "").strip() or None

        template = GoalTemplate.query.filter_by(external_id=ext).first()
        if not template:
            template = GoalTemplate(
                external_id=ext,
                category_id=cat.id,
                title=title,
                description=desc,
                frequency=frequency,
                size=size_enum,
                target_value=target_value,
                points_reward=points_reward,
                is_active=True,
            )
            db.session.add(template)
            created += 1
        else:
            template.category_id = cat.id
            template.title = title
            template.description = desc
            template.frequency = frequency
            template.size = size_enum
            template.target_value = target_value
            template.points_reward = points_reward
            template.is_active = True
            updated += 1

    db.session.commit()
    return jsonify({"msg": "Seed goal templates completado", "created": created, "updated": updated, "skipped": skipped}), 200


@api.route("/dev/seed/goals/templates/presets", methods=["POST"])
def dev_seed_goal_templates_presets():
    if not dev_only():
        return jsonify({"msg": "Not found"}), 404

    base_dir = os.path.dirname(os.path.realpath(__file__))  # .../src/api
    seed_path = os.path.join(base_dir, "..", "front", "data", "goalTemplates.seed.json")

    try:
        with open(seed_path, "r", encoding="utf-8") as f:
            items = json.load(f)
    except Exception as e:
        return jsonify({"msg": f"No se pudo leer goalTemplates.seed.json: {e}"}), 500

    if not isinstance(items, list) or not items:
        return jsonify({"msg": "goalTemplates.seed.json debe ser una lista no vacía"}), 400

    cat_cache = {}

    def get_or_create_goal_category(name: str):
        name = (name or "General").strip()
        if name in cat_cache:
            return cat_cache[name]
        cat = GoalCategory.query.filter_by(name=name).first()
        if not cat:
            cat = GoalCategory(name=name, description=None)
            db.session.add(cat)
            db.session.commit()
        cat_cache[name] = cat
        return cat

    created = 0
    updated = 0
    skipped = 0

    for t in items:
        ext = (t.get("id") or "").strip()
        if not ext:
            skipped += 1
            continue

        category_name = (t.get("category") or "General").strip()
        cat = get_or_create_goal_category(category_name)

        size_raw = (t.get("size") or "small").strip().lower()
        size_enum = _parse_goal_size(size_raw) or GoalSize.small

        frequency = (t.get("frequency") or "daily").strip().lower()
        if frequency not in ("daily", "weekly", "monthly"):
            frequency = "daily"

        try:
            target_value = int(t.get("target_value") or 1)
        except Exception:
            target_value = 1
        if target_value < 0:
            target_value = 0

        try:
            points_reward = int(t.get("points_reward") or 0)
        except Exception:
            points_reward = 0
        if points_reward < 0:
            points_reward = 0

        title = (t.get("title") or ext).strip()
        desc = (t.get("description") or "").strip() or None

        template = GoalTemplate.query.filter_by(external_id=ext).first()
        if not template:
            template = GoalTemplate(
                external_id=ext,
                category_id=cat.id,
                title=title,
                description=desc,
                frequency=frequency,
                size=size_enum,
                target_value=target_value,
                points_reward=points_reward,
                is_active=True,
            )
            db.session.add(template)
            created += 1
        else:
            template.category_id = cat.id
            template.title = title
            template.description = desc
            template.frequency = frequency
            template.size = size_enum
            template.target_value = target_value
            template.points_reward = points_reward
            template.is_active = True
            updated += 1

    db.session.commit()
    return jsonify({
        "msg": "Seed goal templates presets completado",
        "created": created,
        "updated": updated,
        "skipped": skipped
    }), 200



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
# GOALS
# -------------------------


def _parse_goal_size(raw: str):
    raw = (raw or "").strip().lower()
    if raw in ("small", "medium", "large"):
        return GoalSize(raw)
    return None


def _get_or_create_day_session(user_id: int, session_date: date):
    st_enum = SessionType.day
    session = DailySession.query.filter_by(
        user_id=user_id,
        session_date=session_date,
        session_type=st_enum
    ).first()
    if not session:
        session = DailySession(
            user_id=user_id,
            session_date=session_date,
            session_type=st_enum,
            points_earned=0
        )
        db.session.add(session)
        db.session.commit()
    return session


@api.route("/goals", methods=["GET"])
@jwt_required()
def list_goals():
    user_id = int(get_jwt_identity())
    goals = Goal.query.filter_by(user_id=user_id).order_by(Goal.created_at.desc()).all()
    return jsonify([g.serialize() for g in goals]), 200


@api.route("/goals", methods=["POST"])
@jwt_required()
def create_goal():
    user_id = int(get_jwt_identity())
    data = request.get_json(silent=True) or {}

    title = (data.get("title") or "").strip()
    if not title:
        return jsonify({"msg": "title is required"}), 400

    size_enum = _parse_goal_size(data.get("size"))
    if not size_enum:
        return jsonify({"msg": "size must be one of: small, medium, large"}), 400

    try:
        target_value = int(data.get("target_value"))
    except Exception:
        return jsonify({"msg": "target_value is required and must be an integer"}), 400
    if target_value < 0:
        return jsonify({"msg": "target_value must be >= 0"}), 400

    try:
        current_value = int(data.get("current_value") or 0)
    except Exception:
        return jsonify({"msg": "current_value must be an integer"}), 400
    if current_value < 0:
        return jsonify({"msg": "current_value must be >= 0"}), 400

    try:
        points_reward = int(data.get("points_reward") or 0)
    except Exception:
        return jsonify({"msg": "points_reward must be an integer"}), 400
    if points_reward < 0:
        return jsonify({"msg": "points_reward must be >= 0"}), 400

    goal = Goal(
        user_id=user_id,
        title=title,
        description=(data.get("description") or "").strip() or None,

        goal_type=(data.get("goal_type") or "custom").strip(),
        frequency=(data.get("frequency") or "flexible").strip(),
        start_date=_parse_date_ymd(data.get("start_date")),
        end_date=_parse_date_ymd(data.get("end_date")),

        size=size_enum,
        target_value=target_value,
        current_value=current_value,
        points_reward=points_reward,

        is_active=bool(data.get("is_active", True)),
    )

    db.session.add(goal)
    db.session.commit()
    return jsonify(goal.serialize()), 201


def _get_user_goal_or_404(user_id: int, goal_id: int):
    goal = Goal.query.get(goal_id)
    if goal is None or goal.user_id != user_id:
        return None
    return goal


@api.route("/goals/<int:goal_id>", methods=["GET"])
@jwt_required()
def get_goal(goal_id):
    user_id = int(get_jwt_identity())
    goal = _get_user_goal_or_404(user_id, goal_id)
    if goal is None:
        return jsonify({"msg": "goal not found"}), 404
    return jsonify(goal.serialize()), 200


@api.route("/goals/<int:goal_id>", methods=["PUT"])
@jwt_required()
def update_goal(goal_id):
    user_id = int(get_jwt_identity())
    goal = _get_user_goal_or_404(user_id, goal_id)
    if goal is None:
        return jsonify({"msg": "goal not found"}), 404

    data = request.get_json(silent=True) or {}

    if "title" in data:
        new_title = (data.get("title") or "").strip()
        if not new_title:
            return jsonify({"msg": "El título no puede estar vacío"}), 400
        goal.title = new_title

    if "description" in data:
        goal.description = (data.get("description") or "").strip() or None

    if "goal_type" in data:
        goal.goal_type = (data.get("goal_type") or goal.goal_type).strip()

    if "frequency" in data:
        goal.frequency = (data.get("frequency") or goal.frequency).strip()

    if "start_date" in data:
        goal.start_date = _parse_date_ymd(data.get("start_date"))

    if "end_date" in data:
        goal.end_date = _parse_date_ymd(data.get("end_date"))

    if "size" in data:
        size_enum = _parse_goal_size(data.get("size"))
        if not size_enum:
            return jsonify({"msg": "size must be one of: small, medium, large"}), 400
        goal.size = size_enum

    if "target_value" in data:
        try:
            tv = int(data.get("target_value"))
        except Exception:
            return jsonify({"msg": "target_value must be an integer"}), 400
        if tv < 0:
            return jsonify({"msg": "target_value must be >= 0"}), 400
        goal.target_value = tv

    if "current_value" in data:
        try:
            cv = int(data.get("current_value"))
        except Exception:
            return jsonify({"msg": "current_value must be an integer"}), 400
        if cv < 0:
            return jsonify({"msg": "current_value must be >= 0"}), 400
        goal.current_value = cv

    if "points_reward" in data:
        try:
            pr = int(data.get("points_reward") or 0)
        except Exception:
            return jsonify({"msg": "points_reward must be an integer"}), 400
        if pr < 0:
            return jsonify({"msg": "points_reward must be >= 0"}), 400
        goal.points_reward = pr

    if "is_active" in data:
        goal.is_active = bool(data.get("is_active"))

    db.session.commit()
    return jsonify(goal.serialize()), 200


@api.route("/goals/<int:goal_id>", methods=["DELETE"])
@jwt_required()
def delete_goal(goal_id):
    user_id = int(get_jwt_identity())
    goal = _get_user_goal_or_404(user_id, goal_id)
    if goal is None:
        return jsonify({"msg": "goal not found"}), 404

    db.session.delete(goal)
    db.session.commit()
    return jsonify({"msg": "deleted"}), 200


@api.route("/goals/<int:goal_id>/progress", methods=["POST"])
@jwt_required()
def add_goal_progress(goal_id):
    """Adds a progress entry for a goal (optionally tied to a DailySession)."""
    user_id = int(get_jwt_identity())
    goal = _get_user_goal_or_404(user_id, goal_id)
    if goal is None:
        return jsonify({"msg": "goal not found"}), 404

    data = request.get_json(silent=True) or {}
    daily_session_id = data.get("daily_session_id")
    note = (data.get("note") or "").strip()

    try:
        delta_value = int(data.get("delta_value"))
    except Exception:
        return jsonify({"msg": "delta_value is required and must be an integer"}), 400

    daily_session = None
    if daily_session_id is not None:
        daily_session = DailySession.query.get(daily_session_id)
        if daily_session is None or daily_session.user_id != user_id:
            return jsonify({"msg": "daily_session not found"}), 404

    progress = GoalProgress(
        goal_id=goal.id,
        daily_session_id=daily_session.id if daily_session else None,
        delta_value=delta_value,
        note=note if note else None,
    )
    db.session.add(progress)

    # Sync current_value (acumulativo) si es numérico
    goal.current_value = int(goal.current_value or 0) + int(delta_value or 0)

    db.session.commit()
    return jsonify(progress.serialize()), 201


@api.route("/goals/<int:goal_id>/complete", methods=["POST"])
@jwt_required()
def complete_goal(goal_id):
    """
    Marks a goal as completed and awards points into a DailySession.
    daily_session_id es opcional:
      - si viene: usa esa sesión (del usuario)
      - si no viene: crea/usa sesión DAY de hoy (UTC date)
    """
    user_id = int(get_jwt_identity())
    goal = _get_user_goal_or_404(user_id, goal_id)
    if goal is None:
        return jsonify({"msg": "goal not found"}), 404

    data = request.get_json(silent=True) or {}
    daily_session_id = data.get("daily_session_id")

    today = datetime.now(timezone.utc).date()

    if daily_session_id is not None:
        daily_session = DailySession.query.get(daily_session_id)
        if daily_session is None or daily_session.user_id != user_id:
            return jsonify({"msg": "daily_session not found"}), 404
    else:
        daily_session = _get_or_create_day_session(user_id=user_id, session_date=today)

    # Conecta goal con sesión si no está ya
    link = DailySessionGoal.query.filter_by(
        daily_session_id=daily_session.id,
        goal_id=goal.id
    ).first()
    if link is None:
        link = DailySessionGoal(daily_session_id=daily_session.id, goal_id=goal.id)
        db.session.add(link)

    did_award = False
    reward = int(goal.points_reward or 0)

    # Evitar doble recompensa: si ya tiene completed_at, no se vuelve a sumar
    if goal.completed_at is None:
        goal.completed_at = datetime.now(timezone.utc)
        daily_session.points_earned = int(daily_session.points_earned or 0) + reward
        did_award = True

    db.session.commit()

    return jsonify({
        "goal": goal.serialize(),
        "daily_session": daily_session.serialize(),
        "awarded_points": reward if did_award else 0
    }), 200