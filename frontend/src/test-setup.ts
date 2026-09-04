// Loaded once before every test file (see vite.config.ts's test.setupFiles).
// Without this, React Testing Library never unmounts what a previous test
// rendered, so a second `render()` in the same file finds duplicate nodes
// from the earlier test still sitting in the DOM (queries like getByText
// then throw "multiple elements found" for reasons that have nothing to do
// with the test itself). Same setup as Fidli's frontend.
import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

afterEach(() => {
  cleanup();
});
