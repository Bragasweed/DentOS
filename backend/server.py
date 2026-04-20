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

app = FastAPI(title="HuDent AI")
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
    return {"app": "HuDent AI", "status": "ok"}


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


# ========================================================================
# PHASE 3 — Revenue Recovery Automation
# ========================================================================

# ----- Phase 3 schemas -----
class AutomationRuleIn(BaseModel):
    model_config = ConfigDict(extra="ignore")
    name: str
    trigger: Literal["estimate_presented"] = "estimate_presented"
    delay_days: int = Field(ge=0, le=365)
    channel: Literal["whatsapp", "email", "task"]
    template_key: Optional[str] = None
    assigned_to: Optional[str] = None
    active: bool = True


def _month_bounds(ref: Optional[date] = None):
    ref = ref or date.today()
    start = ref.replace(day=1)
    # next month start
    if start.month == 12:
        end = start.replace(year=start.year + 1, month=1)
    else:
        end = start.replace(month=start.month + 1)
    # previous
    if start.month == 1:
        prev_start = start.replace(year=start.year - 1, month=12)
    else:
        prev_start = start.replace(month=start.month - 1)
    return start.isoformat(), end.isoformat(), prev_start.isoformat()


def compute_lost_risk_score(estimate: dict, reminders: list) -> tuple[int, int, str, str]:
    """Return (lost_risk_score, recovery_probability_pct, suggested_template_key, suggested_action_key)."""
    score = 40
    amount = float(estimate.get("total_amount") or 0)
    if amount >= 4000:
        score += 25
    elif amount >= 2000:
        score += 18
    elif amount >= 800:
        score += 10
    elif amount >= 300:
        score += 4

    # days since presentation
    presented = estimate.get("presented_at")
    if presented:
        try:
            dpres = datetime.fromisoformat(presented).date() if "T" in presented else date.fromisoformat(presented)
            days = (date.today() - dpres).days
            if days >= 60:
                score += 20
            elif days >= 30:
                score += 12
            elif days >= 14:
                score += 5
        except Exception:
            pass

    # reminders activity
    unanswered = sum(1 for r in reminders if r.get("status") in ("sent", "delivered", "no_response"))
    engaged = sum(1 for r in reminders if r.get("status") in ("replied", "appt_booked", "read"))
    score += min(15, unanswered * 5)
    score -= min(12, engaged * 4)

    # rejection-reason influence
    reason = (estimate.get("rejection_reason") or "").lower()
    if estimate.get("status") == "rifiutato":
        if "cost" in reason or "prezzo" in reason or "elevato" in reason:
            score -= 18  # lost on price → harder to recover
        elif "valut" in reason or "riflett" in reason:
            score -= 5
        elif "tempo" in reason or "lungh" in reason:
            score += 5
        elif "finanz" in reason or "rate" in reason or "pag" in reason:
            score += 10

    score = max(5, min(100, score))
    # recovery probability roughly inverse
    recovery = max(8, round(100 - score * 0.85))

    # suggested action/template
    if estimate.get("status") == "rifiutato":
        if "cost" in reason or "prezzo" in reason or "elevato" in reason:
            action = "offer_financing"
            template = "email_reminder"  # email proposing rate plan
        elif "valut" in reason:
            action = "call_now"
            template = "wa_template_a"
        else:
            action = "archive_or_manual"
            template = "manual_note"
    else:
        if unanswered >= 2:
            action = "call_now"
            template = "wa_template_b"
        elif len(reminders) == 0:
            action = "send_wa_a"
            template = "wa_template_a"
        elif engaged > 0:
            action = "send_wa_b"
            template = "wa_template_b"
        else:
            action = "send_email"
            template = "email_reminder"
    return score, recovery, template, action


SUGGESTED_ACTION_LABELS = {
    **RECOMMENDED_ACTION_LABELS,
    "offer_financing": "Proponi finanziamento / rate",
}


