import { createRemoteJWKSet, jwtVerify } from "jose";

export function createRequireLogin(authURL) {
  const jwks = createRemoteJWKSet(new URL("/api/auth/jwks", authURL));

  return async function requireLogin(req, res, next) {
    const token = req.headers.authorization?.startsWith("Bearer ")
      ? req.headers.authorization.slice(7)
      : null;

    if (!token) {
      return res.status(401).send({ message: "Please log in first." });
    }

    try {
      const result = await jwtVerify(token, jwks, {
        issuer: authURL,
        audience: authURL,
      });

      if (typeof result.payload.email !== "string") {
        return res.status(401).send({ message: "Invalid login token." });
      }

      req.user = { email: result.payload.email };
      next();
    } catch (error) {
      res.status(401).send({ message: "Invalid or expired login token." });
    }
  };
}
