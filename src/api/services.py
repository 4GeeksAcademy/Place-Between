# importar en routes para poder reutilizar

def send_email(user, reminder):
    print(f"Sending email to {user.email} about {reminder.reminder_type}")
