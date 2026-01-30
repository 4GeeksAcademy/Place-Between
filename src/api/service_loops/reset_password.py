import os
import requests

def send_password_reset(email: str, reset_url: str) -> None:
    loops_api_key = os.getenv("LOOPS_API_KEY")
    LOOPS_PASSWORD_RESET_TRANSACTIONAL_ID = os.getenv("LOOPS_PASSWORD_RESET_TRANSACTIONAL_ID")

    if not loops_api_key:
        raise RuntimeError("Falta LOOPS_API_KEY en el .env")
    if not LOOPS_PASSWORD_RESET_TRANSACTIONAL_ID:
        raise RuntimeError("Falta LOOPS_PASSWORD_RESET_TRANSACTIONAL_ID en el .env")

    url = "https://app.loops.so/api/v1/transactional"
    headers = {
        "Authorization": f"Bearer {loops_api_key}",
        "Content-Type": "application/json",
    }

    payload = {
        "transactionalId": LOOPS_PASSWORD_RESET_TRANSACTIONAL_ID,
        "email": email,
        "dataVariables": {
            "reset": reset_url
        }
    }

    r = requests.post(url, json=payload, headers=headers, timeout=15)
    r.raise_for_status()
    return r.json()