from dotenv import load_dotenv
from pathlib import Path

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")

import os
import logging
import uuid
import bcrypt
import jwt
import random
from datetime import datetime, timezone, timedelta, date
from typing import List, Optional, Literal

from fastapi import FastAPI, APIRouter, Depends, HTTPException, Request, Response, Query
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel, Field, EmailStr, ConfigDict

# ----- Config -----
mongo_url = os.environ["MONGO_URL"]
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ["DB_NAME"]]

JWT_SECRET = os.environ["JWT_SECRET"]
JWT_ALGORITHM = "HS256"
ACCESS_TTL_MIN = 60 * 12  # 12h for SaaS comfort
REFRESH_TTL_DAYS = 7

logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(name)s - %(levelname)s - %(message)s")
logger = logging.getLogger("dentalflow")

app = FastAPI(title="DentalFlow AI")
api = APIRouter(prefix="/api")

app.add_middleware(
    CORSMiddleware,
    allow_credentials=False,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# ----- Helpers -----
def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def today_str() -> str:
    return date.today().isoformat()


def hash_password(p: str) -> str:
    return bcrypt.hashpw(p.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def verify_password(p: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(p.encode("utf-8"), hashed.encode("utf-8"))
    except Exception:
        return False


def create_access_token(user_id: str, email: str) -> str:
    payload = {
        "sub": user_id,
        "email": email,
        "exp": datetime.now(timezone.utc) + timedelta(minutes=ACCESS_TTL_MIN),
        "type": "access",
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)


def create_refresh_token(user_id: str) -> str:
    payload = {
        "sub": user_id,
        "exp": datetime.now(timezone.utc) + timedelta(days=REFRESH_TTL_DAYS),
        "type": "refresh",
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)


def set_auth_cookies(response: Response, access: str, refresh: str):
    # Cookies are kept only as a convenience for non-SPA clients. SPA uses Bearer.
    response.set_cookie("access_token", access, httponly=True, secure=True, samesite="none", max_age=ACCESS_TTL_MIN * 60, path="/")
    response.set_cookie("refresh_token", refresh, httponly=True, secure=True, samesite="none", max_age=REFRESH_TTL_DAYS * 86400, path="/")


def clear_auth_cookies(response: Response):
    response.delete_cookie("access_token", path="/")
    response.delete_cookie("refresh_token", path="/")


# ----- Brute-force protection -----
MAX_LOGIN_ATTEMPTS = 5
LOCKOUT_MINUTES = 15


def _client_ip(request: Request) -> str:
    fwd = request.headers.get("x-forwarded-for", "")
    if fwd:
        return fwd.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


async def check_login_lockout(ip: str, email: str):
    """Raise 429 if this (ip,email) pair is currently locked out."""
    key = f"{ip}:{email}"
    rec = await db.login_attempts.find_one({"key": key})
    if not rec:
        return
    locked_until = rec.get("locked_until")
    if locked_until and locked_until > datetime.now(timezone.utc).isoformat():
        remaining = rec.get("attempts", 0)
        raise HTTPException(
            status_code=429,
            detail=f"Troppi tentativi di accesso. Riprova tra {LOCKOUT_MINUTES} minuti.",
            headers={"Retry-After": str(LOCKOUT_MINUTES * 60), "X-Attempts": str(remaining)},
        )


async def register_failed_login(ip: str, email: str):
    key = f"{ip}:{email}"
    rec = await db.login_attempts.find_one({"key": key}) or {"key": key, "attempts": 0}
    attempts = rec.get("attempts", 0) + 1
    update = {
        "key": key,
        "attempts": attempts,
        "last_failed_at": now_iso(),
    }
    if attempts >= MAX_LOGIN_ATTEMPTS:
        update["locked_until"] = (datetime.now(timezone.utc) + timedelta(minutes=LOCKOUT_MINUTES)).isoformat()
    await db.login_attempts.update_one({"key": key}, {"$set": update}, upsert=True)


async def clear_failed_logins(ip: str, email: str):
    await db.login_attempts.delete_one({"key": f"{ip}:{email}"})


def clean_doc(doc: dict) -> dict:
    if not doc:
        return doc
    doc.pop("_id", None)
    doc.pop("password_hash", None)
    return doc


async def get_current_user(request: Request) -> dict:
    # Bearer header takes precedence; cookie is a fallback only.
    token = None
    auth = request.headers.get("Authorization", "")
    if auth.startswith("Bearer "):
        token = auth[7:].strip() or None
    if not token:
        token = request.cookies.get("access_token")
    if not token:
        raise HTTPException(status_code=401, detail="Non autenticato")
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        if payload.get("type") != "access":
            raise HTTPException(status_code=401, detail="Tipo di token non valido")
        user = await db.users.find_one({"id": payload["sub"]}, {"_id": 0})
        if not user:
            raise HTTPException(status_code=401, detail="Utente non trovato")
        user.pop("password_hash", None)
        return user
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token scaduto")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Token non valido")


def require_roles(*roles):
    async def dep(user: dict = Depends(get_current_user)):
        if user.get("role") not in roles:
            raise HTTPException(status_code=403, detail="Permesso negato")
        return user
    return dep


# ----- Schemas -----
class RegisterIn(BaseModel):
    email: EmailStr
    password: str = Field(min_length=6)
    full_name: str
    studio_name: str
    studio_city: Optional[str] = ""
    studio_phone: Optional[str] = ""


class LoginIn(BaseModel):
    email: EmailStr
    password: str


class InviteIn(BaseModel):
    email: EmailStr
    full_name: str
    role: Literal["admin_studio", "segreteria", "dentista", "amministrazione"]
    password: str = Field(min_length=6)


class PatientIn(BaseModel):
    model_config = ConfigDict(extra="ignore")
    full_name: str
    phone: Optional[str] = ""
    email: Optional[str] = ""
    birth_date: Optional[str] = ""
    notes: Optional[str] = ""
    tags: List[str] = []
    status: Literal["nuovo", "attivo", "in_attesa", "da_richiamare", "inattivo"] = "nuovo"
    no_show_risk: bool = False


class EstimateIn(BaseModel):
    model_config = ConfigDict(extra="ignore")
    patient_id: str
    title: str
    total_amount: float
    status: Literal["bozza", "presentato", "in_attesa", "accettato", "rifiutato", "scaduto"] = "bozza"
    presented_at: Optional[str] = None
    commercial_notes: Optional[str] = ""
    rejection_reason: Optional[str] = ""
    next_followup_date: Optional[str] = None


class AppointmentIn(BaseModel):
    model_config = ConfigDict(extra="ignore")
    patient_id: str
    scheduled_at: str  # ISO
    duration_min: int = 30
    reason: Optional[str] = ""
    status: Literal["programmato", "confermato", "completato", "cancellato", "no_show"] = "programmato"
    notes: Optional[str] = ""


class PaymentIn(BaseModel):
    model_config = ConfigDict(extra="ignore")
    patient_id: str
    estimate_id: Optional[str] = None
    total_amount: float
    paid_amount: float = 0.0
    installments: int = 1
    notes: Optional[str] = ""


class InstallmentPayIn(BaseModel):
    paid: bool = True


class CallLogIn(BaseModel):
    patient_id: str
    outcome: Literal["contattato", "non_risposto", "richiamare", "concluso"]
    notes: Optional[str] = ""
    next_step: Optional[str] = ""
    next_step_date: Optional[str] = None


class TaskIn(BaseModel):
    model_config = ConfigDict(extra="ignore")
    title: str
    patient_id: Optional[str] = None
    due_date: Optional[str] = None
    priority: Literal["bassa", "media", "alta"] = "media"
    done: bool = False


# ----- Follow-up Center schemas -----
REMINDER_CHANNELS = ("whatsapp", "email", "manual")
TEMPLATE_KEYS = ("wa_template_a", "wa_template_b", "email_reminder", "manual_note")
REMINDER_STATUSES = ("sent", "delivered", "read", "replied", "appt_booked", "accepted", "rejected", "no_response")

TEMPLATES = {
    "wa_template_a": {
        "label": "WhatsApp · Amichevole",
        "channel": "whatsapp",
        "subject": None,
        "body": (
            "Ciao {patient_first_name}! 👋 Sono {sender_name} dello studio {studio_name}.\n\n"
            "Volevo ricordarle il preventivo per {estimate_title} ({estimate_amount}€) "
            "che le abbiamo presentato. Se vuole, possiamo fissare una chiacchierata rapida "
            "per chiarire qualsiasi dubbio, senza impegno.\n\nQuando preferisce?"
        ),
    },
    "wa_template_b": {
        "label": "WhatsApp · Diretto",
        "channel": "whatsapp",
        "subject": None,
        "body": (
            "Buongiorno {patient_first_name}, studio {studio_name}.\n\n"
            "Abbiamo ancora disponibilità per iniziare il trattamento preventivato "
            "({estimate_title}, {estimate_amount}€). "
            "Le propongo una visita preliminare gratuita per definire la tempistica.\n\n"
            "Va bene questa settimana o la prossima?"
        ),
    },
    "email_reminder": {
        "label": "Email · Formale",
        "channel": "email",
        "subject": "Promemoria preventivo {estimate_title} — {studio_name}",
        "body": (
            "Gentile {patient_first_name},\n\n"
            "la contattiamo per ricordarle il preventivo per {estimate_title} "
            "(importo {estimate_amount}€) che le abbiamo presentato recentemente.\n\n"
            "Siamo a disposizione per ogni chiarimento. Può rispondere a questa email "
            "oppure contattare la nostra segreteria per fissare una visita preliminare.\n\n"
            "Cordiali saluti,\n{sender_name}\nStudio {studio_name}"
        ),
    },
    "manual_note": {
        "label": "Nota manuale (chiamata / di persona)",
        "channel": "manual",
        "subject": None,
        "body": "Contatto manuale: {notes}",
    },
}


class ReminderIn(BaseModel):
    model_config = ConfigDict(extra="ignore")
    patient_id: str
    estimate_id: Optional[str] = None
    channel: Literal["whatsapp", "email", "manual"]
    template_key: Literal["wa_template_a", "wa_template_b", "email_reminder", "manual_note"]
    message_text: str
    subject: Optional[str] = None


class ReminderStatusIn(BaseModel):
    status: Literal["sent", "delivered", "read", "replied", "appt_booked", "accepted", "rejected", "no_response"]
    outcome_notes: Optional[str] = ""


def render_template(tpl: dict, variables: dict) -> dict:
    out = {
        "subject": (tpl.get("subject") or "").format(**variables) if tpl.get("subject") else None,
        "body": tpl["body"].format(**variables),
    }
    return out


def compute_followup_score(estimate: dict, prior_reminders: list) -> tuple[int, str]:
    """Return (score 0-100, recommended_action_key)."""
    score = 50
    amount = float(estimate.get("total_amount") or 0)
    if amount >= 3000:
        score += 20
    elif amount >= 1500:
        score += 10
    elif amount >= 500:
        score += 3

    status = estimate.get("status")
    if status == "presentato":
        score += 15
    elif status == "in_attesa":
        score += 5

    # Days since presentation
    presented = estimate.get("presented_at")
    if presented:
        try:
            dpres = datetime.fromisoformat(presented).date() if "T" in presented else date.fromisoformat(presented)
            days_since = (date.today() - dpres).days
            if days_since <= 7:
                score += 10
            elif days_since <= 21:
                score += 5
            elif days_since > 45:
                score -= 15
            elif days_since > 30:
                score -= 8
        except Exception:
            pass

    # Due follow-up
    fu = estimate.get("next_followup_date")
    if fu and fu <= today_str():
        score += 10

    # Fatigue: too many prior reminders without response
    no_resp = sum(1 for r in prior_reminders if r.get("status") in ("sent", "delivered", "no_response"))
    positive = sum(1 for r in prior_reminders if r.get("status") in ("replied", "appt_booked", "accepted"))
    score -= min(20, no_resp * 5)
    score += min(15, positive * 5)

    score = max(0, min(100, score))

    # Recommended action by score band + amount + priors
    if score >= 75:
        action = "call_now"
    elif score >= 55:
        action = "send_wa_a"
    elif score >= 35:
        action = "send_wa_b"
    elif score >= 15:
        action = "send_email"
    else:
        action = "archive_or_manual"
    return score, action


RECOMMENDED_ACTION_LABELS = {
    "call_now": "Chiama subito (alta priorità)",
    "send_wa_a": "Invia WhatsApp amichevole",
    "send_wa_b": "Invia WhatsApp diretto",
    "send_email": "Invia email formale",
    "archive_or_manual": "Nota manuale o archivia",
}


# ----- Auth endpoints -----
@api.post("/auth/register")
async def register(body: RegisterIn, response: Response):
    email = body.email.lower().strip()
    if await db.users.find_one({"email": email}):
        raise HTTPException(status_code=400, detail="Email già registrata")

    studio_id = str(uuid.uuid4())
    user_id = str(uuid.uuid4())
    now = now_iso()

    await db.studios.insert_one({
        "id": studio_id,
        "name": body.studio_name,
        "city": body.studio_city or "",
        "phone": body.studio_phone or "",
        "owner_id": user_id,
        "created_at": now,
    })
    await db.users.insert_one({
        "id": user_id,
        "email": email,
        "password_hash": hash_password(body.password),
        "full_name": body.full_name,
        "role": "admin_studio",
        "studio_id": studio_id,
        "created_at": now,
    })

    access = create_access_token(user_id, email)
    refresh = create_refresh_token(user_id)
    set_auth_cookies(response, access, refresh)
    user = await db.users.find_one({"id": user_id}, {"_id": 0, "password_hash": 0})
    return {"user": user, "access_token": access}


@api.post("/auth/login")
async def login(body: LoginIn, request: Request, response: Response):
    email = body.email.lower().strip()
    ip = _client_ip(request)

    # 1) Check lockout first
    await check_login_lockout(ip, email)

    user = await db.users.find_one({"email": email})
    if not user or not verify_password(body.password, user.get("password_hash", "")):
        await register_failed_login(ip, email)
        raise HTTPException(status_code=401, detail="Credenziali non valide")

    # Success: clear attempts, issue token
    await clear_failed_logins(ip, email)
    access = create_access_token(user["id"], email)
    refresh = create_refresh_token(user["id"])
    set_auth_cookies(response, access, refresh)
    return {"user": clean_doc(user), "access_token": access}


@api.post("/auth/logout")
async def logout(response: Response):
    # Idempotent. No auth required — frontend deletes localStorage token independently.
    clear_auth_cookies(response)
    return {"ok": True}


@api.get("/auth/me")
async def me(user: dict = Depends(get_current_user)):
    studio = await db.studios.find_one({"id": user.get("studio_id")}, {"_id": 0})
    return {"user": user, "studio": studio}


@api.post("/auth/invite")
async def invite_member(body: InviteIn, user: dict = Depends(require_roles("admin_studio"))):
    email = body.email.lower().strip()
    if await db.users.find_one({"email": email}):
        raise HTTPException(status_code=400, detail="Email già registrata")
    user_id = str(uuid.uuid4())
    await db.users.insert_one({
        "id": user_id,
        "email": email,
        "password_hash": hash_password(body.password),
        "full_name": body.full_name,
        "role": body.role,
        "studio_id": user["studio_id"],
        "created_at": now_iso(),
    })
    new_user = await db.users.find_one({"id": user_id}, {"_id": 0, "password_hash": 0})
    return new_user


@api.get("/auth/team")
async def list_team(user: dict = Depends(get_current_user)):
    members = await db.users.find({"studio_id": user["studio_id"]}, {"_id": 0, "password_hash": 0}).to_list(500)
    return members


# ----- Patients -----
@api.get("/patients")
async def list_patients(
    user: dict = Depends(get_current_user),
    q: Optional[str] = None,
    status: Optional[str] = None,
):
    query = {"studio_id": user["studio_id"]}
    if status:
        query["status"] = status
    if q:
        query["full_name"] = {"$regex": q, "$options": "i"}
    data = await db.patients.find(query, {"_id": 0}).sort("created_at", -1).to_list(2000)
    return data


@api.post("/patients")
async def create_patient(body: PatientIn, user: dict = Depends(get_current_user)):
    pid = str(uuid.uuid4())
    doc = body.model_dump()
    doc.update({
        "id": pid,
        "studio_id": user["studio_id"],
        "created_at": now_iso(),
        "created_by": user["id"],
    })
    await db.patients.insert_one(doc)
    doc.pop("_id", None)
    return doc


@api.get("/patients/{pid}")
async def get_patient(pid: str, user: dict = Depends(get_current_user)):
    p = await db.patients.find_one({"id": pid, "studio_id": user["studio_id"]}, {"_id": 0})
    if not p:
        raise HTTPException(404, "Paziente non trovato")
    appts = await db.appointments.find({"patient_id": pid, "studio_id": user["studio_id"]}, {"_id": 0}).sort("scheduled_at", -1).to_list(200)
    ests = await db.estimates.find({"patient_id": pid, "studio_id": user["studio_id"]}, {"_id": 0}).sort("created_at", -1).to_list(200)
    pays = await db.payments.find({"patient_id": pid, "studio_id": user["studio_id"]}, {"_id": 0}).sort("created_at", -1).to_list(200)
    for pay in pays:
        pay["installments_list"] = await db.installments.find({"payment_id": pay["id"]}, {"_id": 0}).sort("due_date", 1).to_list(200)
    logs = await db.call_logs.find({"patient_id": pid, "studio_id": user["studio_id"]}, {"_id": 0}).sort("created_at", -1).to_list(200)
    return {"patient": p, "appointments": appts, "estimates": ests, "payments": pays, "call_logs": logs}


@api.put("/patients/{pid}")
async def update_patient(pid: str, body: PatientIn, user: dict = Depends(get_current_user)):
    await db.patients.update_one({"id": pid, "studio_id": user["studio_id"]}, {"$set": body.model_dump()})
    p = await db.patients.find_one({"id": pid}, {"_id": 0})
    if not p:
        raise HTTPException(404, "Paziente non trovato")
    return p


@api.delete("/patients/{pid}")
async def delete_patient(pid: str, user: dict = Depends(require_roles("admin_studio", "segreteria"))):
    await db.patients.delete_one({"id": pid, "studio_id": user["studio_id"]})
    return {"ok": True}


# ----- Estimates -----
@api.get("/estimates")
async def list_estimates(user: dict = Depends(get_current_user), status: Optional[str] = None):
    q = {"studio_id": user["studio_id"]}
    if status:
        q["status"] = status
    rows = await db.estimates.find(q, {"_id": 0}).sort("created_at", -1).to_list(2000)
    # attach patient
    for r in rows:
        p = await db.patients.find_one({"id": r["patient_id"]}, {"_id": 0, "full_name": 1})
        r["patient_name"] = p["full_name"] if p else "—"
    return rows


@api.post("/estimates")
async def create_estimate(body: EstimateIn, user: dict = Depends(get_current_user)):
    eid = str(uuid.uuid4())
    doc = body.model_dump()
    doc.update({"id": eid, "studio_id": user["studio_id"], "created_at": now_iso(), "created_by": user["id"]})
    await db.estimates.insert_one(doc)
    doc.pop("_id", None)
    return doc


@api.put("/estimates/{eid}")
async def update_estimate(eid: str, body: EstimateIn, user: dict = Depends(get_current_user)):
    await db.estimates.update_one({"id": eid, "studio_id": user["studio_id"]}, {"$set": body.model_dump()})
    e = await db.estimates.find_one({"id": eid}, {"_id": 0})
    if not e:
        raise HTTPException(404, "Preventivo non trovato")
    return e


@api.delete("/estimates/{eid}")
async def delete_estimate(eid: str, user: dict = Depends(get_current_user)):
    await db.estimates.delete_one({"id": eid, "studio_id": user["studio_id"]})
    return {"ok": True}


@api.get("/estimates/followups/today")
async def today_followups(user: dict = Depends(get_current_user)):
    today = today_str()
    rows = await db.estimates.find({
        "studio_id": user["studio_id"],
        "next_followup_date": {"$lte": today},
        "status": {"$in": ["presentato", "in_attesa"]},
    }, {"_id": 0}).to_list(500)
    for r in rows:
        p = await db.patients.find_one({"id": r["patient_id"]}, {"_id": 0, "full_name": 1, "phone": 1})
        r["patient_name"] = p.get("full_name") if p else "—"
        r["patient_phone"] = p.get("phone") if p else ""
    return rows


# ----- Appointments -----
@api.get("/appointments")
async def list_appointments(user: dict = Depends(get_current_user), date_from: Optional[str] = None, date_to: Optional[str] = None):
    q = {"studio_id": user["studio_id"]}
    if date_from or date_to:
        q["scheduled_at"] = {}
        if date_from:
            q["scheduled_at"]["$gte"] = date_from
        if date_to:
            q["scheduled_at"]["$lte"] = date_to
    rows = await db.appointments.find(q, {"_id": 0}).sort("scheduled_at", 1).to_list(2000)
    for r in rows:
        p = await db.patients.find_one({"id": r["patient_id"]}, {"_id": 0, "full_name": 1, "phone": 1, "no_show_risk": 1})
        r["patient_name"] = p["full_name"] if p else "—"
        r["patient_phone"] = p.get("phone", "") if p else ""
        r["no_show_risk"] = bool(p.get("no_show_risk")) if p else False
    return rows


@api.post("/appointments")
async def create_appointment(body: AppointmentIn, user: dict = Depends(get_current_user)):
    aid = str(uuid.uuid4())
    doc = body.model_dump()
    doc.update({"id": aid, "studio_id": user["studio_id"], "created_at": now_iso(), "created_by": user["id"]})
    await db.appointments.insert_one(doc)
    doc.pop("_id", None)
    return doc


@api.put("/appointments/{aid}")
async def update_appointment(aid: str, body: AppointmentIn, user: dict = Depends(get_current_user)):
    await db.appointments.update_one({"id": aid, "studio_id": user["studio_id"]}, {"$set": body.model_dump()})
    a = await db.appointments.find_one({"id": aid}, {"_id": 0})
    if not a:
        raise HTTPException(404, "Appuntamento non trovato")
    # Flag no-show risk on patient if no_show
    if a["status"] == "no_show":
        await db.patients.update_one({"id": a["patient_id"]}, {"$set": {"no_show_risk": True}})
    return a


@api.delete("/appointments/{aid}")
async def delete_appointment(aid: str, user: dict = Depends(get_current_user)):
    await db.appointments.delete_one({"id": aid, "studio_id": user["studio_id"]})
    return {"ok": True}


# ----- Payments & Installments -----
@api.get("/payments")
async def list_payments(user: dict = Depends(get_current_user)):
    rows = await db.payments.find({"studio_id": user["studio_id"]}, {"_id": 0}).sort("created_at", -1).to_list(2000)
    for r in rows:
        p = await db.patients.find_one({"id": r["patient_id"]}, {"_id": 0, "full_name": 1})
        r["patient_name"] = p["full_name"] if p else "—"
        r["installments_list"] = await db.installments.find({"payment_id": r["id"]}, {"_id": 0}).sort("due_date", 1).to_list(200)
    return rows


@api.post("/payments")
async def create_payment(body: PaymentIn, user: dict = Depends(get_current_user)):
    pid = str(uuid.uuid4())
    doc = body.model_dump()
    doc.update({"id": pid, "studio_id": user["studio_id"], "created_at": now_iso(), "created_by": user["id"]})
    await db.payments.insert_one(doc)
    # create installments evenly spaced monthly
    if body.installments > 0:
        per = round(body.total_amount / body.installments, 2)
        start = date.today()
        for i in range(body.installments):
            due = (start + timedelta(days=30 * (i + 1))).isoformat()
            await db.installments.insert_one({
                "id": str(uuid.uuid4()),
                "payment_id": pid,
                "studio_id": user["studio_id"],
                "number": i + 1,
                "amount": per,
                "due_date": due,
                "paid": False,
                "paid_at": None,
            })
    doc.pop("_id", None)
    return doc


@api.put("/installments/{iid}/pay")
async def pay_installment(iid: str, body: InstallmentPayIn, user: dict = Depends(get_current_user)):
    inst = await db.installments.find_one({"id": iid, "studio_id": user["studio_id"]})
    if not inst:
        raise HTTPException(404, "Rata non trovata")
    await db.installments.update_one({"id": iid}, {"$set": {"paid": body.paid, "paid_at": now_iso() if body.paid else None}})
    # recompute payment paid_amount
    paid_amt = 0
    async for i in db.installments.find({"payment_id": inst["payment_id"], "paid": True}):
        paid_amt += i["amount"]
    await db.payments.update_one({"id": inst["payment_id"]}, {"$set": {"paid_amount": round(paid_amt, 2)}})
    return {"ok": True}


@api.get("/payments/overdue")
async def overdue_payments(user: dict = Depends(get_current_user)):
    today = today_str()
    rows = await db.installments.find({
        "studio_id": user["studio_id"],
        "paid": False,
        "due_date": {"$lt": today},
    }, {"_id": 0}).sort("due_date", 1).to_list(500)
    for r in rows:
        pay = await db.payments.find_one({"id": r["payment_id"]}, {"_id": 0})
        if pay:
            pat = await db.patients.find_one({"id": pay["patient_id"]}, {"_id": 0, "full_name": 1, "phone": 1})
            r["patient_name"] = pat.get("full_name") if pat else "—"
            r["patient_phone"] = pat.get("phone") if pat else ""
            r["patient_id"] = pay["patient_id"]
    return rows


# ----- Call logs -----
@api.post("/call-logs")
async def create_call_log(body: CallLogIn, user: dict = Depends(get_current_user)):
    lid = str(uuid.uuid4())
    doc = body.model_dump()
    doc.update({"id": lid, "studio_id": user["studio_id"], "created_at": now_iso(), "created_by": user["id"], "created_by_name": user.get("full_name", "")})
    await db.call_logs.insert_one(doc)
    doc.pop("_id", None)
    return doc


# ----- Tasks -----
@api.get("/tasks")
async def list_tasks(user: dict = Depends(get_current_user), only_open: bool = False):
    q = {"studio_id": user["studio_id"]}
    if only_open:
        q["done"] = False
    rows = await db.tasks.find(q, {"_id": 0}).sort("due_date", 1).to_list(500)
    for r in rows:
        if r.get("patient_id"):
            p = await db.patients.find_one({"id": r["patient_id"]}, {"_id": 0, "full_name": 1})
            r["patient_name"] = p.get("full_name") if p else ""
    return rows


@api.post("/tasks")
async def create_task(body: TaskIn, user: dict = Depends(get_current_user)):
    tid = str(uuid.uuid4())
    doc = body.model_dump()
    doc.update({"id": tid, "studio_id": user["studio_id"], "created_at": now_iso(), "created_by": user["id"]})
    await db.tasks.insert_one(doc)
    doc.pop("_id", None)
    return doc


@api.put("/tasks/{tid}")
async def update_task(tid: str, body: TaskIn, user: dict = Depends(get_current_user)):
    await db.tasks.update_one({"id": tid, "studio_id": user["studio_id"]}, {"$set": body.model_dump()})
    t = await db.tasks.find_one({"id": tid}, {"_id": 0})
    if not t:
        raise HTTPException(404, "Task non trovata")
    return t


@api.delete("/tasks/{tid}")
async def delete_task(tid: str, user: dict = Depends(get_current_user)):
    await db.tasks.delete_one({"id": tid, "studio_id": user["studio_id"]})
    return {"ok": True}


# ----- Dashboard -----
@api.get("/dashboard")
async def dashboard(user: dict = Depends(get_current_user)):
    sid = user["studio_id"]
    today = today_str()
    tomorrow = (date.today() + timedelta(days=1)).isoformat()
    start_month = date.today().replace(day=1).isoformat()

    # KPIs
    estimates_all = await db.estimates.find({"studio_id": sid}, {"_id": 0}).to_list(5000)
    open_estimates = [e for e in estimates_all if e["status"] in ("presentato", "in_attesa")]
    accepted_estimates = [e for e in estimates_all if e["status"] == "accettato"]
    lost_estimates = [e for e in estimates_all if e["status"] == "rifiutato"]
    stalled_estimates = [e for e in estimates_all if e["status"] == "in_attesa"]

    total_open_value = round(sum(e["total_amount"] for e in open_estimates), 2)
    total_accepted_value = round(sum(e["total_amount"] for e in accepted_estimates), 2)
    total_lost_value = round(sum(e["total_amount"] for e in lost_estimates), 2)

    appts_today = await db.appointments.find({
        "studio_id": sid,
        "scheduled_at": {"$gte": today, "$lt": tomorrow},
    }, {"_id": 0}).sort("scheduled_at", 1).to_list(200)
    for a in appts_today:
        p = await db.patients.find_one({"id": a["patient_id"]}, {"_id": 0, "full_name": 1, "phone": 1, "no_show_risk": 1})
        a["patient_name"] = p["full_name"] if p else "—"
        a["patient_phone"] = p.get("phone", "") if p else ""
        a["no_show_risk"] = bool(p.get("no_show_risk")) if p else False

    appts_month = await db.appointments.count_documents({
        "studio_id": sid,
        "scheduled_at": {"$gte": start_month},
    })
    no_show_month = await db.appointments.count_documents({
        "studio_id": sid,
        "scheduled_at": {"$gte": start_month},
        "status": "no_show",
    })
    no_show_rate = round((no_show_month / appts_month * 100) if appts_month else 0, 1)

    # Follow-ups to call today
    followups = await db.estimates.find({
        "studio_id": sid,
        "next_followup_date": {"$lte": today},
        "status": {"$in": ["presentato", "in_attesa"]},
    }, {"_id": 0}).limit(20).to_list(20)
    for f in followups:
        p = await db.patients.find_one({"id": f["patient_id"]}, {"_id": 0, "full_name": 1, "phone": 1})
        f["patient_name"] = p.get("full_name") if p else "—"
        f["patient_phone"] = p.get("phone") if p else ""

    # Overdue installments
    overdue = await db.installments.find({
        "studio_id": sid,
        "paid": False,
        "due_date": {"$lt": today},
    }, {"_id": 0}).sort("due_date", 1).limit(20).to_list(20)
    for o in overdue:
        pay = await db.payments.find_one({"id": o["payment_id"]}, {"_id": 0})
        if pay:
            pat = await db.patients.find_one({"id": pay["patient_id"]}, {"_id": 0, "full_name": 1, "phone": 1})
            o["patient_name"] = pat.get("full_name") if pat else "—"
            o["patient_phone"] = pat.get("phone") if pat else ""
            o["patient_id"] = pay["patient_id"]
    overdue_total = round(sum(o["amount"] for o in overdue), 2)

    # Tasks today
    tasks_today = await db.tasks.find({
        "studio_id": sid,
        "done": False,
    }, {"_id": 0}).sort("due_date", 1).limit(20).to_list(20)

    patients_count = await db.patients.count_documents({"studio_id": sid})
    to_recall = await db.patients.count_documents({"studio_id": sid, "status": "da_richiamare"})

    return {
        "kpis": {
            "patients_count": patients_count,
            "open_estimates_count": len(open_estimates),
            "open_estimates_value": total_open_value,
            "accepted_estimates_value": total_accepted_value,
            "lost_estimates_value": total_lost_value,
            "stalled_estimates_count": len(stalled_estimates),
            "appts_today_count": len(appts_today),
            "no_show_rate": no_show_rate,
            "overdue_total": overdue_total,
            "overdue_count": len(overdue),
            "to_recall_count": to_recall,
        },
        "appts_today": appts_today,
        "followups": followups,
        "overdue": overdue,
        "tasks_today": tasks_today,
    }


# ----- Search -----
@api.get("/search")
async def search(q: str, user: dict = Depends(get_current_user)):
    if not q or len(q) < 2:
        return {"patients": []}
    patients = await db.patients.find({
        "studio_id": user["studio_id"],
        "$or": [
            {"full_name": {"$regex": q, "$options": "i"}},
            {"phone": {"$regex": q, "$options": "i"}},
            {"email": {"$regex": q, "$options": "i"}},
        ],
    }, {"_id": 0}).limit(20).to_list(20)
    return {"patients": patients}


# Root
@api.get("/")
async def root():
    return {"app": "DentalFlow AI", "status": "ok"}


# ----- Startup: indexes + demo seed -----
DEMO_STUDIO_NAME = "Studio Dentistico Demo"


async def seed_demo():
    if os.environ.get("DEMO_SEED", "false").lower() != "true":
        return
    existing = await db.studios.find_one({"name": DEMO_STUDIO_NAME})
    if existing:
        logger.info("Demo studio already exists, skipping seed")
        # ensure admin password up to date
        admin_email = os.environ.get("ADMIN_EMAIL", "admin@dentalflow.it")
        admin_password = os.environ.get("ADMIN_PASSWORD", "admin123")
        admin = await db.users.find_one({"email": admin_email})
        if admin and not verify_password(admin_password, admin.get("password_hash", "")):
            await db.users.update_one({"email": admin_email}, {"$set": {"password_hash": hash_password(admin_password)}})
        return

    logger.info("Seeding demo studio...")
    studio_id = str(uuid.uuid4())
    now = now_iso()
    admin_id = str(uuid.uuid4())
    admin_email = os.environ.get("ADMIN_EMAIL", "admin@dentalflow.it")
    admin_password = os.environ.get("ADMIN_PASSWORD", "admin123")

    await db.studios.insert_one({
        "id": studio_id, "name": DEMO_STUDIO_NAME, "city": "Milano", "phone": "+39 02 1234567",
        "owner_id": admin_id, "created_at": now,
    })
    users_seed = [
        (admin_id, admin_email, admin_password, "Dr. Marco Rossi", "admin_studio"),
        (str(uuid.uuid4()), "segreteria@dentalflow.it", "Segreteria2026!", "Giulia Bianchi", "segreteria"),
        (str(uuid.uuid4()), "dentista@dentalflow.it", "Dentista2026!", "Dr.ssa Laura Verdi", "dentista"),
        (str(uuid.uuid4()), "amministrazione@dentalflow.it", "Amministrazione2026!", "Paolo Neri", "amministrazione"),
    ]
    for uid, email, pwd, name, role in users_seed:
        await db.users.insert_one({
            "id": uid, "email": email.lower(), "password_hash": hash_password(pwd),
            "full_name": name, "role": role, "studio_id": studio_id, "created_at": now,
        })

    # Patients
    italian_names = [
        "Francesca Romano", "Alessandro Ferrari", "Chiara Conti", "Matteo Ricci",
        "Elena Marino", "Davide Greco", "Sara Bruno", "Luca Galli",
        "Martina Rizzo", "Giovanni De Luca", "Valentina Barbieri", "Simone Costa",
        "Federica Esposito", "Andrea Moretti", "Silvia Lombardi", "Stefano Fontana",
        "Roberta Mancini", "Marco Caruso", "Giorgia Ferri", "Enrico Villa",
    ]
    statuses = ["nuovo", "attivo", "in_attesa", "da_richiamare", "inattivo"]
    patient_ids = []
    for i, name in enumerate(italian_names):
        pid = str(uuid.uuid4())
        patient_ids.append(pid)
        await db.patients.insert_one({
            "id": pid, "studio_id": studio_id,
            "full_name": name,
            "phone": f"+39 3{random.randint(20,99)} {random.randint(1000000,9999999)}",
            "email": f"{name.lower().replace(' ', '.')}@example.it",
            "birth_date": f"19{random.randint(55, 99)}-{random.randint(1,12):02d}-{random.randint(1,28):02d}",
            "notes": random.choice(["", "Paziente fidelizzato", "Allergia alla penicillina", "Da richiamare per igiene", ""]),
            "tags": random.choice([[], ["implantologia"], ["ortodonzia"], ["igiene", "vip"], ["conservativa"]]),
            "status": random.choice(statuses),
            "no_show_risk": i % 7 == 0,
            "created_at": (datetime.now(timezone.utc) - timedelta(days=random.randint(1, 400))).isoformat(),
            "created_by": admin_id,
        })

    # Estimates
    est_titles = [
        ("Piano implantologico completo", 4800),
        ("Ortodonzia invisibile", 3500),
        ("Impianto singolo + corona", 1800),
        ("Igiene + sbiancamento", 350),
        ("Protesi superiore", 2200),
        ("Trattamento canalare + ricostruzione", 650),
        ("Estrazione denti del giudizio", 900),
        ("Faccette estetiche (6)", 4200),
    ]
    est_statuses_weighted = ["presentato", "presentato", "in_attesa", "in_attesa", "accettato", "accettato", "rifiutato", "scaduto", "bozza"]
    rejection_reasons = ["Costo elevato", "Vuole valutare", "Ha scelto altro studio", "Tempi lunghi", ""]

    estimate_ids_accepted = []
    for i in range(22):
        pid = random.choice(patient_ids)
        title, base = random.choice(est_titles)
        status = random.choice(est_statuses_weighted)
        total = base + random.randint(-200, 400)
        next_fu = None
        if status in ("presentato", "in_attesa"):
            days = random.randint(-5, 10)
            next_fu = (date.today() + timedelta(days=days)).isoformat()
        eid = str(uuid.uuid4())
        doc = {
            "id": eid, "studio_id": studio_id, "patient_id": pid,
            "title": title, "total_amount": float(total), "status": status,
            "presented_at": (date.today() - timedelta(days=random.randint(3, 90))).isoformat(),
            "commercial_notes": random.choice(["", "Preferisce rateizzare", "Vuole seconda visita", ""]),
            "rejection_reason": random.choice(rejection_reasons) if status == "rifiutato" else "",
            "next_followup_date": next_fu,
            "created_at": (datetime.now(timezone.utc) - timedelta(days=random.randint(1, 90))).isoformat(),
            "created_by": admin_id,
        }
        await db.estimates.insert_one(doc)
        if status == "accettato":
            estimate_ids_accepted.append((eid, pid, total))

    # Appointments (past week + next two weeks)
    reasons = ["Controllo", "Igiene", "Implantologia step 1", "Ortodonzia check", "Estrazione", "Visita", "Ricostruzione"]
    for i in range(40):
        pid = random.choice(patient_ids)
        offset_days = random.randint(-10, 21)
        hh = random.choice([9, 10, 11, 12, 15, 16, 17, 18])
        mm = random.choice([0, 15, 30, 45])
        dt = datetime.combine(date.today() + timedelta(days=offset_days), datetime.min.time()).replace(hour=hh, minute=mm, tzinfo=timezone.utc)
        if offset_days < 0:
            status = random.choices(["completato", "no_show", "cancellato"], weights=[7, 2, 1])[0]
        elif offset_days == 0:
            status = random.choice(["programmato", "confermato", "confermato"])
        else:
            status = random.choice(["programmato", "programmato", "confermato"])
        await db.appointments.insert_one({
            "id": str(uuid.uuid4()), "studio_id": studio_id, "patient_id": pid,
            "scheduled_at": dt.isoformat(),
            "duration_min": random.choice([30, 45, 60]),
            "reason": random.choice(reasons),
            "status": status, "notes": "",
            "created_at": now, "created_by": admin_id,
        })

    # Payments from accepted estimates
    for eid, pid, total in estimate_ids_accepted:
        pay_id = str(uuid.uuid4())
        inst_count = random.choice([1, 3, 6, 12])
        await db.payments.insert_one({
            "id": pay_id, "studio_id": studio_id, "patient_id": pid, "estimate_id": eid,
            "total_amount": float(total), "paid_amount": 0.0, "installments": inst_count, "notes": "",
            "created_at": now, "created_by": admin_id,
        })
        per = round(total / inst_count, 2)
        start = date.today() - timedelta(days=random.randint(30, 120))
        paid_amt = 0.0
        for n in range(inst_count):
            due = (start + timedelta(days=30 * n)).isoformat()
            paid = False
            if due < today_str() and random.random() < 0.6:
                paid = True
                paid_amt += per
            await db.installments.insert_one({
                "id": str(uuid.uuid4()), "payment_id": pay_id, "studio_id": studio_id,
                "number": n + 1, "amount": per, "due_date": due,
                "paid": paid, "paid_at": now if paid else None,
            })
        await db.payments.update_one({"id": pay_id}, {"$set": {"paid_amount": round(paid_amt, 2)}})

    # Tasks today
    task_titles = [
        "Richiamare Sig.ra Romano per preventivo",
        "Conferma appuntamenti di domani",
        "Sollecito rate scadute Sig. Ferrari",
        "Preparare cartella nuovo paziente",
    ]
    for t in task_titles:
        await db.tasks.insert_one({
            "id": str(uuid.uuid4()), "studio_id": studio_id,
            "title": t, "patient_id": random.choice(patient_ids),
            "due_date": today_str(), "priority": random.choice(["alta", "media"]),
            "done": False, "created_at": now, "created_by": admin_id,
        })

    logger.info("Demo seed completed")


# ----- Follow-up Center endpoints -----
@api.get("/followup-center/templates")
async def list_templates(user: dict = Depends(get_current_user)):
    # Expose templates (static) + studio name so frontend can preview
    studio = await db.studios.find_one({"id": user["studio_id"]}, {"_id": 0}) or {}
    return {
        "templates": [
            {"key": k, "label": v["label"], "channel": v["channel"], "subject": v.get("subject"), "body": v["body"]}
            for k, v in TEMPLATES.items()
        ],
        "recommended_action_labels": RECOMMENDED_ACTION_LABELS,
        "studio_name": studio.get("name", ""),
    }


@api.get("/followup-center/queue")
async def followup_queue(
    user: dict = Depends(get_current_user),
    limit: int = 100,
):
    """Priority list of estimates to follow-up today. Ordered by score desc."""
    sid = user["studio_id"]
    # Open estimates only
    estimates = await db.estimates.find({
        "studio_id": sid,
        "status": {"$in": ["presentato", "in_attesa"]},
    }, {"_id": 0}).to_list(2000)

    # Fetch all reminders for these estimates in one go
    est_ids = [e["id"] for e in estimates]
    all_reminders = await db.reminders.find({
        "studio_id": sid,
        "estimate_id": {"$in": est_ids},
    }, {"_id": 0}).to_list(5000)
    by_est: dict[str, list] = {}
    for r in all_reminders:
        by_est.setdefault(r["estimate_id"], []).append(r)

    # Patients in one batch
    pat_ids = list({e["patient_id"] for e in estimates})
    patients = await db.patients.find({"id": {"$in": pat_ids}}, {"_id": 0}).to_list(5000)
    pat_map = {p["id"]: p for p in patients}

    queue = []
    for e in estimates:
        priors = by_est.get(e["id"], [])
        score, action = compute_followup_score(e, priors)
        pat = pat_map.get(e["patient_id"]) or {}
        last_contact = None
        if priors:
            last_contact = max((r.get("sent_at") for r in priors if r.get("sent_at")), default=None)
        presented = e.get("presented_at")
        days_since = None
        if presented:
            try:
                dpres = datetime.fromisoformat(presented).date() if "T" in presented else date.fromisoformat(presented)
                days_since = (date.today() - dpres).days
            except Exception:
                days_since = None
        queue.append({
            "estimate_id": e["id"],
            "estimate_title": e["title"],
            "estimate_amount": e["total_amount"],
            "estimate_status": e["status"],
            "patient_id": e["patient_id"],
            "patient_name": pat.get("full_name", "—"),
            "patient_phone": pat.get("phone", ""),
            "patient_email": pat.get("email", ""),
            "presented_at": presented,
            "days_since": days_since,
            "next_followup_date": e.get("next_followup_date"),
            "last_contact_at": last_contact,
            "reminders_count": len(priors),
            "score": score,
            "recommended_action": action,
            "recommended_action_label": RECOMMENDED_ACTION_LABELS[action],
        })
    queue.sort(key=lambda x: (-x["score"], x["days_since"] or 999))
    return queue[:limit]


@api.post("/reminders")
async def create_reminder(body: ReminderIn, user: dict = Depends(get_current_user)):
    # Validate patient is in same studio
    pat = await db.patients.find_one({"id": body.patient_id, "studio_id": user["studio_id"]}, {"_id": 0})
    if not pat:
        raise HTTPException(404, "Paziente non trovato")
    if body.estimate_id:
        est = await db.estimates.find_one({"id": body.estimate_id, "studio_id": user["studio_id"]}, {"_id": 0})
        if not est:
            raise HTTPException(404, "Preventivo non trovato")

    rid = str(uuid.uuid4())
    now = now_iso()
    doc = {
        "id": rid,
        "studio_id": user["studio_id"],
        "patient_id": body.patient_id,
        "estimate_id": body.estimate_id,
        "channel": body.channel,
        "template_key": body.template_key,
        "subject": body.subject,
        "message_text": body.message_text,
        "sent_at": now,
        "sent_by": user["id"],
        "sent_by_name": user.get("full_name", ""),
        "status": "sent",
        "status_updated_at": now,
        "outcome_notes": "",
    }
    await db.reminders.insert_one(doc)
    doc.pop("_id", None)
    return doc


@api.put("/reminders/{rid}/status")
async def update_reminder_status(rid: str, body: ReminderStatusIn, user: dict = Depends(get_current_user)):
    rem = await db.reminders.find_one({"id": rid, "studio_id": user["studio_id"]})
    if not rem:
        raise HTTPException(404, "Reminder non trovato")
    now = now_iso()
    await db.reminders.update_one(
        {"id": rid},
        {"$set": {"status": body.status, "status_updated_at": now, "outcome_notes": body.outcome_notes or ""}},
    )
    # If status is accepted/rejected, sync the linked estimate's status too
    if rem.get("estimate_id") and body.status in ("accepted", "rejected"):
        new_est_status = "accettato" if body.status == "accepted" else "rifiutato"
        await db.estimates.update_one(
            {"id": rem["estimate_id"], "studio_id": user["studio_id"]},
            {"$set": {"status": new_est_status}},
        )
    updated = await db.reminders.find_one({"id": rid}, {"_id": 0})
    return updated


@api.get("/reminders")
async def list_reminders(
    user: dict = Depends(get_current_user),
    patient_id: Optional[str] = None,
    estimate_id: Optional[str] = None,
    template_key: Optional[str] = None,
):
    q = {"studio_id": user["studio_id"]}
    if patient_id:
        q["patient_id"] = patient_id
    if estimate_id:
        q["estimate_id"] = estimate_id
    if template_key:
        q["template_key"] = template_key
    rows = await db.reminders.find(q, {"_id": 0}).sort("sent_at", -1).to_list(2000)
    # attach patient name for listing convenience
    pat_ids = list({r["patient_id"] for r in rows})
    if pat_ids:
        pats = await db.patients.find({"id": {"$in": pat_ids}}, {"_id": 0, "id": 1, "full_name": 1}).to_list(2000)
        pm = {p["id"]: p["full_name"] for p in pats}
        for r in rows:
            r["patient_name"] = pm.get(r["patient_id"], "—")
    return rows


@api.get("/followup-center/ab-stats")
async def ab_stats(user: dict = Depends(get_current_user)):
    sid = user["studio_id"]

    def empty_metrics():
        return {
            "sent": 0, "delivered": 0, "read": 0, "replied": 0,
            "appt_booked": 0, "accepted": 0, "rejected": 0, "no_response": 0,
            "reply_rate": 0.0, "booking_rate": 0.0, "acceptance_rate": 0.0,
            "avg_hours_to_conversion": None,
        }

    buckets = {k: empty_metrics() for k in ("wa_template_a", "wa_template_b", "email_reminder")}
    times_to_conv: dict[str, list] = {k: [] for k in buckets}

    rems = await db.reminders.find({"studio_id": sid}, {"_id": 0}).to_list(5000)
    for r in rems:
        k = r.get("template_key")
        if k not in buckets:
            continue
        b = buckets[k]
        b["sent"] += 1
        st = r.get("status", "sent")
        if st == "delivered":
            b["delivered"] += 1
        elif st == "read":
            b["read"] += 1
        elif st == "replied":
            b["replied"] += 1
        elif st == "appt_booked":
            b["appt_booked"] += 1
        elif st == "accepted":
            b["accepted"] += 1
        elif st == "rejected":
            b["rejected"] += 1
        elif st == "no_response":
            b["no_response"] += 1

        # Consider any "forward" status (read/replied/booked/accepted) as engagement
        # time-to-conversion only for accepted reminders
        if st == "accepted" and r.get("sent_at") and r.get("status_updated_at"):
            try:
                t0 = datetime.fromisoformat(r["sent_at"])
                t1 = datetime.fromisoformat(r["status_updated_at"])
                hrs = (t1 - t0).total_seconds() / 3600
                if hrs >= 0:
                    times_to_conv[k].append(hrs)
            except Exception:
                pass

    # Derived rates
    for k, b in buckets.items():
        sent = max(1, b["sent"])
        engaged = b["replied"] + b["appt_booked"] + b["accepted"]
        booked = b["appt_booked"] + b["accepted"]
        b["reply_rate"] = round(engaged * 100 / sent, 1)
        b["booking_rate"] = round(booked * 100 / sent, 1)
        b["acceptance_rate"] = round(b["accepted"] * 100 / sent, 1)
        if times_to_conv[k]:
            b["avg_hours_to_conversion"] = round(sum(times_to_conv[k]) / len(times_to_conv[k]), 1)

    # Winner: higher acceptance_rate; tiebreaker booking_rate; require min 5 sent each
    winner = None
    a, b_ = buckets["wa_template_a"], buckets["wa_template_b"]
    if a["sent"] >= 5 and b_["sent"] >= 5:
        if a["acceptance_rate"] > b_["acceptance_rate"]:
            winner = "wa_template_a"
        elif b_["acceptance_rate"] > a["acceptance_rate"]:
            winner = "wa_template_b"
        else:
            winner = "tie"
    return {"buckets": buckets, "winner": winner}


app.include_router(api)



async def seed_reminders_if_missing():
    """Add demo reminders for the demo studio if none exist.
    Generates mixed template A/B + email outcomes to power the A/B dashboard."""
    studio = await db.studios.find_one({"name": DEMO_STUDIO_NAME})
    if not studio:
        return
    sid = studio["id"]
    existing = await db.reminders.count_documents({"studio_id": sid})
    if existing > 0:
        logger.info("Demo reminders already exist, skipping")
        return
    estimates = await db.estimates.find({"studio_id": sid}, {"_id": 0}).to_list(500)
    if not estimates:
        return
    users_list = await db.users.find({"studio_id": sid}, {"_id": 0, "id": 1, "full_name": 1}).to_list(10)
    if not users_list:
        return

    # Template A: 12 sent, skewed toward accepted/booked (better performer)
    # Template B: 10 sent, skewed toward replied/no_response (worse performer)
    # Email: 8 sent, mixed
    plan = [
        ("wa_template_a", 12, {"accepted": 4, "appt_booked": 3, "replied": 2, "read": 2, "no_response": 1}),
        ("wa_template_b", 10, {"accepted": 2, "appt_booked": 2, "replied": 2, "no_response": 3, "delivered": 1}),
        ("email_reminder", 8, {"accepted": 1, "appt_booked": 1, "replied": 2, "read": 2, "no_response": 2}),
    ]

    pool = list(estimates)
    random.shuffle(pool)
    idx = 0
    now = datetime.now(timezone.utc)

    for tpl_key, count, outcome_dist in plan:
        outcomes = []
        for status, n in outcome_dist.items():
            outcomes.extend([status] * n)
        while len(outcomes) < count:
            outcomes.append("no_response")
        random.shuffle(outcomes)

        for i in range(count):
            if idx >= len(pool):
                break
            est = pool[idx]
            idx += 1
            sent_offset_days = random.randint(2, 25)
            sent_at = now - timedelta(days=sent_offset_days, hours=random.randint(0, 23))
            status = outcomes[i]
            if status == "sent":
                su = sent_at
            elif status in ("delivered", "read"):
                su = sent_at + timedelta(hours=random.randint(1, 48))
            elif status in ("replied", "appt_booked"):
                su = sent_at + timedelta(hours=random.randint(4, 72))
            elif status == "accepted":
                su = sent_at + timedelta(hours=random.randint(12, 120))
            elif status == "rejected":
                su = sent_at + timedelta(hours=random.randint(6, 96))
            else:
                su = sent_at + timedelta(days=random.randint(3, 10))

            tpl = TEMPLATES[tpl_key]
            user = random.choice(users_list)
            pat = await db.patients.find_one({"id": est["patient_id"]}, {"_id": 0}) or {}
            variables = {
                "patient_first_name": (pat.get("full_name") or "Paziente").split(" ")[0],
                "sender_name": user["full_name"],
                "studio_name": studio["name"],
                "estimate_title": est.get("title", ""),
                "estimate_amount": f"{int(est.get('total_amount') or 0)}",
                "notes": "",
            }
            rendered = render_template(tpl, variables)

            await db.reminders.insert_one({
                "id": str(uuid.uuid4()),
                "studio_id": sid,
                "patient_id": est["patient_id"],
                "estimate_id": est["id"],
                "channel": tpl["channel"],
                "template_key": tpl_key,
                "subject": rendered["subject"],
                "message_text": rendered["body"],
                "sent_at": sent_at.isoformat(),
                "sent_by": user["id"],
                "sent_by_name": user["full_name"],
                "status": status,
                "status_updated_at": su.isoformat(),
                "outcome_notes": "",
            })
    logger.info("Demo reminders seeded")


@app.on_event("startup")
async def startup():
    await db.users.create_index("email", unique=True)
    await db.users.create_index("studio_id")
    await db.patients.create_index("studio_id")
    await db.estimates.create_index("studio_id")
    await db.appointments.create_index("studio_id")
    await db.payments.create_index("studio_id")
    await db.installments.create_index("payment_id")
    await db.reminders.create_index("studio_id")
    await db.reminders.create_index("estimate_id")
    await db.reminders.create_index("patient_id")
    await db.login_attempts.create_index("key", unique=True)
    await seed_demo()
    await seed_reminders_if_missing()


@app.on_event("shutdown")
async def shutdown():
    client.close()
