from flask_sqlalchemy import SQLAlchemy
from sqlalchemy import String, Boolean, Integer, Time, DateTime, Date, ForeignKey, UniqueConstraint, Index, CheckConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship
import enum
from datetime import datetime, date, time, timezone
from sqlalchemy import Enum as SAEnum
from werkzeug.security import generate_password_hash, check_password_hash


db = SQLAlchemy()

# ENUMS


class SessionType(enum.Enum):
    day = "day"
    night = "night"


class ActivityType(enum.Enum):
    day = "day"
    night = "night"
    both = "both"


class GoalSize(enum.Enum):
    small = "small"
    medium = "medium"
    large = "large"


class SessionGoalStatus(enum.Enum):
    active = "active"
    done = "done"
    skipped = "skipped"


class ReminderType(enum.Enum):
    welcome = "welcome"
    goal_daily = "goal_daily"
    activity_daily = "activity_daily"
    inactive_nudge = "inactive_nudge"
    day_session = "day_session"
    night_session = "night_session"


class ReminderMode(enum.Enum):
    fixed = "fixed"
    inactivity = "inactivity"


# USER

class User(db.Model):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)

    email: Mapped[str] = mapped_column(
        String(120), unique=True, nullable=False, index=True)
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    username: Mapped[str] = mapped_column(
        String(80), unique=True, nullable=False, index=True)

    # Zona horaria IANA: "Europe/Lisbon", "America/Lima", etc.
    timezone: Mapped[str] = mapped_column(
        String(64), nullable=False, default="UTC")

    # Reglas por usuario:
    # - Día empieza 06:00
    # - Noche empieza 19:00
    day_start_time: Mapped[time] = mapped_column(
        Time, nullable=False, default=time(6, 0))
    night_start_time: Mapped[time] = mapped_column(
        Time, nullable=False, default=time(19, 0))

    is_email_verified: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False)
    email_verified_at: Mapped[datetime | None] = mapped_column(
        DateTime, nullable=True)

    emails_enabled: Mapped[bool] = mapped_column(
        Boolean, nullable=True, default=True
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime, nullable=False, default=datetime.utcnow)
    last_login_at: Mapped[datetime | None] = mapped_column(
        DateTime, nullable=True)
    last_activity_at: Mapped[datetime | None] = mapped_column(
        DateTime, nullable=True)

    welcome_email_sent_at: Mapped[datetime |
                                  None] = mapped_column(DateTime, nullable=True)

    # Relationships
    sessions: Mapped[list["DailySession"]] = relationship(
        back_populates="user", cascade="all, delete-orphan"
    )
    goals: Mapped[list["Goal"]] = relationship(
        back_populates="user", cascade="all, delete-orphan"
    )
    reminders: Mapped[list["Reminder"]] = relationship(
        back_populates="user", cascade="all, delete-orphan"
    )

    def serialize(self):
        return {
            "id": self.id,
            "email": self.email,
            "username": self.username,
            "timezone": self.timezone,
            "day_start_time": self.day_start_time.strftime("%H:%M"),
            "night_start_time": self.night_start_time.strftime("%H:%M"),
            "is_email_verified": self.is_email_verified,
            "created_at": self.created_at.isoformat() + "Z",
            "last_login_at": self.last_login_at.isoformat() + "Z" if self.last_login_at else None,
            "last_activity_at": self.last_activity_at.isoformat() + "Z" if self.last_activity_at else None,
            "emails_enabled": self.emails_enabled,
        }

    def set_password(self, password: str):
        self.password_hash = generate_password_hash(password)

    def check_password(self, password: str) -> bool:
        return check_password_hash(self.password_hash, password)

# DAILY SESSION


class DailySession(db.Model):
    __tablename__ = "daily_sessions"
    __table_args__ = (
        UniqueConstraint("user_id", "session_date",
                         "session_type", name="uq_session_user_date_type"),
        Index("ix_daily_sessions_user_date", "user_id", "session_date"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)

    user_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )

    session_date: Mapped[datetime.date] = mapped_column(Date, nullable=False)
    session_type: Mapped[SessionType] = mapped_column(
        SAEnum(SessionType), nullable=False)

    # Total puntos ganados en ESA sesión
    points_earned: Mapped[int] = mapped_column(
        Integer, nullable=False, default=0)

    is_active: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime, nullable=False, default=datetime.utcnow)

    # Relationships
    user: Mapped["User"] = relationship(back_populates="sessions")
    emotion_checkins: Mapped[list["EmotionCheckin"]] = relationship(
        back_populates="daily_session", cascade="all, delete-orphan"
    )
    activity_completions: Mapped[list["ActivityCompletion"]] = relationship(
        back_populates="daily_session", cascade="all, delete-orphan"
    )
    session_goals: Mapped[list["DailySessionGoal"]] = relationship(
        back_populates="daily_session", cascade="all, delete-orphan"
    )

    def serialize(self):
        return {
            "id": self.id,
            "user_id": self.user_id,
            "session_date": self.session_date.isoformat(),
            "session_type": self.session_type.value,
            "points_earned": self.points_earned,
            "is_active": self.is_active,
            "created_at": self.created_at.isoformat() + "Z",
        }

