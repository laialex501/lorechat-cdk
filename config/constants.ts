import { FoundationModelIdentifier } from "aws-cdk-lib/aws-bedrock";

export const Constants = {
  // Fixed ports
  STREAMLIT_PORT: 8501,
  HTTPS_PORT: 443,

  // Fixed paths
  STATIC_ASSETS_PATH: "/static/*",
  HEALTH_CHECK_PATH: "/_stcore/health",

  // Common string literals
  LOG_PREFIX: "lorechat",
  DASHBOARD_NAME: "LoreChat-Dashboard",

  // Domain configuration
  ROOT_DOMAIN_NAME: "lorechat.dev",
  SUBDOMAIN: "chat",

  // Resource naming prefixes
  SECRET_ARN_PREFIX: "LoreChat-",

  // Fixed timeouts/durations (in seconds)
  HEALTH_CHECK_TIMEOUT: 10,
  HEALTH_CHECK_INTERVAL: 60,
  SCALE_COOLDOWN: 60,

  // Notification settings
  ALERT_EMAIL: "laialex501@gmail.com",

  // Embedding model for vector DB
  EMBEDDING_MODEL_ID:
    FoundationModelIdentifier.AMAZON_TITAN_EMBED_TEXT_V2_0.modelId,
  EMBEDDING_DIMENSIONS: 512,

  // Upstash endpoint
  UPSTASH_ENDPOINT_SECRET_PREFIX: "upstash-endpoint",
  UPSTASH_TOKEN_SECRET_PREFIX: "upstash-token",
  OPENAI_API_KEY_SECRET_PREFIX: "openai-api",
  TAVILY_API_KEY_SECRET_PREFIX: "tavily-api", // https://tavily.com/
};
