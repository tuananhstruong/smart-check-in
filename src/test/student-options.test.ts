import { describe, expect, it } from "vitest";
import { buildStudentOptions } from "@/components/ChamNhanhApp";

const past = [
  { studentId: null, name: "Bình", className: "9A3", subject: "Toán" },
  { studentId: null, name: "Chi", className: "8C2", subject: "Văn" },
  { studentId: null, name: "bình ", className: "9a3", subject: "Toán" },
];

describe("buildStudentOptions", () => {
  it("only lists students graded in the current class", () => {
    expect(buildStudentOptions([], past, "9A3").map((o) => o.name)).toEqual(["Bình"]);
  });
  it("lists all graded students when no class is entered", () => {
    expect(buildStudentOptions([], past, "").map((o) => o.name)).toEqual(["Bình", "Chi"]);
  });
});
