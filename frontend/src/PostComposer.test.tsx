import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PostComposer } from "./App";
import { LanguageProvider } from "./i18n";
import * as api from "./api";

vi.mock("./api", async () => {
  const actual = await vi.importActual<typeof api>("./api");
  return { ...actual, request: vi.fn(), uploadPhoto: vi.fn() };
});

function renderComposer(onPosted = vi.fn()) {
  // jsdom's default navigator.language is "en-US" — without pinning this,
  // LanguageProvider's browser-language auto-detection (see i18n.ts) would
  // render every string in English instead of the French this suite
  // queries by text/label.
  localStorage.setItem("sanad-lang", "fr");
  render(
    <LanguageProvider>
      <PostComposer childId="child-1" onPosted={onPosted} />
    </LanguageProvider>,
  );
  return { onPosted };
}

describe("PostComposer", () => {
  afterEach(() => {
    vi.mocked(api.request).mockReset();
    vi.mocked(api.uploadPhoto).mockReset();
  });

  it("submitting with neither a summary nor a photo is blocked client-side", async () => {
    const user = userEvent.setup();
    renderComposer();

    await user.click(screen.getByRole("button", { name: "Publier le résumé du jour" }));

    expect(await screen.findByText("Ajoutez un résumé ou au moins une photo.")).toBeInTheDocument();
    expect(api.request).not.toHaveBeenCalled();
  });

  it("submitting a summary alone posts type=daily with the caption", async () => {
    const user = userEvent.setup();
    vi.mocked(api.request).mockResolvedValue(undefined);
    const { onPosted } = renderComposer();

    await user.type(screen.getByPlaceholderText("Résumé de la journée…"), "Belle journée, a bien participé.");
    await user.click(screen.getByRole("button", { name: "Publier le résumé du jour" }));

    await waitFor(() => expect(api.request).toHaveBeenCalledWith("/posts", expect.objectContaining({ method: "POST" })));
    const [, options] = vi.mocked(api.request).mock.calls[0];
    const body = JSON.parse((options as RequestInit).body as string);
    expect(body).toMatchObject({ child_id: "child-1", type: "daily", caption: "Belle journée, a bien participé." });
    expect(onPosted).toHaveBeenCalled();
  });

  it("picking a mood and a meal status includes both in the payload", async () => {
    const user = userEvent.setup();
    vi.mocked(api.request).mockResolvedValue(undefined);
    renderComposer();

    await user.type(screen.getByPlaceholderText("Résumé de la journée…"), "Ok");
    await user.click(screen.getByRole("button", { name: /Joyeux/ }));
    await user.click(screen.getByRole("button", { name: "A tout mangé" }));
    await user.click(screen.getByRole("button", { name: "Publier le résumé du jour" }));

    await waitFor(() => expect(api.request).toHaveBeenCalled());
    const [, options] = vi.mocked(api.request).mock.calls[0];
    const body = JSON.parse((options as RequestInit).body as string);
    expect(body.mood).toBe("happy");
    expect(body.meal_status).toBe("ate_all");
  });

  it("clicking an already-selected mood toggles it back off", async () => {
    const user = userEvent.setup();
    vi.mocked(api.request).mockResolvedValue(undefined);
    renderComposer();

    await user.type(screen.getByPlaceholderText("Résumé de la journée…"), "Ok");
    const moodButton = screen.getByRole("button", { name: /Calme/ });
    await user.click(moodButton);
    await user.click(moodButton);
    await user.click(screen.getByRole("button", { name: "Publier le résumé du jour" }));

    await waitFor(() => expect(api.request).toHaveBeenCalled());
    const [, options] = vi.mocked(api.request).mock.calls[0];
    const body = JSON.parse((options as RequestInit).body as string);
    expect(body.mood).toBeNull();
  });

  it("a failed photo upload surfaces the error and does not block posting the summary alone", async () => {
    const user = userEvent.setup();
    vi.mocked(api.uploadPhoto).mockRejectedValue(new Error("Format non supporté."));
    vi.mocked(api.request).mockResolvedValue(undefined);
    renderComposer();

    const file = new File(["fake"], "photo.png", { type: "image/png" });
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    await user.upload(input, file);

    expect(await screen.findByText("Format non supporté.")).toBeInTheDocument();

    await user.type(screen.getByPlaceholderText("Résumé de la journée…"), "Malgré tout, belle journée.");
    await user.click(screen.getByRole("button", { name: "Publier le résumé du jour" }));
    await waitFor(() => expect(api.request).toHaveBeenCalled());
  });

  it("a successful upload includes the photo's path in media_urls", async () => {
    const user = userEvent.setup();
    vi.mocked(api.uploadPhoto).mockResolvedValue({ path: "/uploads/abc.png" });
    vi.mocked(api.request).mockResolvedValue(undefined);
    renderComposer();

    const file = new File(["fake"], "photo.png", { type: "image/png" });
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    await user.upload(input, file);

    await waitFor(() => expect(api.uploadPhoto).toHaveBeenCalledWith(file));
    await user.click(screen.getByRole("button", { name: "Publier le résumé du jour" }));

    await waitFor(() => expect(api.request).toHaveBeenCalledWith("/posts", expect.objectContaining({ method: "POST" })));
    const [, options] = vi.mocked(api.request).mock.calls[0];
    const body = JSON.parse((options as RequestInit).body as string);
    expect(body.media_urls).toEqual(["/uploads/abc.png"]);
  });
});
