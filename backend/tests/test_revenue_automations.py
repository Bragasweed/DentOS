"""Phase 3 tests — Revenue Dashboard, Lost Radar, Automations."""
import os
import uuid
from datetime import date, timedelta

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


# ---------- Revenue overview ----------
class TestRevenueOverview:
    def test_overview_structure(self, session, admin_headers):
        r = session.get(f"{API}/revenue/overview", headers=admin_headers)
        assert r.status_code == 200
        d = r.json()
        for k in ("filters", "kpis", "funnel", "weekly_recovered",
                  "templates_performance", "top_open_estimates", "lost_by_reason", "month_compare"):
            assert k in d, f"missing {k}"
        for k in ("recovered_estimates_count_this_month", "recovered_revenue_this_month",
                  "sent_reminders_this_month", "reminder_to_reply_rate", "reminder_to_appointment_rate",
                  "reminder_to_acceptance_rate", "best_template", "best_contact_delay_days",
                  "best_contact_time_range", "top_staff_member_by_conversion_rate"):
            assert k in d["kpis"], f"missing kpi {k}"
        assert len(d["weekly_recovered"]) == 8
        assert len(d["top_open_estimates"]) > 0
        # funnel sanity
        f = d["funnel"]
        assert f["accepted"] <= f["appt_booked"] <= f["replied"] <= f["sent"]

    def test_overview_filters(self, session, admin_headers):
        # filter by template
        r = session.get(f"{API}/revenue/overview?template=wa_template_a", headers=admin_headers)
        assert r.status_code == 200
        d = r.json()
        # only one template should appear in templates_performance
        keys = {t["template_key"] for t in d["templates_performance"]}
        assert keys.issubset({"wa_template_a"})


# ---------- Lost Radar ----------
class TestRevenueRadar:
    def test_radar_returns_scored_items(self, session, admin_headers):
        r = session.get(f"{API}/revenue/radar", headers=admin_headers)
        assert r.status_code == 200
        items = r.json()
        assert isinstance(items, list)
        if items:
            it = items[0]
            for k in ("estimate_id", "patient_name", "estimate_amount", "lost_risk_score",
                      "recovery_probability", "suggested_template", "suggested_action",
                      "suggested_action_label", "reminders_count"):
                assert k in it, f"missing {k}"
            assert 5 <= it["lost_risk_score"] <= 100
            assert 8 <= it["recovery_probability"] <= 100

    def test_radar_sorted_by_risk_desc(self, session, admin_headers):
        items = session.get(f"{API}/revenue/radar", headers=admin_headers).json()
        scores = [x["lost_risk_score"] for x in items]
        assert scores == sorted(scores, reverse=True)

    def test_radar_report(self, session, admin_headers):
        r = session.get(f"{API}/revenue/radar/report", headers=admin_headers)
        assert r.status_code == 200
        d = r.json()
        for k in ("title", "summary", "total_at_risk", "recoverable_estimate",
                  "top_estimates", "cta_label", "cta_url", "generated_at"):
            assert k in d
        assert len(d["top_estimates"]) <= 5
        assert d["cta_url"] == "/recupero"


# ---------- Automations ----------
class TestAutomations:
    def test_seeded_rules_exist(self, session, admin_headers):
        r = session.get(f"{API}/automations/rules", headers=admin_headers)
        assert r.status_code == 200
        rows = r.json()
        assert len(rows) >= 5
        names = [x["name"] for x in rows]
        assert any("Giorno 3" in n for n in names)
        assert any("Giorno 30" in n for n in names)

    def test_create_update_delete_rule(self, session, admin_headers):
        body = {
            "name": "TEST · Giorno 5 WA",
            "trigger": "estimate_presented",
            "delay_days": 5,
            "channel": "whatsapp",
            "template_key": "wa_template_a",
            "active": True,
        }
        r = session.post(f"{API}/automations/rules", headers=admin_headers, json=body)
        assert r.status_code == 200
        rule = r.json()
        rid = rule["id"]
        assert rule["delay_days"] == 5

        body["active"] = False
        u = session.put(f"{API}/automations/rules/{rid}", headers=admin_headers, json=body)
        assert u.status_code == 200
        assert u.json()["active"] is False

        d = session.delete(f"{API}/automations/rules/{rid}", headers=admin_headers)
        assert d.status_code == 200

    def test_list_runs(self, session, admin_headers):
        r = session.get(f"{API}/automations/runs?limit=200", headers=admin_headers)
        assert r.status_code == 200
        runs = r.json()
        assert isinstance(runs, list) and len(runs) > 0
        # demo seed produces a mix of statuses
        statuses = {x["status"] for x in runs}
        assert "executed" in statuses
        # enrichment fields
        sample = runs[0]
        for k in ("rule_name", "rule_channel", "patient_name", "estimate_title"):
            assert k in sample

    def test_simulate_endpoint(self, session, admin_headers):
        r = session.post(f"{API}/automations/simulate", headers=admin_headers)
        assert r.status_code == 200
        d = r.json()
        assert "created" in d and "executed" in d


# ---------- Multi-tenant isolation ----------
class TestPhase3Isolation:
    def test_isolation(self, session):
        s = NoCookieSession()
        r = s.post(f"{API}/auth/register", json={
            "email": f"p3-iso-{uuid.uuid4().hex[:6]}@example.it",
            "password": "Phase3X!", "full_name": "P3 Iso",
            "studio_name": f"P3 Studio {uuid.uuid4().hex[:4]}",
            "studio_city": "", "studio_phone": "",
        })
        assert r.status_code == 200
        h = {"Authorization": f"Bearer {r.json()['access_token']}", "Content-Type": "application/json"}
        # New studio sees empty data
        ov = session.get(f"{API}/revenue/overview", headers=h).json()
        assert ov["kpis"]["sent_reminders_this_month"] == 0
        assert ov["kpis"]["recovered_estimates_count_this_month"] == 0
        assert session.get(f"{API}/revenue/radar", headers=h).json() == []
        assert session.get(f"{API}/automations/rules", headers=h).json() == []
        assert session.get(f"{API}/automations/runs", headers=h).json() == []
