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
}

const envConfig: envConfig = {
    port: Number((process.env.PORT)|| 3030),
    databaseUrl: String(process.env.DATABASE_URL),
    jwtSecret: String(process.env.JWT_SECRET),
    jwtRefreshSecret: String(process.env.JWT_REFRESH_SECRET),
    nodeEnv: String(process.env.NODE_ENV),
    redisUrl: String(process.env.REDIS_URL),
    storageDriver: String(process.env.STORAGE_DRIVER || "local").toLowerCase(),
    storageLocalDir: String(process.env.STORAGE_LOCAL_DIR || "storage/uploads"),
    storageMaxFileBytes: Number(process.env.STORAGE_MAX_FILE_BYTES || 10 * 1024 * 1024),
}

export default envConfig
