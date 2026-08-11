import { describe, expect, it } from "vitest";
import { buildSurveyorSuggestions } from "../../lib/entry/suggestions";

describe("buildSurveyorSuggestions", () => {
  it("เลือกชื่อเดิมแล้วเติมโปรไฟล์ผู้สำรวจให้ครบ", () => {
    const result = buildSurveyorSuggestions([
      {
        surveyorPrefixId: "prefix-1",
        surveyorPrefixOther: null,
        surveyorFirstNameOnPaper: "สมชาย",
        surveyorLastNameOnPaper: "ใจดี",
        surveyorPhoneOnPaper: "0812345678",
      },
    ]);

    expect(result.surveyorFirstNameOnPaper[0]).toEqual({
      value: "สมชาย",
      label: "สมชาย ใจดี · 0812345678",
      fill: {
        surveyorPrefix: "prefix-1",
        surveyorFirstNameOnPaper: "สมชาย",
        surveyorLastNameOnPaper: "ใจดี",
        surveyorPhoneOnPaper: "0812345678",
      },
    });
  });

  it("ตัดรายการซ้ำและข้ามแถวที่ไม่มีชื่อ", () => {
    const row = {
      surveyorPrefixId: null,
      surveyorPrefixOther: null,
      surveyorFirstNameOnPaper: "มานี",
      surveyorLastNameOnPaper: "มีใจ",
      surveyorPhoneOnPaper: null,
    };
    const result = buildSurveyorSuggestions([
      row,
      row,
      { ...row, surveyorFirstNameOnPaper: null, surveyorLastNameOnPaper: null },
    ]);
    expect(result.surveyorFirstNameOnPaper).toHaveLength(1);
    expect(result.surveyorLastNameOnPaper).toHaveLength(1);
  });
});
