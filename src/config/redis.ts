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
            return Math.min(retries * 100, 3000); // Exponential backoff
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

export default redisClient;
