import os
import inspect
from flask_admin import Admin, BaseView, expose
from . import models
from .models import db
from flask_admin.contrib.sqla import ModelView
from flask_admin.theme import Bootstrap4Theme
from flask import request, redirect, url_for, flash
import requests


class DevToolsView(BaseView):
    @expose("/")
    def index(self):
        return self.render("admin/devtools.html")

    @expose("/seed-activities", methods=["POST"])
    def seed_activities(self):
        base = request.host_url.rstrip("/")
        r = requests.post(f"{base}/api/dev/seed/activities/presets")
        if r.ok:
            flash(f"Seed Activities OK: {r.json()}", "success")
        else:
            flash(f"Seed Activities ERROR: {r.text}", "error")
        return redirect(url_for(".index"))

    @expose("/seed-goal-templates", methods=["POST"])
    def seed_goal_templates(self):
        base = request.host_url.rstrip("/")
        r = requests.post(f"{base}/api/dev/seed/goals/templates/presets")
        if r.ok:
            flash(f"Seed Goal Templates OK: {r.json()}", "success")
        else:
            flash(f"Seed Goal Templates ERROR: {r.text}", "error")
        return redirect(url_for(".index"))


def setup_admin(app):
    app.secret_key = os.environ.get('FLASK_APP_KEY', 'sample key')
    admin = Admin(app, name='4Geeks Admin',
                  theme=Bootstrap4Theme(swatch='cerulean'))

    # Dynamically add all models to the admin interface
    for name, obj in inspect.getmembers(models):
        # Verify that the object is a SQLAlchemy model before adding it to the admin.
        if inspect.isclass(obj) and issubclass(obj, db.Model):
            admin.add_view(ModelView(obj, db.session))

    admin.add_view(DevToolsView(name="Dev Tools", endpoint="devtools"))