# ----- Revenue overview -----
@api.get("/revenue/overview")
async def revenue_overview(
    user: dict = Depends(get_current_user),
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    staff_member: Optional[str] = None,
    template: Optional[str] = None,
    channel: Optional[str] = None,
):
    sid = user["studio_id"]
    start_month, end_month, prev_start = _month_bounds()
    df = date_from or start_month
    dt = date_to or end_month

    rem_q = {"studio_id": sid, "sent_at": {"$gte": df, "$lt": dt}}
    if staff_member:
        rem_q["sent_by"] = staff_member
    if template:
        rem_q["template_key"] = template
    if channel:
        rem_q["channel"] = channel

    rems = await db.reminders.find(rem_q, {"_id": 0}).to_list(5000)

    # Total reminders + rates
    total_rem = len(rems)
    replied = sum(1 for r in rems if r["status"] in ("replied", "appt_booked", "accepted"))
    appt_booked = sum(1 for r in rems if r["status"] in ("appt_booked", "accepted"))
    accepted = sum(1 for r in rems if r["status"] == "accepted")

    reply_rate = round(replied * 100 / max(1, total_rem), 1)
    appt_rate = round(appt_booked * 100 / max(1, total_rem), 1)
    accept_rate = round(accepted * 100 / max(1, total_rem), 1)

    # Recovered estimates this period = accepted reminders' estimate_ids (unique)
    recovered_est_ids = list({r["estimate_id"] for r in rems if r["status"] == "accepted" and r.get("estimate_id")})
    recovered_revenue = 0.0
    if recovered_est_ids:
        ests = await db.estimates.find({"id": {"$in": recovered_est_ids}, "studio_id": sid}, {"_id": 0}).to_list(500)
        recovered_revenue = round(sum(e["total_amount"] for e in ests), 2)

    # Best template (within filtered set)
    tpl_stats: dict[str, dict] = {}
    for r in rems:
        tk = r.get("template_key") or "unknown"
        b = tpl_stats.setdefault(tk, {"sent": 0, "accepted": 0})
        b["sent"] += 1
        if r["status"] == "accepted":
            b["accepted"] += 1
    for tk, b in tpl_stats.items():
        b["acceptance_rate"] = round(b["accepted"] * 100 / max(1, b["sent"]), 1)
    best_template = None
    if tpl_stats:
        best = max(tpl_stats.items(), key=lambda kv: (kv[1]["acceptance_rate"], kv[1]["sent"]))
        if best[1]["sent"] >= 3:
            best_template = {"key": best[0], "acceptance_rate": best[1]["acceptance_rate"], "sent": best[1]["sent"]}

    # Best contact delay (days_since_presentation at time of sending, for accepted outcomes)
    delays, hours = [], []
    for r in rems:
        if r["status"] != "accepted":
            continue
        try:
            sent_dt = datetime.fromisoformat(r["sent_at"])
            hours.append(sent_dt.hour)
        except Exception:
            pass
        est_id = r.get("estimate_id")
        if est_id:
            est = await db.estimates.find_one({"id": est_id, "studio_id": sid}, {"_id": 0, "presented_at": 1})
            if est and est.get("presented_at"):
                try:
                    dpres = datetime.fromisoformat(est["presented_at"]).date() if "T" in est["presented_at"] else date.fromisoformat(est["presented_at"])
                    d = (datetime.fromisoformat(r["sent_at"]).date() - dpres).days
                    if d >= 0:
                        delays.append(d)
                except Exception:
                    pass
    avg_delay = round(sum(delays) / len(delays), 1) if delays else None

    # Best time-of-day bucket
    buckets_tod = {"08-12": 0, "12-18": 0, "18-22": 0}
    for h in hours:
        if 8 <= h < 12:
            buckets_tod["08-12"] += 1
        elif 12 <= h < 18:
            buckets_tod["12-18"] += 1
        elif 18 <= h < 22:
            buckets_tod["18-22"] += 1
    best_time = max(buckets_tod.items(), key=lambda kv: kv[1])[0] if sum(buckets_tod.values()) else None

    # Top staff by conversion rate
    staff_map = {}
    for r in rems:
        uid = r.get("sent_by")
        if not uid:
            continue
        s = staff_map.setdefault(uid, {"name": r.get("sent_by_name", ""), "sent": 0, "accepted": 0})
        s["sent"] += 1
        if r["status"] == "accepted":
            s["accepted"] += 1
    for uid, s in staff_map.items():
        s["acceptance_rate"] = round(s["accepted"] * 100 / max(1, s["sent"]), 1)
    top_staff = None
    if staff_map:
        ts = max(staff_map.values(), key=lambda v: (v["acceptance_rate"], v["sent"]))
        if ts["sent"] >= 3:
            top_staff = ts

    # Conversion funnel (on this period)
    funnel = {
        "sent": total_rem,
        "replied": replied,
        "appt_booked": appt_booked,
        "accepted": accepted,
    }

    # Weekly recovered revenue (last 8 weeks)
    weekly_points = []
    today = date.today()
    for w in range(7, -1, -1):
        wk_start = today - timedelta(days=today.weekday() + 7 * w)
        wk_end = wk_start + timedelta(days=7)
        wk_rems = await db.reminders.find({
            "studio_id": sid, "status": "accepted",
            "status_updated_at": {"$gte": wk_start.isoformat(), "$lt": wk_end.isoformat()},
        }, {"_id": 0, "estimate_id": 1}).to_list(500)
        est_ids = list({r["estimate_id"] for r in wk_rems if r.get("estimate_id")})
        rev = 0.0
        if est_ids:
            ee = await db.estimates.find({"id": {"$in": est_ids}, "studio_id": sid}, {"_id": 0, "total_amount": 1}).to_list(500)
            rev = round(sum(e["total_amount"] for e in ee), 2)
        weekly_points.append({"week_start": wk_start.isoformat(), "revenue": rev, "count": len(est_ids)})

    # Top 10 open high-value estimates
    open_ests = await db.estimates.find({
        "studio_id": sid, "status": {"$in": ["presentato", "in_attesa"]}
    }, {"_id": 0}).sort("total_amount", -1).to_list(50)
    top_open = []
    for e in open_ests[:10]:
        pat = await db.patients.find_one({"id": e["patient_id"]}, {"_id": 0, "full_name": 1}) or {}
        top_open.append({
            "estimate_id": e["id"], "patient_id": e["patient_id"], "patient_name": pat.get("full_name", "—"),
            "title": e["title"], "amount": e["total_amount"], "status": e["status"],
            "presented_at": e.get("presented_at"), "next_followup_date": e.get("next_followup_date"),
        })

    # Lost revenue by rejection reason
    lost_ests = await db.estimates.find({
        "studio_id": sid, "status": "rifiutato"
    }, {"_id": 0, "rejection_reason": 1, "total_amount": 1}).to_list(500)
    lost_by_reason: dict[str, dict] = {}
    for e in lost_ests:
        reason = (e.get("rejection_reason") or "Non specificato").strip() or "Non specificato"
        b = lost_by_reason.setdefault(reason, {"count": 0, "amount": 0.0})
        b["count"] += 1
        b["amount"] += float(e.get("total_amount") or 0)
    lost_by_reason_list = sorted([{"reason": k, **v, "amount": round(v["amount"], 2)} for k, v in lost_by_reason.items()], key=lambda x: -x["amount"])

    # Month-over-month compare (current vs previous calendar month)
    cur_rems = await db.reminders.find({
        "studio_id": sid, "sent_at": {"$gte": start_month, "$lt": end_month}
    }, {"_id": 0}).to_list(5000)
    prev_rems = await db.reminders.find({
        "studio_id": sid, "sent_at": {"$gte": prev_start, "$lt": start_month}
    }, {"_id": 0}).to_list(5000)

    def _metrics(r_list):
        sent = len(r_list)
        acc = sum(1 for r in r_list if r["status"] == "accepted")
        est_ids = list({r["estimate_id"] for r in r_list if r["status"] == "accepted" and r.get("estimate_id")})
        return {"sent": sent, "accepted": acc, "accept_rate": round(acc * 100 / max(1, sent), 1), "recovered_ids": est_ids}

    cur_m = _metrics(cur_rems)
    prev_m = _metrics(prev_rems)
    cur_rev = 0.0
    if cur_m["recovered_ids"]:
        ee = await db.estimates.find({"id": {"$in": cur_m["recovered_ids"]}, "studio_id": sid}, {"_id": 0, "total_amount": 1}).to_list(500)
        cur_rev = round(sum(e["total_amount"] for e in ee), 2)
    prev_rev = 0.0
    if prev_m["recovered_ids"]:
        ee = await db.estimates.find({"id": {"$in": prev_m["recovered_ids"]}, "studio_id": sid}, {"_id": 0, "total_amount": 1}).to_list(500)
        prev_rev = round(sum(e["total_amount"] for e in ee), 2)

    return {
        "filters": {"date_from": df, "date_to": dt, "staff_member": staff_member, "template": template, "channel": channel},
        "kpis": {
            "recovered_estimates_count_this_month": len(recovered_est_ids),
            "recovered_revenue_this_month": recovered_revenue,
            "sent_reminders_this_month": total_rem,
            "reminder_to_reply_rate": reply_rate,
            "reminder_to_appointment_rate": appt_rate,
            "reminder_to_acceptance_rate": accept_rate,
            "best_template": best_template,
            "best_contact_delay_days": avg_delay,
            "best_contact_time_range": best_time,
            "top_staff_member_by_conversion_rate": top_staff,
        },
        "funnel": funnel,
        "weekly_recovered": weekly_points,
        "templates_performance": [{"template_key": k, **v} for k, v in tpl_stats.items()],
        "top_open_estimates": top_open,
        "lost_by_reason": lost_by_reason_list,
        "month_compare": {
            "current": {"sent": cur_m["sent"], "accepted": cur_m["accepted"], "revenue": cur_rev, "accept_rate": cur_m["accept_rate"]},
            "previous": {"sent": prev_m["sent"], "accepted": prev_m["accepted"], "revenue": prev_rev, "accept_rate": prev_m["accept_rate"]},
        },
    }


