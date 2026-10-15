import jwt from "jsonwebtoken";

export function accessToken(
  userId = "u1",
  sessionId = "test-session"
) {
  return jwt.sign(
    { userId, role: "ADMIN", sessionId },
    process.env.JWT_SECRET as string,
    { expiresIn: "1h" }
  );
}

export function refreshToken(
  userId = "u1",
  sessionId = "test-session"
) {
  return jwt.sign(
    { userId, sessionId },
    process.env.JWT_REFRESH_SECRET as string,
    { expiresIn: "7d" }
  );
}