# EMOTION y CHECKINS


class Emotion(db.Model):
    __tablename__ = "emotions"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String(80), unique=True, nullable=False)
    description: Mapped[str | None] = mapped_column(String(255), nullable=True)
    value: Mapped[int | None] = mapped_column(Integer, nullable=True)
    url_music: Mapped[str | None] = mapped_column(String(500), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime, nullable=False, default=datetime.utcnow)

    checkins: Mapped[list["EmotionCheckin"]
                     ] = relationship(back_populates="emotion")

    def serialize(self):
        return {
            "id": self.id,
            "name": self.name,
            "description": self.description,
            "value": self.value,
            "url_music": self.url_music,
        }


class EmotionCheckin(db.Model):
    __tablename__ = "emotion_checkins"
    __table_args__ = (
        Index("ix_emotion_checkins_session", "daily_session_id"),
        Index("ix_emotion_checkins_emotion", "emotion_id"),
        CheckConstraint(
            "intensity >= 1 AND intensity <= 10",
            name="ck_emotion_checkin_intensity_range"
        ),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)

    daily_session_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("daily_sessions.id", ondelete="CASCADE"), nullable=False
    )
    emotion_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("emotions.id"), nullable=False
    )

    intensity: Mapped[int | None] = mapped_column(Integer, nullable=True)

    note: Mapped[str | None] = mapped_column(String(300), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime, nullable=False, default=datetime.utcnow)

    daily_session: Mapped["DailySession"] = relationship(
        back_populates="emotion_checkins")
    emotion: Mapped["Emotion"] = relationship(back_populates="checkins")

    def serialize(self):
        return {
            "id": self.id,
            "daily_session_id": self.daily_session_id,
            "emotion_id": self.emotion_id,
            "intensity": self.intensity,
            "note": self.note,
            "created_at": self.created_at.isoformat() + "Z",
        }


class ActivityCategory(db.Model):
    __tablename__ = "activity_categories"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String(80), unique=True, nullable=False)
    description: Mapped[str | None] = mapped_column(String(255), nullable=True)

    activities: Mapped[list["Activity"]] = relationship(
        back_populates="category")

    def serialize(self):
        return {"id": self.id, "name": self.name, "description": self.description}

    def __repr__(self):
        return f"{self.name}"


class Activity(db.Model):
    __tablename__ = "activities"
    __table_args__ = (Index("ix_activities_category", "category_id"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)

    # ID que viene del frontend (activities.js)
    external_id: Mapped[str] = mapped_column(
        String(120),
        unique=True,
        nullable=False,
        index=True
    )

    category_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("activity_categories.id"), nullable=False
    )

    name: Mapped[str] = mapped_column(String(120), nullable=False)
    description: Mapped[str | None] = mapped_column(String(255), nullable=True)

    # Para scoring (day/night/both)
    activity_type: Mapped[ActivityType] = mapped_column(
        SAEnum(ActivityType), nullable=False, default=ActivityType.both
    )

    is_active: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=True)

    category: Mapped["ActivityCategory"] = relationship(
        back_populates="activities")
    completions: Mapped[list["ActivityCompletion"]
                        ] = relationship(back_populates="activity")

    def serialize(self):
        return {
            "id": self.id,
            "external_id": self.external_id,
            "category_id": self.category_id,
            "name": self.name,
            "description": self.description,
            "activity_type": self.activity_type.value,
            "is_active": self.is_active,
        }

    def __repr__(self):
        return f"{self.name}"
 # ACTIVITIES + CATEGORIES + COMPLETIONS


