import React from "react";
import { MemoryRouter } from "react-router-dom";
import { render, screen, waitFor } from "@testing-library/react";
import RevenueDashboard from "./RevenueDashboard";
import RevenueHealth from "./RevenueHealth";

jest.mock("../lib/api", () => ({
  api: { get: jest.fn() },
}));

const { api } = require("../lib/api");

function mockOverview() {
  return {
    kpis: {
      recovered_estimates_count_this_month: 8,
      recovered_revenue_this_month: 12000,
      sent_reminders_this_month: 30,
      reminder_to_reply_rate: 50,
      reminder_to_appointment_rate: 36,
      reminder_to_acceptance_rate: 28,
      best_template: null,
      best_contact_delay_days: 5,
      best_contact_time_range: "12-18",
      top_staff_member_by_conversion_rate: null,
    },
    funnel: { sent: 30, replied: 15, appt_booked: 10, accepted: 8 },
    weekly_recovered: [],
    templates_performance: [],
    top_open_estimates: [],
    lost_by_reason: [],
    month_compare: { current: { revenue: 12000 }, previous: { revenue: 10000 } },
  };
}

describe("Health Score UI integration", () => {
  test("renderizza card health score in Revenue Dashboard", async () => {
    api.get.mockImplementation((url) => {
      if (url === "/revenue/overview") return Promise.resolve({ data: mockOverview() });
      if (url === "/revenue/health-score") {
        return Promise.resolve({
          data: {
            score: 74,
            category: "Buono",
            explanation: "Revenue in crescita ma follow-up troppo lenti.",
            recommended_action: { key: "open_revenue_lost_radar", label: "Apri Revenue Lost Radar" },
            subscores: { acceptance_rate: 80, revenue_trend: 70, closing_speed: 42, no_show_rate: 78 },
            trend: { direction: "up", delta_score: 3 },
          },
        });
      }
      if (url === "/auth/team") return Promise.resolve({ data: [] });
      return Promise.resolve({ data: {} });
    });

    render(<MemoryRouter><RevenueDashboard /></MemoryRouter>);

    await waitFor(() => expect(screen.getByTestId("health-score-card")).toBeTruthy());
    expect(screen.getByTestId("health-score-value")).toHaveTextContent("74");
    const cta = screen.getByTestId("health-primary-cta-link");
    expect(cta.getAttribute("href")).toBe("/revenue/radar");
  });

  test("routing CTA pagina dedicata Health Score", async () => {
    api.get.mockResolvedValue({
      data: {
        score: 60,
        category: "Attenzione",
        explanation: "Il punteggio è in calo soprattutto per l'aumento dei no-show.",
        recommended_action: { key: "open_agenda", label: "Apri Agenda" },
        subscores: { acceptance_rate: 62, revenue_trend: 58, closing_speed: 67, no_show_rate: 35 },
        trend: { direction: "down", delta_score: -5 },
      },
    });

    render(<MemoryRouter><RevenueHealth /></MemoryRouter>);

    await waitFor(() => expect(screen.getByTestId("health-primary-cta")).toBeTruthy());
    expect(screen.getByTestId("health-primary-cta").getAttribute("href")).toBe("/appuntamenti");
    expect(screen.getByTestId("health-subscore-no_show_rate")).toBeTruthy();
  });
});
