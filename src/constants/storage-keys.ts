/**
 * Client storage and cookie constant keys
 */

export const STORAGE_KEYS = {
  THEME_MODE: "codeup_theme_mode",
  ACTIVE_TAB: "codeup_active_tab",
  AUDIO_VOLUME: "codeup_player_volume",
  LAST_VIDEO_POS: "codeup_last_video_pos",
} as const;

export const COOKIE_KEYS = {
  AUTH_TOKEN: "codeup_auth_token",
  SESSION_ID: "codeup_session",
} as const;
