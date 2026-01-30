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

def send_verify_email(email: str, transactional_id: str, username: str, url_verify: str) -> None:
    payload = {
        "transactionalId": transactional_id,
        "email": email,
        "dataVariables": {
            "username": username,
            "url_verify": url_verify
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