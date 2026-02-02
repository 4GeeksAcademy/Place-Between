import os
import requests

LOOPS_BASE_URL = "https://app.loops.so/api/v1"

class LoopsError(Exception):
    pass

def _headers():
    api_key = os.getenv("LOOPS_API_KEY")
    if not api_key:
        raise LoopsError("Falta LOOPS_API_KEY en el .env")
    return {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json"
    }

def send_welcome_transactional(email: str, transactional_id: str, data: str | None = None) -> None:
    frontend_base = (os.getenv("VITE_FRONTEND_URL") or "").rstrip("/")
    url_frontend_login = f"{frontend_base}/auth/login"

    payload = {
        "transactionalId": transactional_id,
        "email": email,
        "dataVariables": {
            "first_name": data,
            "url_login": url_frontend_login
        }
    }

    r = requests.post(
        f"{LOOPS_BASE_URL}/transactional",
        headers=_headers(),
        json=payload,
        timeout=10
    )

    if r.status_code >= 400:
        raise LoopsError(f"Loops transactional error {r.status_code}: {r.text}")