# ----- Revenue Lost Radar -----
@api.get("/revenue/radar")
async def revenue_radar(user: dict = Depends(get_current_user), limit: int = 50):
    sid = user["studio_id"]
    # Consider estimates that are either:
    # - open (presentato / in_attesa) AND > 14 days since presentation
    # - rejected within last 90 days (recoverable with right approach)
    today = date.today()
    cutoff_open = (today - timedelta(days=14)).isoformat()
    cutoff_lost = (today - timedelta(days=90)).isoformat()

    ests = await db.estimates.find({
        "studio_id": sid,
        "$or": [
            {"status": {"$in": ["presentato", "in_attesa"]}, "presented_at": {"$lte": cutoff_open}},
            {"status": "rifiutato", "presented_at": {"$gte": cutoff_lost}},
        ],
    }, {"_id": 0}).to_list(500)

    # batch reminders
    est_ids = [e["id"] for e in ests]
    all_rems = await db.reminders.find({"studio_id": sid, "estimate_id": {"$in": est_ids}}, {"_id": 0}).to_list(5000)
    by_est: dict[str, list] = {}
    for r in all_rems:
        by_est.setdefault(r["estimate_id"], []).append(r)

    pat_ids = list({e["patient_id"] for e in ests})
    pats = await db.patients.find({"id": {"$in": pat_ids}}, {"_id": 0}).to_list(2000)
    pm = {p["id"]: p for p in pats}

    items = []
    for e in ests:
        priors = by_est.get(e["id"], [])
        score, recovery, suggested_tpl, suggested_action = compute_lost_risk_score(e, priors)
        pat = pm.get(e["patient_id"]) or {}
        last_rem = None
        if priors:
            try:
                last_rem = max(priors, key=lambda r: r.get("sent_at") or "")
            except Exception:
                last_rem = priors[0]
        presented = e.get("presented_at")
        days_since = None
        if presented:
            try:
                dpres = datetime.fromisoformat(presented).date() if "T" in presented else date.fromisoformat(presented)
                days_since = (today - dpres).days
            except Exception:
                pass
        items.append({
            "estimate_id": e["id"],
            "estimate_title": e["title"],
            "estimate_amount": e["total_amount"],
            "estimate_status": e["status"],
            "rejection_reason": e.get("rejection_reason") or "",
            "patient_id": e["patient_id"],
            "patient_name": pat.get("full_name", "—"),
            "patient_phone": pat.get("phone", ""),
            "days_since": days_since,
            "reminders_count": len(priors),
            "last_reminder_at": last_rem.get("sent_at") if last_rem else None,
            "last_reminder_status": last_rem.get("status") if last_rem else None,
            "lost_risk_score": score,
            "recovery_probability": recovery,
            "suggested_template": suggested_tpl,
            "suggested_action": suggested_action,
            "suggested_action_label": SUGGESTED_ACTION_LABELS.get(suggested_action, suggested_action),
        })
    items.sort(key=lambda x: (-x["lost_risk_score"], -(x["estimate_amount"] or 0)))
    return items[:limit]