class ActivityCompletion(db.Model):
    __tablename__ = "activity_completions"
    __table_args__ = (
        Index("ix_activity_completions_session", "daily_session_id"),
        Index("ix_activity_completions_activity", "activity_id"),
        UniqueConstraint(
            "daily_session_id",
            "activity_id",
            name="uq_session_activity"
        ),
        CheckConstraint("points_awarded IN (0, 5, 10, 20)",
                        name="ck_activity_points"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)

    daily_session_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("daily_sessions.id", ondelete="CASCADE"), nullable=False
    )
    activity_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("activities.id"), nullable=False
    )

    # Guardas el resultado final: 20 / 10 / 5
    # - 0 si ya se alcanzó el límite de 3 actividades con puntos en esa sesión
    points_awarded: Mapped[int] = mapped_column(
        Integer, nullable=False, default=0)

    completed_at: Mapped[datetime] = mapped_column(
        DateTime, nullable=False, default=datetime.utcnow)

    daily_session: Mapped["DailySession"] = relationship(
        back_populates="activity_completions")
    activity: Mapped["Activity"] = relationship(back_populates="completions")

    def serialize(self):
        return {
            "id": self.id,
            "daily_session_id": self.daily_session_id,
            "activity_id": self.activity_id,
            "points_awarded": self.points_awarded,
            "completed_at": self.completed_at.isoformat() + "Z",
        }

# GOALS  SESSIONLINK  PROGRESS


class Goal(db.Model):
    __tablename__ = "goals"
    __table_args__ = (
        Index("ix_goals_user", "user_id"),
        CheckConstraint("target_value >= 0", name="ck_goal_target_nonneg"),
        CheckConstraint("current_value >= 0", name="ck_goal_current_nonneg"),
        CheckConstraint("points_reward >= 0", name="ck_goal_points_nonneg"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)

    user_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )

    title: Mapped[str] = mapped_column(String(120), nullable=False)
    description: Mapped[str | None] = mapped_column(String(255), nullable=True)

    # Compat con routes.py (y tu checkpoint)
    goal_type: Mapped[str] = mapped_column(
        String(40), nullable=False, default="custom")
    frequency: Mapped[str] = mapped_column(
        String(20), nullable=False, default="flexible")
    start_date: Mapped[date |
                       None] = mapped_column(Date, nullable=True)
    end_date: Mapped[date | None] = mapped_column(Date, nullable=True)

    size: Mapped[GoalSize] = mapped_column(
        SAEnum(GoalSize), nullable=False, default=GoalSize.medium)

    target_value: Mapped[int] = mapped_column(Integer, nullable=False)
    current_value: Mapped[int] = mapped_column(
        Integer, nullable=False, default=0)

    points_reward: Mapped[int] = mapped_column(
        Integer, nullable=False, default=0)

    is_active: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=True)
    completed_at: Mapped[datetime | None] = mapped_column(
        DateTime, nullable=True)

    created_at: Mapped[datetime] = mapped_column(
        DateTime, nullable=False, default=datetime.utcnow)

    user: Mapped["User"] = relationship(back_populates="goals")
    session_links: Mapped[list["DailySessionGoal"]] = relationship(
        back_populates="goal", cascade="all, delete-orphan"
    )
    progress_entries: Mapped[list["GoalProgress"]] = relationship(
        back_populates="goal", cascade="all, delete-orphan"
    )

    def serialize(self):
        return {
            "id": self.id,
            "user_id": self.user_id,
            "title": self.title,
            "description": self.description,

            "goal_type": self.goal_type,
            "frequency": self.frequency,
            "start_date": self.start_date.isoformat() if self.start_date else None,
            "end_date": self.end_date.isoformat() if self.end_date else None,

            "size": self.size.value,
            "target_value": self.target_value,
            "current_value": self.current_value,
            "points_reward": int(self.points_reward or 0),

            "is_active": self.is_active,
            "completed_at": self.completed_at.isoformat() + "Z" if self.completed_at else None,
            "created_at": self.created_at.isoformat() + "Z",
        }


class GoalCategory(db.Model):
    __tablename__ = "goal_categories"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(
        String(80), unique=True, nullable=False, index=True)
    description: Mapped[str | None] = mapped_column(String(255), nullable=True)

    def serialize(self):
        return {"id": self.id, "name": self.name, "description": self.description}


class GoalTemplate(db.Model):
    __tablename__ = "goal_templates"
    __table_args__ = (
        Index("ix_goal_templates_category", "category_id"),
        Index("ix_goal_templates_size", "size"),
        Index("ix_goal_templates_frequency", "frequency"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)

    # “id” estable del front (como external_id en activities)
    external_id: Mapped[str] = mapped_column(
        String(120), unique=True, nullable=False, index=True)

    category_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("goal_categories.id"), nullable=False
    )

    title: Mapped[str] = mapped_column(String(120), nullable=False)
    description: Mapped[str | None] = mapped_column(String(255), nullable=True)

    # daily / weekly / monthly
    frequency: Mapped[str] = mapped_column(
        String(20), nullable=False, default="daily")

    size: Mapped[GoalSize] = mapped_column(
        SAEnum(GoalSize), nullable=False, default=GoalSize.small)

    target_value: Mapped[int] = mapped_column(
        Integer, nullable=False, default=1)
    points_reward: Mapped[int] = mapped_column(
        Integer, nullable=False, default=5)

    is_active: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime, nullable=False, default=datetime.utcnow)

    category: Mapped["GoalCategory"] = relationship()

    def serialize(self):
        return {
            "id": self.id,
            "external_id": self.external_id,
            "category_id": self.category_id,
            "title": self.title,
            "description": self.description,
            "frequency": self.frequency,
            "size": self.size.value,
            "target_value": self.target_value,
            "points_reward": self.points_reward,
            "is_active": self.is_active,
        }


