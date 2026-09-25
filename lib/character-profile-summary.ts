import type { Character } from "./character-types";

/** Keep the original freeform persona untouched while exposing structured notes to generators. */
export function characterProfileSummary(character: Character, includeSecrets = false): string {
  const labels: Record<string, string> = {
    alias: "昵称", ageAndBirthday: "年龄与生日", role: "身份职业", signature: "签名",
    memorableQuote: "代表语录", appearance: "外貌", clothing: "着装", background: "成长经历",
    occupation: "工作处境", goals: "目标", secrets: "秘密", strengthsAndFlaws: "长处与缺点",
    desiresAndFears: "渴望与恐惧", habitsAndHobbies: "习惯爱好",
    relationshipStyle: "相处方式", boundaries: "边界", speakingStyle: "说话方式",
    dailyRoutine: "作息", initiative: "主动联系偏好",
  };
  return Object.entries(character.profileDetails || {})
    .filter(([key, value]) => (includeSecrets || key !== "secrets") && labels[key] && typeof value === "string" && value.trim())
    .map(([key, value]) => `${labels[key]}：${value.trim()}`)
    .join("\n");
}