@api.get("/revenue/radar/report")
async def revenue_radar_report(user: dict = Depends(get_current_user)):
    """Monday email report preview payload."""
    radar = await revenue_radar(user=user, limit=5)
    total_at_risk = round(sum(x["estimate_amount"] for x in radar), 2)
    # weighted recoverable amount (amount * recovery_probability%)
    recoverable = round(sum(x["estimate_amount"] * (x["recovery_probability"] / 100) for x in radar), 2)
    studio = await db.studios.find_one({"id": user["studio_id"]}, {"_id": 0}) or {}
    return {
        "title": f"Revenue Lost Radar — {studio.get('name', 'Il tuo studio')}",
        "summary": (
            f"Questa settimana abbiamo individuato {len(radar)} preventivi ad alto rischio "
            f"per un totale di {total_at_risk:,.0f} € in trattativa. "
            f"Con le azioni suggerite potresti recuperare fino a {recoverable:,.0f} €."
        ),
        "total_at_risk": total_at_risk,
        "recoverable_estimate": recoverable,
        "top_estimates": radar,
        "cta_label": "Apri Centro recupero",
        "cta_url": "/recupero",
        "generated_at": now_iso(),
    }


# ----- Automations -----
@api.get("/automations/rules")
async def list_rules(user: dict = Depends(get_current_user)):
    rows = await db.automation_rules.find({"studio_id": user["studio_id"]}, {"_id": 0}).sort("delay_days", 1).to_list(200)
    return rows


