import { act, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { LanguageProvider, translate, useLang } from "./i18n";

const STORAGE_KEY = "sanad-lang";

function Probe() {
  const { lang, setLang, t, dir } = useLang();
  return (
    <div>
      <span data-testid="lang">{lang}</span>
      <span data-testid="dir">{dir}</span>
      <span data-testid="translated">{t("Se connecter")}</span>
      <button onClick={() => setLang("ar")}>go-ar</button>
      <button onClick={() => setLang("en")}>go-en</button>
      <button onClick={() => setLang("fr")}>go-fr</button>
    </div>
  );
}

describe("translate()", () => {
  it("returns French text unchanged when lang is fr", () => {
    expect(translate("fr", "Se connecter")).toBe("Se connecter");
  });

  it("looks up the Arabic dictionary when lang is ar", () => {
    expect(translate("ar", "Se connecter")).toBe("تسجيل الدخول");
  });

  it("looks up the English dictionary when lang is en", () => {
    expect(translate("en", "Se connecter")).toBe("Log in");
  });

  it("falls back to the French text for a string not yet translated, instead of throwing or returning a placeholder", () => {
    expect(translate("ar", "Un texte jamais ajouté au dictionnaire")).toBe(
      "Un texte jamais ajouté au dictionnaire",
    );
  });
});

describe("LanguageProvider / useLang()", () => {
  const originalLanguage = window.navigator.language;

  beforeEach(() => {
    localStorage.clear();
    document.documentElement.dir = "";
  });

  afterEach(() => {
    Object.defineProperty(window.navigator, "language", {
      value: originalLanguage,
      configurable: true,
    });
  });

  function mockBrowserLanguage(value: string) {
    Object.defineProperty(window.navigator, "language", {
      value,
      configurable: true,
    });
  }

  it("defaults to French when nothing is stored and the browser is neither Arabic nor English", () => {
    mockBrowserLanguage("fr-CA");
    render(<LanguageProvider><Probe /></LanguageProvider>);
    expect(screen.getByTestId("lang")).toHaveTextContent("fr");
    expect(screen.getByTestId("dir")).toHaveTextContent("ltr");
  });

  it("defaults to Arabic on first visit when the browser is in Arabic", () => {
    mockBrowserLanguage("ar-DZ");
    render(<LanguageProvider><Probe /></LanguageProvider>);
    expect(screen.getByTestId("lang")).toHaveTextContent("ar");
    expect(screen.getByTestId("dir")).toHaveTextContent("rtl");
  });

  it("defaults to English on first visit when the browser is in English", () => {
    mockBrowserLanguage("en-US");
    render(<LanguageProvider><Probe /></LanguageProvider>);
    expect(screen.getByTestId("lang")).toHaveTextContent("en");
  });

  it("an explicit stored choice overrides the browser language", () => {
    mockBrowserLanguage("ar-DZ");
    localStorage.setItem(STORAGE_KEY, "fr");
    render(<LanguageProvider><Probe /></LanguageProvider>);
    expect(screen.getByTestId("lang")).toHaveTextContent("fr");
  });

  it("switching to Arabic flips the document direction to rtl and back to ltr on switching away", async () => {
    mockBrowserLanguage("fr-CA");
    render(<LanguageProvider><Probe /></LanguageProvider>);

    await act(async () => {
      screen.getByRole("button", { name: "go-ar" }).click();
    });
    expect(screen.getByTestId("dir")).toHaveTextContent("rtl");
    expect(document.documentElement.dir).toBe("rtl");
    expect(document.documentElement.lang).toBe("ar");

    await act(async () => {
      screen.getByRole("button", { name: "go-en" }).click();
    });
    expect(screen.getByTestId("dir")).toHaveTextContent("ltr");
    expect(document.documentElement.dir).toBe("ltr");
  });

  it("setLang() persists the choice to localStorage", async () => {
    mockBrowserLanguage("fr-CA");
    render(<LanguageProvider><Probe /></LanguageProvider>);

    await act(async () => {
      screen.getByRole("button", { name: "go-en" }).click();
    });
    expect(localStorage.getItem(STORAGE_KEY)).toBe("en");
  });
});
