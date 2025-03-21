export const Constants = {
  // Fixed ports
  STREAMLIT_PORT: 8501,
  HTTPS_PORT: 443,

  // Fixed paths
  STATIC_ASSETS_PATH: "/static/*",
  HEALTH_CHECK_PATH: "/_stcore/health",

  // Common string literals
  LOG_PREFIX: "sitechat",
  DASHBOARD_NAME: "SiteChat-Dashboard",
  DOMAIN_NAME: "sitechat.example.com",

  // Resource naming prefixes
  SECRET_ARN_PREFIX: "SiteChat-",

  // Fixed timeouts/durations (in seconds)
  HEALTH_CHECK_TIMEOUT: 5,
  HEALTH_CHECK_INTERVAL: 60,
  SCALE_COOLDOWN: 60,

  // Notification settings
  ALERT_EMAIL: "your-email@example.com",
};
