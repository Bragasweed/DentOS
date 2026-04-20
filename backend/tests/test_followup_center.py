"""Follow-up Center tests — Phase 2."""
import os
import uuid
from datetime import date, datetime, timezone, timedelta

import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://dentalflow-ai.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"

ADMIN_EMAIL = "admin@dentalflow.it"
ADMIN_PASSWORD = "DentalFlow2026!"


class NoCookieSession(requests.Session):
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


@pytest.fixture(scope="module")
def admin_headers():
    s = NoCookieSession()
    r = s.post(f"{API}/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD})
    assert r.status_code == 200, r.text
    return {"Authorization": f"Bearer {r.json()['access_token']}", "Content-Type": "application/json"}


class TestTemplates:
    def test_list_templates(self, session, admin_headers):
        r = session.get(f"{API}/followup-center/templates", headers=admin_headers)
        assert r.status_code == 200
        d = r.json()
        keys = [t["key"] for t in d["templates"]]
        for k in ("wa_template_a", "wa_template_b", "email_reminder", "manual_note"):
            assert k in keys
        assert "recommended_action_labels" in d
        assert "studio_name" in d


class TestQueue:
    def test_queue_has_scoring_and_action(self, session, admin_headers):
        r = session.get(f"{API}/followup-center/queue", headers=admin_headers)
        assert r.status_code == 200
        q = r.json()
        assert isinstance(q, list) and len(q) >= 1
        row = q[0]
        # required fields
        for k in ("estimate_id", "estimate_title", "estimate_amount", "patient_id",
                  "patient_name", "days_since", "score", "recommended_action",
                  "recommended_action_label", "reminders_count"):
            assert k in row, f"missing {k}"
        assert 0 <= row["score"] <= 100
        assert row["recommended_action"] in ("call_now", "send_wa_a", "send_wa_b", "send_email", "archive_or_manual")

    def test_queue_sorted_by_score_desc(self, session, admin_headers):
        q = session.get(f"{API}/followup-center/queue", headers=admin_headers).json()
        scores = [x["score"] for x in q]
        assert scores == sorted(scores, reverse=True)


class TestReminderLifecycle:
    def test_send_and_update_status(self, session, admin_headers):
        # Grab a queue item
        q = session.get(f"{API}/followup-center/queue", headers=admin_headers).json()
        assert q, "need at least one item in the queue to test"
        target = q[0]

        # Send a reminder
        payload = {
            "patient_id": target["patient_id"],
            "estimate_id": target["estimate_id"],
            "channel": "whatsapp",
            "template_key": "wa_template_a",
            "message_text": "Test message for Paziente",
            "subject": None,
        }
        r = session.post(f"{API}/reminders", headers=admin_headers, json=payload)
        assert r.status_code == 200, r.text
        rem = r.json()
        assert rem["status"] == "sent"
        assert rem["template_key"] == "wa_template_a"
        rid = rem["id"]

        # Check it appears in /reminders listing (filtered by patient)
        lst = session.get(f"{API}/reminders?patient_id={target['patient_id']}", headers=admin_headers).json()
        assert any(x["id"] == rid for x in lst)

        # Update its status -> replied
        u = session.put(f"{API}/reminders/{rid}/status", headers=admin_headers,
                        json={"status": "replied", "outcome_notes": "Ha risposto via WA"})
        assert u.status_code == 200
        assert u.json()["status"] == "replied"

        # Update to accepted -> must also update the estimate status to 'accettato'
        u2 = session.put(f"{API}/reminders/{rid}/status", headers=admin_headers,
                         json={"status": "accepted", "outcome_notes": ""})
        assert u2.status_code == 200
        assert u2.json()["status"] == "accepted"
        # verify linked estimate
        ests = session.get(f"{API}/estimates", headers=admin_headers).json()
        linked = next((e for e in ests if e["id"] == target["estimate_id"]), None)
        assert linked is not None
        assert linked["status"] == "accettato"

    def test_reject_reminder_updates_estimate(self, session, admin_headers):
        # Create a fresh estimate to avoid interfering with other tests
        pats = session.get(f"{API}/patients", headers=admin_headers).json()
        pid = pats[0]["id"]
        est = session.post(f"{API}/estimates", headers=admin_headers, json={
            "patient_id": pid, "title": "FC-Test Rejected", "total_amount": 900,
            "status": "presentato", "presented_at": date.today().isoformat(),
        }).json()
        rem = session.post(f"{API}/reminders", headers=admin_headers, json={
            "patient_id": pid, "estimate_id": est["id"],
            "channel": "whatsapp", "template_key": "wa_template_b",
            "message_text": "Test B",
        }).json()
        session.put(f"{API}/reminders/{rem['id']}/status", headers=admin_headers,
                    json={"status": "rejected", "outcome_notes": ""})
        all_e = session.get(f"{API}/estimates", headers=admin_headers).json()
        e2 = next(x for x in all_e if x["id"] == est["id"])
        assert e2["status"] == "rifiutato"


class TestABStats:
    def test_ab_structure(self, session, admin_headers):
        r = session.get(f"{API}/followup-center/ab-stats", headers=admin_headers)
        assert r.status_code == 200
        d = r.json()
        for k in ("wa_template_a", "wa_template_b", "email_reminder"):
            assert k in d["buckets"]
            b = d["buckets"][k]
            for m in ("sent", "delivered", "read", "replied", "appt_booked", "accepted", "rejected",
                      "no_response", "reply_rate", "booking_rate", "acceptance_rate", "avg_hours_to_conversion"):
                assert m in b
        # winner should be either None, "tie", or one of the wa_ keys
        assert d["winner"] in (None, "tie", "wa_template_a", "wa_template_b")

    def test_seeded_data_produces_a_winner(self, session, admin_headers):
        """Seed data is engineered so Template A outperforms Template B."""
        d = session.get(f"{API}/followup-center/ab-stats", headers=admin_headers).json()
        a = d["buckets"]["wa_template_a"]
        b = d["buckets"]["wa_template_b"]
        assert a["sent"] >= 5 and b["sent"] >= 5
        assert a["acceptance_rate"] >= b["acceptance_rate"]
        assert d["winner"] in ("wa_template_a", "tie")


class TestMultiTenantIsolation:
    def test_other_studio_sees_empty_queue(self, session):
        s = NoCookieSession()
        email = f"fc-iso-{uuid.uuid4().hex[:6]}@example.it"
        r = s.post(f"{API}/auth/register", json={
            "email": email, "password": "PhaseTwo2026!", "full_name": "Iso Test",
            "studio_name": f"Iso Studio {uuid.uuid4().hex[:4]}",
            "studio_city": "Napoli", "studio_phone": "",
        })
        assert r.status_code == 200
        h = {"Authorization": f"Bearer {r.json()['access_token']}", "Content-Type": "application/json"}
        assert session.get(f"{API}/followup-center/queue", headers=h).json() == []
        assert session.get(f"{API}/reminders", headers=h).json() == []
        stats = session.get(f"{API}/followup-center/ab-stats", headers=h).json()
        assert stats["buckets"]["wa_template_a"]["sent"] == 0