@api.post("/automations/rules")
async def create_rule(body: AutomationRuleIn, user: dict = Depends(get_current_user)):
    rid = str(uuid.uuid4())
    doc = body.model_dump()
    doc.update({
        "id": rid,
        "studio_id": user["studio_id"],
        "created_at": now_iso(),
        "created_by": user["id"],
    })
    await db.automation_rules.insert_one(doc)
    doc.pop("_id", None)
    return doc


@api.put("/automations/rules/{rid}")
async def update_rule(rid: str, body: AutomationRuleIn, user: dict = Depends(get_current_user)):
    await db.automation_rules.update_one(
        {"id": rid, "studio_id": user["studio_id"]},
        {"$set": body.model_dump()},
    )
    r = await db.automation_rules.find_one({"id": rid}, {"_id": 0})
    if not r:
        raise HTTPException(404, "Regola non trovata")
    return r


@api.delete("/automations/rules/{rid}")
async def delete_rule(rid: str, user: dict = Depends(get_current_user)):
    await db.automation_rules.delete_one({"id": rid, "studio_id": user["studio_id"]})
    return {"ok": True}


@api.get("/automations/runs")
async def list_runs(user: dict = Depends(get_current_user), status: Optional[str] = None, limit: int = 100):
    q = {"studio_id": user["studio_id"]}
    if status:
        q["status"] = status
    rows = await db.automation_runs.find(q, {"_id": 0}).sort("scheduled_at", 1).to_list(limit)
    # enrich
    rule_ids = list({r["rule_id"] for r in rows if r.get("rule_id")})
    est_ids = list({r["estimate_id"] for r in rows if r.get("estimate_id")})
    rules = await db.automation_rules.find({"id": {"$in": rule_ids}}, {"_id": 0}).to_list(500)
    rm = {r["id"]: r for r in rules}
    ests = await db.estimates.find({"id": {"$in": est_ids}}, {"_id": 0}).to_list(500)
    em = {e["id"]: e for e in ests}
    pat_ids = list({e["patient_id"] for e in ests})
    pats = await db.patients.find({"id": {"$in": pat_ids}}, {"_id": 0}).to_list(500)
    pm = {p["id"]: p for p in pats}
    for r in rows:
        rr = rm.get(r.get("rule_id")) or {}
        ee = em.get(r.get("estimate_id")) or {}
        pp = pm.get(ee.get("patient_id")) or {}
        r["rule_name"] = rr.get("name", "—")
        r["rule_channel"] = rr.get("channel")
        r["rule_template_key"] = rr.get("template_key")
        r["estimate_title"] = ee.get("title", "—")
        r["estimate_amount"] = ee.get("total_amount")
        r["patient_name"] = pp.get("full_name", "—")
    return rows


