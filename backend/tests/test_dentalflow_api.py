"""HuDent AI - Backend API test suite (pytest)
Covers: auth, patients, estimates, appointments, payments/installments,
call logs, tasks, dashboard, search, multi-tenant isolation, brute-force."""
import os
import uuid
from datetime import date, timedelta

import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://dentalflow-ai.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"

ADMIN_EMAIL = "admin@dentalflow.it"
ADMIN_PASSWORD = "DentalFlow2026!"


# ---------- Fixtures ----------
class NoCookieSession(requests.Session):
    """Clears Set-Cookie after every response; forces Bearer to be the effective auth.
    With Bearer-precedence on the server this is belt-and-braces."""
    def __init__(self):
        super().__init__()
        self.headers.update({"Content-Type": "application/json"})

    def send(self, request, **kwargs):
        resp = super().send(request, **kwargs)
        self.cookies.clear()
        return resp


@pytest.fixture()
def session():
    return NoCookieSession()


@pytest.fixture(scope="session", autouse=True)
def _warmup_and_clear_admin_lockout():
    """Successful login at the start resets the failure counter for the admin."""
    s = NoCookieSession()
    s.post(f"{API}/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD})
    yield


@pytest.fixture(scope="session")
def admin_token():
    s = NoCookieSession()
    r = s.post(f"{API}/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD})
    assert r.status_code == 200, f"login failed: {r.status_code} {r.text}"
    data = r.json()
    assert "access_token" in data
    assert data["user"]["email"] == ADMIN_EMAIL
    return data["access_token"]


@pytest.fixture(scope="session")
def admin_headers(admin_token):
    return {"Authorization": f"Bearer {admin_token}", "Content-Type": "application/json"}


@pytest.fixture(scope="session")
def isolated_studio():
    s = NoCookieSession()
    email = f"test-isolation-{uuid.uuid4().hex[:8]}@example.it"
    payload = {
        "email": email,
        "password": "Isol2026!",
        "full_name": "Test Owner",
        "studio_name": f"TEST Studio {uuid.uuid4().hex[:6]}",
        "studio_city": "Roma",
        "studio_phone": "+39 06 0000000",
    }
    r = s.post(f"{API}/auth/register", json=payload)
    assert r.status_code == 200, r.text
    data = r.json()
    return {
        "token": data["access_token"],
        "headers": {"Authorization": f"Bearer {data['access_token']}", "Content-Type": "application/json"},
        "user": data["user"],
        "email": email,
    }


# ---------- Auth ----------
class TestAuth:
    def test_login_success(self, session):
        r = session.post(f"{API}/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD})
        assert r.status_code == 200
        d = r.json()
        assert d["user"]["role"] == "admin_studio"
        assert isinstance(d["access_token"], str) and len(d["access_token"]) > 10
        assert "password_hash" not in d["user"]

    def test_login_bad_password(self, session):
        # Random user so we don't fill admin's lockout bucket
        r = session.post(f"{API}/auth/login", json={"email": f"nouser-{uuid.uuid4().hex[:6]}@x.it", "password": "wrong"})
        assert r.status_code == 401

    def test_me(self, session, admin_headers):
        r = session.get(f"{API}/auth/me", headers=admin_headers)
        assert r.status_code == 200
        d = r.json()
        assert d["user"]["email"] == ADMIN_EMAIL
        assert d["studio"]["name"] == "Studio Dentistico Demo"

    def test_me_unauth(self, session):
        r = session.get(f"{API}/auth/me")
        assert r.status_code == 401

    def test_register_and_token(self, isolated_studio):
        assert isolated_studio["user"]["role"] == "admin_studio"
        assert isolated_studio["token"]

    def test_invite_member(self, session, admin_headers):
        raw_email = f"TEST-invite-{uuid.uuid4().hex[:8]}@example.it"
        expected = raw_email.lower()  # server normalizes to lowercase
        r = session.post(f"{API}/auth/invite", headers=admin_headers, json={
            "email": raw_email, "full_name": "Test Invited", "role": "segreteria", "password": "Invited2026!"
        })
        assert r.status_code == 200, r.text
        new_u = r.json()
        assert new_u["email"] == expected
        assert new_u["role"] == "segreteria"
        r2 = session.post(f"{API}/auth/login", json={"email": raw_email, "password": "Invited2026!"})
        assert r2.status_code == 200

    def test_logout_idempotent(self, session):
        # Must NOT require auth
        r = session.post(f"{API}/auth/logout")
        assert r.status_code == 200

    def test_bearer_takes_precedence_over_cookie(self):
        """Valid cookie + invalid Bearer must 401 (Bearer wins)."""
        s = requests.Session()
        s.headers.update({"Content-Type": "application/json"})
        r = s.post(f"{API}/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD})
        assert r.status_code == 200
        # cookie-only should still work (fallback)
        r2 = s.get(f"{API}/auth/me")
        assert r2.status_code == 200
        # Invalid Bearer overrides cookie → 401
        r3 = s.get(f"{API}/auth/me", headers={"Authorization": "Bearer invalid.jwt.token"})
        assert r3.status_code == 401


# ---------- Brute-force protection ----------
class TestBruteForce:
    def test_lockout_after_five_failures(self, session):
        email = f"bf-target-{uuid.uuid4().hex[:6]}@example.it"
        for _ in range(5):
            r = session.post(f"{API}/auth/login", json={"email": email, "password": "wrong"})
            assert r.status_code == 401
        r_locked = session.post(f"{API}/auth/login", json={"email": email, "password": "wrong"})
        assert r_locked.status_code == 429
        # Even "correct" password is refused during lockout
        r_locked2 = session.post(f"{API}/auth/login", json={"email": email, "password": "anything"})
        assert r_locked2.status_code == 429

    def test_successful_login_resets_counter(self, session, admin_headers):
        raw = f"bf-reset-{uuid.uuid4().hex[:6]}@example.it"
        pwd = "ResetMe2026!"
        # create user via admin invite
        s_admin = NoCookieSession()
        s_admin.post(f"{API}/auth/invite", headers=admin_headers, json={
            "email": raw, "full_name": "BF Reset", "role": "segreteria", "password": pwd
        })
        # 3 failures
        for _ in range(3):
            assert session.post(f"{API}/auth/login", json={"email": raw, "password": "wrong"}).status_code == 401
        # successful login resets counter
        ok = session.post(f"{API}/auth/login", json={"email": raw, "password": pwd})
        assert ok.status_code == 200
        # 4 more failures should still produce 401 (not 429), because counter was reset
        for _ in range(4):
            assert session.post(f"{API}/auth/login", json={"email": raw, "password": "wrong"}).status_code == 401


# ---------- Patients ----------
class TestPatients:
    def test_list_patients_seeded(self, session, admin_headers):
        r = session.get(f"{API}/patients", headers=admin_headers)
        assert r.status_code == 200
        data = r.json()
        assert isinstance(data, list) and len(data) >= 20
        assert "studio_id" in data[0] and "full_name" in data[0]
        assert "_id" not in data[0]

    def test_search_and_filter(self, session, admin_headers):
        r = session.get(f"{API}/patients?status=attivo", headers=admin_headers)
        assert r.status_code == 200
        for p in r.json():
            assert p["status"] == "attivo"
        r2 = session.get(f"{API}/patients?q=Rom", headers=admin_headers)
        assert r2.status_code == 200
        for p in r2.json():
            assert "rom" in p["full_name"].lower()

    def test_create_get_update_patient(self, session, admin_headers):
        payload = {"full_name": "TEST_Paziente Uno", "phone": "+39 333 0000000", "status": "nuovo"}
        r = session.post(f"{API}/patients", headers=admin_headers, json=payload)
        assert r.status_code == 200
        pat = r.json()
        assert pat["full_name"] == payload["full_name"]
        assert "id" in pat and "studio_id" in pat
        pid = pat["id"]

        g = session.get(f"{API}/patients/{pid}", headers=admin_headers)
        assert g.status_code == 200
        d = g.json()
        assert d["patient"]["id"] == pid
        assert {"appointments", "estimates", "payments", "call_logs"} <= set(d.keys())

        payload["notes"] = "TEST note"
        payload["status"] = "attivo"
        u = session.put(f"{API}/patients/{pid}", headers=admin_headers, json=payload)
        assert u.status_code == 200
        assert u.json()["notes"] == "TEST note"
        assert u.json()["status"] == "attivo"


# ---------- Estimates ----------
class TestEstimates:
    def test_list_with_patient_name(self, session, admin_headers):
        r = session.get(f"{API}/estimates", headers=admin_headers)
        assert r.status_code == 200
        rows = r.json()
        assert len(rows) >= 22
        assert "patient_name" in rows[0]

    def test_followups_today(self, session, admin_headers):
        r = session.get(f"{API}/estimates/followups/today", headers=admin_headers)
        assert r.status_code == 200
        assert isinstance(r.json(), list)

    def test_create_update_estimate(self, session, admin_headers):
        pats = session.get(f"{API}/patients", headers=admin_headers).json()
        pid = pats[0]["id"]
        body = {"patient_id": pid, "title": "TEST Preventivo", "total_amount": 1234.5, "status": "bozza"}
        r = session.post(f"{API}/estimates", headers=admin_headers, json=body)
        assert r.status_code == 200
        est = r.json()
        eid = est["id"]
        body["status"] = "presentato"
        body["next_followup_date"] = date.today().isoformat()
        u = session.put(f"{API}/estimates/{eid}", headers=admin_headers, json=body)
        assert u.status_code == 200
        assert u.json()["status"] == "presentato"


# ---------- Appointments ----------
class TestAppointments:
    def test_list_with_filters(self, session, admin_headers):
        dfrom = (date.today() - timedelta(days=15)).isoformat()
        dto = (date.today() + timedelta(days=30)).isoformat()
        r = session.get(f"{API}/appointments?date_from={dfrom}&date_to={dto}", headers=admin_headers)
        assert r.status_code == 200
        rows = r.json()
        assert isinstance(rows, list) and len(rows) > 0
        assert "patient_name" in rows[0] and "no_show_risk" in rows[0]

    def test_update_status_noshow_flags_patient(self, session, admin_headers):
        pat = session.post(f"{API}/patients", headers=admin_headers,
                           json={"full_name": "TEST_NoShow Patient", "status": "nuovo", "no_show_risk": False}).json()
        pid = pat["id"]
        when = (date.today() + timedelta(days=2)).isoformat() + "T10:00:00+00:00"
        a = session.post(f"{API}/appointments", headers=admin_headers,
                         json={"patient_id": pid, "scheduled_at": when, "reason": "TEST"}).json()
        aid = a["id"]
        u = session.put(f"{API}/appointments/{aid}", headers=admin_headers,
                        json={"patient_id": pid, "scheduled_at": when, "status": "no_show", "reason": "TEST"})
        assert u.status_code == 200
        assert u.json()["status"] == "no_show"
        p2 = session.get(f"{API}/patients/{pid}", headers=admin_headers).json()
        assert p2["patient"]["no_show_risk"] is True


# ---------- Payments ----------
class TestPayments:
    def test_list_and_create_payment_with_installments(self, session, admin_headers):
        r = session.get(f"{API}/payments", headers=admin_headers)
        assert r.status_code == 200
        rows = r.json()
        assert len(rows) >= 1
        assert "installments_list" in rows[0]

        pats = session.get(f"{API}/patients", headers=admin_headers).json()
        pid = pats[0]["id"]
        body = {"patient_id": pid, "total_amount": 600.0, "installments": 3}
        p = session.post(f"{API}/payments", headers=admin_headers, json=body).json()
        pay_id = p["id"]
        all_pay = session.get(f"{API}/payments", headers=admin_headers).json()
        this_p = next(x for x in all_pay if x["id"] == pay_id)
        assert len(this_p["installments_list"]) == 3
        assert all(i["amount"] == 200.0 for i in this_p["installments_list"])
        iid = this_p["installments_list"][0]["id"]
        u = session.put(f"{API}/installments/{iid}/pay", headers=admin_headers, json={"paid": True})
        assert u.status_code == 200
        all_pay2 = session.get(f"{API}/payments", headers=admin_headers).json()
        this_p2 = next(x for x in all_pay2 if x["id"] == pay_id)
        assert this_p2["paid_amount"] == 200.0

    def test_overdue(self, session, admin_headers):
        r = session.get(f"{API}/payments/overdue", headers=admin_headers)
        assert r.status_code == 200
        assert isinstance(r.json(), list)


# ---------- Call logs ----------
class TestCallLogs:
    def test_create_call_log(self, session, admin_headers):
        pats = session.get(f"{API}/patients", headers=admin_headers).json()
        pid = pats[0]["id"]
        note = f"TEST-{uuid.uuid4().hex[:6]}"
        r = session.post(f"{API}/call-logs", headers=admin_headers,
                         json={"patient_id": pid, "outcome": "contattato", "notes": note})
        assert r.status_code == 200
        assert r.json()["outcome"] == "contattato"
        d = session.get(f"{API}/patients/{pid}", headers=admin_headers).json()
        assert any(c["notes"] == note for c in d["call_logs"])


# ---------- Tasks ----------
class TestTasks:
    def test_tasks_crud(self, session, admin_headers):
        r = session.get(f"{API}/tasks", headers=admin_headers)
        assert r.status_code == 200
        assert len(r.json()) >= 4
        c = session.post(f"{API}/tasks", headers=admin_headers,
                         json={"title": "TEST task", "priority": "alta", "due_date": date.today().isoformat()}).json()
        tid = c["id"]
        u = session.put(f"{API}/tasks/{tid}", headers=admin_headers,
                        json={"title": "TEST task done", "priority": "alta", "done": True}).json()
        assert u["done"] is True
        d = session.delete(f"{API}/tasks/{tid}", headers=admin_headers)
        assert d.status_code == 200


# ---------- Dashboard + Search ----------
class TestDashboard:
    def test_dashboard_structure(self, session, admin_headers):
        r = session.get(f"{API}/dashboard", headers=admin_headers)
        assert r.status_code == 200
        d = r.json()
        for k in ["kpis", "appts_today", "followups", "overdue", "tasks_today"]:
            assert k in d
        for k in ["patients_count", "open_estimates_count", "open_estimates_value",
                  "accepted_estimates_value", "lost_estimates_value", "no_show_rate",
                  "overdue_total", "appts_today_count"]:
            assert k in d["kpis"]

    def test_search(self, session, admin_headers):
        r = session.get(f"{API}/search?q=Ro", headers=admin_headers)
        assert r.status_code == 200
        d = r.json()
        assert "patients" in d


# ---------- Multi-tenant isolation ----------
class TestMultiTenantIsolation:
    def test_isolation(self, session, isolated_studio):
        h = isolated_studio["headers"]
        assert session.get(f"{API}/patients", headers=h).json() == []
        assert session.get(f"{API}/estimates", headers=h).json() == []
        assert session.get(f"{API}/appointments", headers=h).json() == []
        assert session.get(f"{API}/payments", headers=h).json() == []
        dash = session.get(f"{API}/dashboard", headers=h).json()
        assert dash["kpis"]["patients_count"] == 0
