import { createClient } from 'redis';
import envConfig from './env.js';


const redisClient = createClient({
    url: envConfig.redisUrl || 'redis://localhost:6379',
    socket: {
        connectTimeout: 5000,
        keepAlive: true,
        keepAliveInitialDelay: 30000,
        reconnectStrategy: (retries) => {
            if (retries > 10) return new Error('Redis max retries reached');
            return Math.min(100 * 2 ** retries, 3000);
        }
    }
});

redisClient.on('error', (err) => console.error('Redis Client Error', err));
redisClient.on('connect', () => console.log('Redis Client Connecting...'));
redisClient.on('ready', () => console.log('Redis Client Ready'));

(async () => {
    try {
        await redisClient.connect();
    } catch (err) {
        console.error('Could not connect to Redis:', err);
    }
})();

export type RedisGetResult =
    | { ok: true; value: string | null }
    | { ok: false };

export async function redisGet(key: string): Promise<RedisGetResult> {
    try {
        const value = await redisClient.get(key);
        return { ok: true, value };
    } catch (error) {
        console.error(`Redis GET failed for key "${key}":`, error);
        return { ok: false };
    }
}

export async function redisSet(
    key: string,
    value: string,
    ttlSeconds: number
): Promise<boolean> {
    try {
        await redisClient.set(key, value, {
            EX: ttlSeconds
        });
        return true;
    } catch (error) {
        console.error(`Redis SET failed for key "${key}":`, error);
        return false;
    }
}

export async function redisDel(key: string): Promise<boolean> {
    try {
        await redisClient.del(key);
        return true;
    } catch (error) {
        console.error(`Redis DEL failed for key "${key}":`, error);
        return false;
    }
}

export default redisClient;
