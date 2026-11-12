import dotenv from 'dotenv';

dotenv.config();

interface envConfig {
  port: number;
  databaseUrl: string;
  jwtSecret: string;
  jwtRefreshSecret: string;
  nodeEnv: string;
  redisUrl: string;
  storageDriver: string;
  storageLocalDir: string;
  storageMaxFileBytes: number;
  passwordResetTokenTtlMinutes: number;
  passwordResetMaxRequestsPerHour: number;
  passwordResetMinLength: number;
  notificationEmailProvider: string;
  notificationSmsProvider: string;
  smtpHost: string;
  smtpPort: number;
  smtpSecure: boolean;
  smtpUser: string;
  smtpPassword: string;
  mailFrom: string;
  emailWebhookUrl: string;
  emailWebhookToken: string;
  smsApiUrl: string;
  smsApiKey: string;
  smsSenderId: string;
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
    storageDriver: String(process.env.STORAGE_DRIVER || "local").toLowerCase(),
    storageLocalDir: String(process.env.STORAGE_LOCAL_DIR || "storage/uploads"),
    storageMaxFileBytes: numberFromEnv(process.env.STORAGE_MAX_FILE_BYTES, 10 * 1024 * 1024),
    passwordResetTokenTtlMinutes: numberFromEnv(process.env.PASSWORD_RESET_TOKEN_TTL_MINUTES, 30),
    passwordResetMaxRequestsPerHour: numberFromEnv(process.env.PASSWORD_RESET_MAX_REQUESTS_PER_HOUR, 5),
    passwordResetMinLength: numberFromEnv(process.env.PASSWORD_RESET_MIN_LENGTH, 8),
    notificationEmailProvider: String(process.env.NOTIFICATION_EMAIL_PROVIDER || "none").toLowerCase(),
    notificationSmsProvider: String(process.env.NOTIFICATION_SMS_PROVIDER || "none").toLowerCase(),
    smtpHost: String(process.env.SMTP_HOST || ""),
    smtpPort: numberFromEnv(process.env.SMTP_PORT, 587),
    smtpSecure: boolFromEnv(process.env.SMTP_SECURE, false),
    smtpUser: String(process.env.SMTP_USER || ""),
    smtpPassword: String(process.env.SMTP_PASSWORD || ""),
    mailFrom: String(process.env.MAIL_FROM || "no-reply@anantha.local"),
    emailWebhookUrl: String(process.env.NOTIFICATION_EMAIL_WEBHOOK_URL || ""),
    emailWebhookToken: String(process.env.NOTIFICATION_EMAIL_WEBHOOK_TOKEN || ""),
    smsApiUrl: String(process.env.SMS_API_URL || ""),
    smsApiKey: String(process.env.SMS_API_KEY || ""),
    smsSenderId: String(process.env.SMS_SENDER_ID || ""),
    frontendUrl: String(process.env.FRONTEND_URL || "http://localhost:5173"),
    logLevel: String(process.env.LOG_LEVEL || "info").toLowerCase(),
}

export default envConfig