@api.post("/automations/simulate")
async def simulate_scheduler(user: dict = Depends(get_current_user)):
    """Dev/demo helper: runs one scheduler tick and returns how many new runs were created/executed."""
    created, executed = await scheduler_tick(user["studio_id"])
    return {"created": created, "executed": executed}


async def scheduler_tick(studio_id: str) -> tuple[int, int]:
    """Create scheduled runs for estimates matching any active rule, and execute due ones."""
    rules = await db.automation_rules.find({"studio_id": studio_id, "active": True}, {"_id": 0}).to_list(200)
    if not rules:
        return 0, 0
    # Only consider estimates in "presentato" or "in_attesa" for trigger="estimate_presented"
    ests = await db.estimates.find({
        "studio_id": studio_id,
        "status": {"$in": ["presentato", "in_attesa"]},
    }, {"_id": 0}).to_list(5000)

    existing_runs = await db.automation_runs.find({"studio_id": studio_id}, {"_id": 0, "rule_id": 1, "estimate_id": 1, "status": 1}).to_list(10000)
    existing_key = {(r["rule_id"], r["estimate_id"]): r for r in existing_runs}

    created = 0
    executed = 0
    now_dt = datetime.now(timezone.utc)

    for rule in rules:
        if rule.get("trigger") != "estimate_presented":
            continue
        for e in ests:
            if not e.get("presented_at"):
                continue
            try:
                dpres = datetime.fromisoformat(e["presented_at"]).date() if "T" in e["presented_at"] else date.fromisoformat(e["presented_at"])
            except Exception:
                continue
            scheduled_dt = datetime.combine(dpres + timedelta(days=rule["delay_days"]), datetime.min.time()).replace(hour=9, tzinfo=timezone.utc)
            key = (rule["id"], e["id"])
            if key in existing_key:
                continue
            # Create run
            run_id = str(uuid.uuid4())
            run_doc = {
                "id": run_id,
                "studio_id": studio_id,
                "rule_id": rule["id"],
                "estimate_id": e["id"],
                "patient_id": e["patient_id"],
                "scheduled_at": scheduled_dt.isoformat(),
                "executed_at": None,
                "status": "scheduled",
                "reminder_id": None,
                "task_id": None,
                "error_msg": None,
                "created_at": now_dt.isoformat(),
            }
            # If due or overdue → execute now
            if scheduled_dt <= now_dt:
                try:
                    if rule["channel"] in ("whatsapp", "email"):
                        # Build reminder from template
                        tpl = TEMPLATES.get(rule.get("template_key") or "wa_template_a")
                        if not tpl:
                            raise ValueError("Template not found")
                        studio = await db.studios.find_one({"id": studio_id}, {"_id": 0}) or {}
                        pat = await db.patients.find_one({"id": e["patient_id"]}, {"_id": 0}) or {}
                        sender = await db.users.find_one({"id": rule.get("assigned_to")}, {"_id": 0}) if rule.get("assigned_to") else None
                        sender = sender or {"id": "auto", "full_name": "Automazione"}
                        variables = {
                            "patient_first_name": (pat.get("full_name") or "Paziente").split(" ")[0],
                            "sender_name": sender["full_name"],
                            "studio_name": studio.get("name", ""),
                            "estimate_title": e.get("title", ""),
                            "estimate_amount": f"{int(e.get('total_amount') or 0)}",
                            "notes": "",
                        }
                        rendered = render_template(tpl, variables)
                        rem_id = str(uuid.uuid4())
                        await db.reminders.insert_one({
                            "id": rem_id,
                            "studio_id": studio_id,
                            "patient_id": e["patient_id"],
                            "estimate_id": e["id"],
                            "channel": tpl["channel"],
                            "template_key": rule.get("template_key"),
                            "subject": rendered["subject"],
                            "message_text": rendered["body"],
                            "sent_at": now_dt.isoformat(),
                            "sent_by": sender["id"],
                            "sent_by_name": sender["full_name"] + " · auto",
                            "status": "sent",
                            "status_updated_at": now_dt.isoformat(),
                            "outcome_notes": "Inviato da automazione",
                        })
                        run_doc.update({"status": "executed", "executed_at": now_dt.isoformat(), "reminder_id": rem_id})
                        executed += 1
                    elif rule["channel"] == "task":
                        pat = await db.patients.find_one({"id": e["patient_id"]}, {"_id": 0}) or {}
                        task_id = str(uuid.uuid4())
                        await db.tasks.insert_one({
                            "id": task_id,
                            "studio_id": studio_id,
                            "title": f"{rule['name']} · {pat.get('full_name', 'Paziente')}",
                            "patient_id": e["patient_id"],
                            "due_date": scheduled_dt.date().isoformat(),
                            "priority": "alta",
                            "done": False,
                            "created_at": now_dt.isoformat(),
                            "created_by": rule.get("assigned_to") or "auto",
                        })
                        run_doc.update({"status": "executed", "executed_at": now_dt.isoformat(), "task_id": task_id})
                        executed += 1
                    else:
                        run_doc["status"] = "skipped"
                except Exception as ex:
                    run_doc.update({"status": "failed", "error_msg": str(ex)[:200]})
            await db.automation_runs.insert_one(run_doc)
            created += 1
    return created, executed