class DailySessionGoal(db.Model):
    __tablename__ = "daily_session_goals"
    __table_args__ = (
        UniqueConstraint("daily_session_id", "goal_id",
                         name="uq_session_goal"),
        Index("ix_session_goals_session", "daily_session_id"),
        Index("ix_session_goals_goal", "goal_id"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)

    daily_session_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("daily_sessions.id", ondelete="CASCADE"), nullable=False
    )
    goal_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("goals.id", ondelete="CASCADE"), nullable=False
    )

    status: Mapped[SessionGoalStatus] = mapped_column(
        SAEnum(SessionGoalStatus), nullable=False, default=SessionGoalStatus.active
    )
    note: Mapped[str | None] = mapped_column(String(300), nullable=True)

    created_at: Mapped[datetime] = mapped_column(
        DateTime, nullable=False, default=datetime.utcnow)

    daily_session: Mapped["DailySession"] = relationship(
        back_populates="session_goals")
    goal: Mapped["Goal"] = relationship(back_populates="session_links")

    def serialize(self):
        return {
            "id": self.id,
            "daily_session_id": self.daily_session_id,
            "goal_id": self.goal_id,
            "status": self.status.value,
            "note": self.note,
            "created_at": self.created_at.isoformat() + "Z",
        }


class GoalProgress(db.Model):
    __tablename__ = "goal_progress"
    __table_args__ = (
        Index("ix_goal_progress_goal", "goal_id"),
        Index("ix_goal_progress_session", "daily_session_id"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)

    goal_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("goals.id", ondelete="CASCADE"), nullable=False
    )

    daily_session_id: Mapped[int | None] = mapped_column(
        Integer, ForeignKey("daily_sessions.id", ondelete="SET NULL"), nullable=True
    )

    delta_value: Mapped[int] = mapped_column(Integer, nullable=False)
    note: Mapped[str | None] = mapped_column(String(300), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime, nullable=False, default=datetime.utcnow)

    goal: Mapped["Goal"] = relationship(back_populates="progress_entries")

    def serialize(self):
        return {
            "id": self.id,
            "goal_id": self.goal_id,
            "daily_session_id": self.daily_session_id,
            "delta_value": self.delta_value,
            "note": self.note,
            "created_at": self.created_at.isoformat() + "Z",
        }

# REMINDERS (loops)


class Reminder(db.Model):
    __tablename__ = "reminders"
    __table_args__ = (
        Index("ix_reminders_user", "user_id"),
        Index("ix_reminders_user_type_active",
              "user_id", "reminder_type", "is_active"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)

    user_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )

    reminder_type: Mapped[ReminderType] = mapped_column(
        SAEnum(ReminderType), nullable=False)
    mode: Mapped[ReminderMode] = mapped_column(
        SAEnum(ReminderMode), nullable=False)

    # mode=fixed: hora local elegida por el usuario (ej 09:00 o 22:00)
    local_time: Mapped[time | None] = mapped_column(Time, nullable=True)

    # mode=inactivity: minutos sin actividad (ej 1440 = 24h)
    inactive_after_minutes: Mapped[int | None] = mapped_column(
        Integer, nullable=True)

    # simple: "daily" o "mon,tue,wed"
    days_of_week: Mapped[str] = mapped_column(
        String(40), nullable=False, default="daily")

    last_sent_at: Mapped[datetime | None] = mapped_column(
        DateTime, nullable=True)
    is_active: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=True)

    user: Mapped["User"] = relationship(back_populates="reminders")

    def serialize(self):
        return {
            "id": self.id,
            "user_id": self.user_id,
            "reminder_type": self.reminder_type.value,
            "mode": self.mode.value,
            "local_time": self.local_time.strftime("%H:%M") if self.local_time else None,
            "inactive_after_minutes": self.inactive_after_minutes,
            "days_of_week": self.days_of_week,
            "last_sent_at": self.last_sent_at.isoformat() + "Z" if self.last_sent_at else None,
            "is_active": self.is_active,
        }
