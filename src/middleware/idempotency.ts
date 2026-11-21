import type { Request, Response, NextFunction } from "express";
import redisClient from "../config/redis.js";
import { error } from "../utils/http.js";


const LUA_SCRIPT = `
local s = redis.call('HGET', KEYS[1], 'status')
if not s then
  redis.call('HSET', KEYS[1], 'status', 'in_progress')
  redis.call('PEXPIRE', KEYS[1], ARGV[1])
  return 'new'
elseif s == 'done' then
  return redis.call('HGET', KEYS[1], 'resp')
else
  return 'in_progress'
end
`;

const DONE_TTL_MS = 1 * 60 * 60 * 1000;

const applyIdempotency = (inFlightTtlSeconds = 60) => {
  return async (req: Request, res: Response, next: NextFunction) => {
    const userId = req.user?.id;
    if (!userId) {
      return error(
        res,
        400,
        "User id missing in idempotency middleware"
      );
    }

    const idempotencyKey = req.headers["idempotency-key"];
    if (typeof idempotencyKey !== "string" || idempotencyKey.length === 0) {
      return error(res, 400, "idempotency-key header is required");
    }

    const key = `idem:${userId}:${idempotencyKey}`;

    let result: unknown;
    try {
      result = await redisClient.eval(LUA_SCRIPT, {
        keys: [key],
        arguments: [String(inFlightTtlSeconds * 1000)],
      });
    } catch (err) {
      console.error("Idempotency middleware: Redis error, allowing request through", err);
      return next();
    }

    if (result === "new") {
      const originalJson = res.json.bind(res);

      res.json = ((body: unknown) => {
        // Restore first so a second call can never write twice.
        res.json = originalJson;

        if (res.statusCode >= 400) {
          void redisClient
            .del(key)
            .catch((err) =>
              console.error("Idempotency middleware: failed to clear key", err)
            );
        } else {
          void redisClient
            .multi()
            .hSet(key, {
              status: "done",
              resp: JSON.stringify({ code: res.statusCode, body }),
            })
            .pExpire(key, DONE_TTL_MS)
            .exec()
            .catch((err) =>
              console.error("Idempotency middleware: failed to store response", err)
            );
        }

        return originalJson(body);
      }) as typeof res.json;

      return next();
    }

    if (result === "in_progress") {
      return error(
        res,
        409,
        "A request with this idempotency key is already in progress"
      );
    }

    if (typeof result !== "string") {
      return error(
        res,
        409,
        "Idempotency record is incomplete for this key"
      );
    }

    try {
      const stored = JSON.parse(result) as { code: number; body: unknown };
      return res.status(stored.code).json(stored.body);
    } catch {
      return error(
        res,
        409,
        "Idempotency record is invalid for this key"
      );
    }
  };
};

export default applyIdempotency;