async def seed_phase3_demo():
    """Seed automation rules + runs + extra rejection reasons for Revenue demo."""
    studio = await db.studios.find_one({"name": DEMO_STUDIO_NAME})
    if not studio:
        return
    sid = studio["id"]

    # Ensure rejection reasons populated on rejected estimates (for lost_by_reason chart)
    rejected = await db.estimates.find({"studio_id": sid, "status": "rifiutato"}, {"_id": 0}).to_list(200)
    reason_pool = ["Costo elevato", "Vuole valutare", "Ha scelto altro studio", "Tempi troppo lunghi", "Vuole finanziamento"]
    for e in rejected:
        if not e.get("rejection_reason"):
            await db.estimates.update_one({"id": e["id"]}, {"$set": {"rejection_reason": random.choice(reason_pool)}})

    # Rules: create default 5 if none
    if await db.automation_rules.count_documents({"studio_id": sid}) == 0:
        admin = await db.users.find_one({"studio_id": sid, "role": "admin_studio"}, {"_id": 0})
        admin_id = admin["id"] if admin else None
        defaults = [
            {"name": "Giorno 3 · WhatsApp amichevole", "delay_days": 3, "channel": "whatsapp", "template_key": "wa_template_a"},
            {"name": "Giorno 7 · WhatsApp diretto",    "delay_days": 7, "channel": "whatsapp", "template_key": "wa_template_b"},
            {"name": "Giorno 14 · Task chiamata",      "delay_days": 14, "channel": "task", "template_key": None},
            {"name": "Giorno 21 · Email formale",      "delay_days": 21, "channel": "email", "template_key": "email_reminder"},
            {"name": "Giorno 30 · Task ultimo contatto", "delay_days": 30, "channel": "task", "template_key": None},
        ]
        for d in defaults:
            await db.automation_rules.insert_one({
                "id": str(uuid.uuid4()),
                "studio_id": sid,
                "name": d["name"],
                "trigger": "estimate_presented",
                "delay_days": d["delay_days"],
                "channel": d["channel"],
                "template_key": d["template_key"],
                "assigned_to": admin_id,
                "active": True,
                "created_at": now_iso(),
                "created_by": admin_id or "system",
            })
        # Run scheduler once so the Automations page has data
        await scheduler_tick(sid)
        # Add 2 failed runs for realism
        runs = await db.automation_runs.find({"studio_id": sid, "status": "scheduled"}, {"_id": 0}).to_list(5)
        for r in runs[:2]:
            await db.automation_runs.update_one(
                {"id": r["id"]},
                {"$set": {"status": "failed", "error_msg": "Simulazione: WhatsApp Business API non configurata", "executed_at": now_iso()}},
            )
        logger.info("Phase 3 seed completed")


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
    await db.automation_rules.create_index("studio_id")
    await db.automation_runs.create_index("studio_id")
    await db.automation_runs.create_index("rule_id")
    await db.automation_runs.create_index("estimate_id")
    await db.login_attempts.create_index("key", unique=True)
    await seed_demo()
    await seed_reminders_if_missing()
    await seed_phase3_demo()


@app.on_event("shutdown")
async def shutdown():
    client.close()
