import os
import requests

LOOPS_BASE_URL = "https://app.loops.so/api/v1"


class LoopsError(Exception):
    pass


def send_inactive_reminder(email: str, username: str, url_app: str) -> None:
    api_key = os.getenv("LOOPS_API_KEY")
    transactional_id = os.getenv("LOOPS_INACTIVE_NUDGE_TRANSACTIONAL_ID")

    if not api_key:
        raise LoopsError("Falta LOOPS_API_KEY en el .env")

    if not transactional_id:
        raise LoopsError("Falta LOOPS_INACTIVE_NUDGE_TRANSACTIONAL_ID en el .env")

    payload = {
        "transactionalId": transactional_id,
        "email": email,
        "dataVariables": {
            "username": username,
            "url_app": url_app,
        },
    }

    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
    }

    r = requests.post(
        f"{LOOPS_BASE_URL}/transactional",
        headers=headers,
        json=payload,
        timeout=10,
    )

    if r.status_code >= 400:
        raise LoopsError(
            f"Loops inactive reminder error {r.status_code}: {r.text}"
        )