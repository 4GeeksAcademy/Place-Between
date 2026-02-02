import os
import requests

LOOPS_API_KEY = os.getenv("LOOPS_API_KEY")
LOOPS_BASE_URL = "https://app.loops.so/api/v1"
url_Frontend = os.getenv('VITE_FRONTEND_URL') + "auth/login"


class LoopsError(Exception):
    pass


def _headers():
    if not LOOPS_API_KEY:
        raise LoopsError("Falta LOOPS_API_KEY en el .env")
    return {
        "Authorization": f"Bearer {LOOPS_API_KEY}",
        "Content-Type": "application/json"
    }


def send_welcome_transactional(email: str, transactional_id: str, data: str | None = None) -> None:
    payload = {
        "transactionalId": transactional_id,
        "email": email,
        "dataVariables": {
            "first_name": data,
            "url_login": url_Frontend 
        }
    }

    r = requests.post(
        f"{LOOPS_BASE_URL}/transactional",
        headers=_headers(),
        json=payload,
        timeout=10
    )

    if r.status_code >= 400:
        raise LoopsError(
            f"Loops transactional error {r.status_code}: {r.text}")