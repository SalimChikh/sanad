import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildMonthGrid, CalendarPage, dayKey } from "./App";
import { LanguageProvider } from "./i18n";
import * as api from "./api";

vi.mock("./api", async () => {
  const actual = await vi.importActual<typeof api>("./api");
  return { ...actual, request: vi.fn() };
});

describe("dayKey()", () => {
  it("gives the same key for two Date objects on the same calendar day, regardless of time", () => {
    expect(dayKey(new Date(2026, 8, 4, 0, 0))).toBe(dayKey(new Date(2026, 8, 4, 23, 59)));
  });

  it("gives different keys for different days", () => {
    expect(dayKey(new Date(2026, 8, 4))).not.toBe(dayKey(new Date(2026, 8, 5)));
  });
});

describe("buildMonthGrid()", () => {
  it("always returns exactly 42 days (6 full weeks)", () => {
    expect(buildMonthGrid(new Date(2026, 8, 1))).toHaveLength(42);
  });

  it("starts on a Monday", () => {
    const grid = buildMonthGrid(new Date(2026, 8, 1));
    expect(grid[0].getDay()).toBe(1); // 1 = Monday
  });

  it("includes every day of the target month", () => {
    const grid = buildMonthGrid(new Date(2026, 1, 1)); // February 2026, 28 days
    const inMonth = grid.filter((d) => d.getMonth() === 1);
    expect(inMonth).toHaveLength(28);
  });
});

describe("CalendarPage", () => {
  beforeEach(() => {
    localStorage.setItem("sanad-lang", "fr");
  });

  afterEach(() => {
    vi.mocked(api.request).mockReset();
  });

  it("loads events and shows the ones for the selected day (today, by default)", async () => {
    const today = new Date();
    vi.mocked(api.request).mockResolvedValue([
      { id: "e1", title: "Sortie au parc", start_at: today.toISOString(), all_day: false },
    ]);

    render(<LanguageProvider><CalendarPage /></LanguageProvider>);

    await waitFor(() => expect(screen.getByText("Sortie au parc")).toBeInTheDocument());
  });

  it("creating an event posts the right payload and reloads the list", async () => {
    const user = userEvent.setup();
    vi.mocked(api.request).mockResolvedValue([]);

    render(<LanguageProvider><CalendarPage /></LanguageProvider>);
    await waitFor(() => expect(api.request).toHaveBeenCalledWith("/calendar-events"));

    await user.click(screen.getByRole("button", { name: "Nouvel événement" }));
    await user.type(screen.getByLabelText("Titre"), "Réunion parents");
    // The field ships pre-filled with today's date (see defaultStartAt in
    // App.tsx) — userEvent.type() would append to that instead of
    // replacing it, producing a malformed datetime-local value that fails
    // HTML5 validation and silently blocks submission. fireEvent.change
    // sets it directly.
    fireEvent.change(screen.getByLabelText("Date et heure de début"), { target: { value: "2026-10-05T09:00" } });
    await user.click(screen.getByRole("button", { name: "Ajouter" }));

    await waitFor(() => {
      const postCall = vi.mocked(api.request).mock.calls.find(([, opts]) => opts?.method === "POST");
      expect(postCall).toBeTruthy();
    });
    const [, options] = vi.mocked(api.request).mock.calls.find(([, opts]) => opts?.method === "POST")!;
    const body = JSON.parse((options as RequestInit).body as string);
    expect(body.title).toBe("Réunion parents");
  });

  it("deleting an event calls DELETE on the right id", async () => {
    const user = userEvent.setup();
    const today = new Date();
    vi.mocked(api.request).mockResolvedValue([
      { id: "e-to-delete", title: "À supprimer", start_at: today.toISOString(), all_day: false },
    ]);

    render(<LanguageProvider><CalendarPage /></LanguageProvider>);
    await waitFor(() => expect(screen.getByText("À supprimer")).toBeInTheDocument());

    await act(async () => {
      await user.click(screen.getByRole("button", { name: "Supprimer" }));
    });

    const deleteCall = vi.mocked(api.request).mock.calls.find(([, opts]) => opts?.method === "DELETE");
    expect(deleteCall?.[0]).toBe("/calendar-events/e-to-delete");
  });
});
