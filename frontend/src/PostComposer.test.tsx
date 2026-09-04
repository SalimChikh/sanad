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

  it("submitting the photo tab without picking a file is blocked client-side — no request is sent", async () => {
    const user = userEvent.setup();
    renderComposer();

    await user.click(screen.getByRole("button", { name: /Photo/ }));
    await user.click(screen.getByRole("button", { name: "Publier une photo" }));

    expect(await screen.findByText("Choisissez une photo avant de publier.")).toBeInTheDocument();
    expect(api.request).not.toHaveBeenCalled();
  });

  it("submitting a note posts type=note with the caption", async () => {
    const user = userEvent.setup();
    vi.mocked(api.request).mockResolvedValue(undefined);
    const { onPosted } = renderComposer();

    await user.type(screen.getByPlaceholderText("Écrire une note…"), "A bien mangé sa collation.");
    await user.click(screen.getByRole("button", { name: "Publier une note" }));

    await waitFor(() => expect(api.request).toHaveBeenCalledWith("/posts", expect.objectContaining({ method: "POST" })));
    const [, options] = vi.mocked(api.request).mock.calls[0];
    const body = JSON.parse((options as RequestInit).body as string);
    expect(body).toMatchObject({ child_id: "child-1", type: "note", caption: "A bien mangé sa collation." });
    expect(onPosted).toHaveBeenCalled();
  });

  it("a failed upload surfaces the error and does not populate the photo path", async () => {
    const user = userEvent.setup();
    vi.mocked(api.uploadPhoto).mockRejectedValue(new Error("Format non supporté."));
    renderComposer();

    await user.click(screen.getByRole("button", { name: /Photo/ }));
    const file = new File(["fake"], "photo.png", { type: "image/png" });
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    await user.upload(input, file);

    expect(await screen.findByText("Format non supporté.")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Publier une photo" }));
    expect(await screen.findByText("Choisissez une photo avant de publier.")).toBeInTheDocument();
  });

  it("a successful upload then lets the photo post go through with media_url set", async () => {
    const user = userEvent.setup();
    vi.mocked(api.uploadPhoto).mockResolvedValue({ path: "/uploads/abc.png" });
    vi.mocked(api.request).mockResolvedValue(undefined);
    renderComposer();

    await user.click(screen.getByRole("button", { name: /Photo/ }));
    const file = new File(["fake"], "photo.png", { type: "image/png" });
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    await user.upload(input, file);

    await waitFor(() => expect(api.uploadPhoto).toHaveBeenCalledWith(file));

    await user.click(screen.getByRole("button", { name: "Publier une photo" }));

    await waitFor(() => expect(api.request).toHaveBeenCalledWith("/posts", expect.objectContaining({ method: "POST" })));
    const [, options] = vi.mocked(api.request).mock.calls[0];
    const body = JSON.parse((options as RequestInit).body as string);
    expect(body).toMatchObject({ type: "photo", media_url: "/uploads/abc.png" });
  });
});
