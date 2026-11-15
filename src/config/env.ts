import dotenv from 'dotenv';

dotenv.config();

interface envConfig {
  port: number;
  databaseUrl: string;
  jwtSecret: string;
  jwtRefreshSecret: string;
  nodeEnv: string;
  redisUrl: string;
  cloudinaryCloudName: string;
  cloudinaryApiKey: string;
  cloudinaryApiSecret: string;

  smtpHost: string;
  smtpPort: number;
  smtpSecure: boolean;
  smtpUser: string;
  smtpPassword: string;

  frontendUrl: string;
  logLevel: string;
}

function numberFromEnv(value: string | undefined, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function boolFromEnv(value: string | undefined, fallback: boolean) {
  if (value === undefined) return fallback;
  return ['1', 'true', 'yes', 'on'].includes(value.toLowerCase());
}

const envConfig: envConfig = {
    port: numberFromEnv(process.env.PORT, 3030),
    databaseUrl: String(process.env.DATABASE_URL),
    jwtSecret: String(process.env.JWT_SECRET),
    jwtRefreshSecret: String(process.env.JWT_REFRESH_SECRET),
    nodeEnv: String(process.env.NODE_ENV),
    redisUrl: String(process.env.REDIS_URL),
    cloudinaryCloudName: String(process.env.CLOUDINARY_CLOUD_NAME),
    cloudinaryApiKey: String(process.env.CLOUDINARY_API_KEY),
    cloudinaryApiSecret: String(process.env.CLOUDINARY_API_SECRET),
    smtpHost: String(process.env.SMTP_HOST || ""),
    smtpPort: numberFromEnv(process.env.SMTP_PORT, 587),
    smtpSecure: boolFromEnv(process.env.SMTP_SECURE, false),
    smtpUser: String(process.env.SMTP_USER || ""),
    smtpPassword: String(process.env.SMTP_PASSWORD || ""),
    frontendUrl: String(process.env.FRONTEND_URL || "http://localhost:5173"),
    logLevel: String(process.env.LOG_LEVEL || "info").toLowerCase(),
}

export default envConfig
