export type CharacterGovernancePreset = {
  id: string;
  name: string;
  oocPatchPrompt: string;
  riskReportPrompt: string;
  updatedAt: string;
};

export type CharacterCustomApiConfig = {
  enabled: boolean;
  provider: string;
  baseUrl: string;
  apiKey: string;
  model: string;
  temperature?: number;
};

/** Optional structured dossier fields. Legacy persona text remains intact. */
export type CharacterProfileDetails = {
  alias?: string;
  ageAndBirthday?: string;
  role?: string;
  signature?: string;
  memorableQuote?: string;
  appearance?: string;
  clothing?: string;
  background?: string;
  occupation?: string;
  goals?: string;
  secrets?: string;
  strengthsAndFlaws?: string;
  desiresAndFears?: string;
  habitsAndHobbies?: string;
  relationshipStyle?: string;
  boundaries?: string;
  speakingStyle?: string;
  dailyRoutine?: string;
  initiative?: string;
};

export type Character = {
  id: string;
  name: string;
  avatar: string | null; // data URL 或外部 URL
  persona: string;       // 人设
  briefPersona?: string; // 简量版人设：注入到同世界有关系角色的「角色关系」marker，供对方了解 TA（防 OOC）
  briefPersonaUpdatedAt?: string; // 简介生成时间；早于 updatedAt 时编辑器提示「设定已更新，建议重新生成」
  wechatID?: string;     // 手机号格式的微信号
  personality?: string;    // 角色性格
  profileDetails?: CharacterProfileDetails; // 分类细节，不覆盖完整原始人设
  faceReferenceImage?: string; // 仅存本地参考图，不代表已接入生图模型
  timeZone?: string;       // IANA 时区，例如 America/New_York；空值表示跟随系统时间
  tags?: string[];
  createdAt: string;
  updatedAt: string;

  // 人格治理系统字段
  bannedWordsEnabled?: boolean;
  bannedWords?: string[];
  governancePresets?: CharacterGovernancePreset[];
  activePresetId?: string;
  oocRawComplaint?: string;
  oocPatchPrompt?: string;
  riskReportPrompt?: string;
  riskReportCollapsed?: boolean;

  // 角色独立 API 绑定
  customApiConfig?: CharacterCustomApiConfig;

  // 画布坐标与渲染属性
  canvasX?: number;
  canvasY?: number;
  canvasRot?: number;
  canvasZIndex?: number;
  polaroidStyle?: number; // 用户选择的拍立得样式索引
  polaroidSize?: "random" | "small" | "medium" | "large";
  polaroidImageX?: number;
  polaroidImageY?: number;
  polaroidImageZoom?: number;
};

export type CanvasBgItem = {
  id: string;
  type: 'a4' | 'yellow-note' | 'blue-note' | 'torn' | 'grid' | 'scrap';
  x: number;
  y: number;
  rot: number;
  zIndex: number;
  worldId?: string; // 所属世界画布；缺省 = 默认世界（存量数据零迁移）
};
