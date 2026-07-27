import { describe, expect, it } from "vitest";
import { bookCoverPath } from "./covers";

describe("bookCoverPath", () => {
  it("monta o caminho relativo da capa pelo slug do livro", () => {
    expect(bookCoverPath("a-comuna-e-o-fogo")).toBe("/images/dev/a-comuna-e-o-fogo.jpg");
  });
});
