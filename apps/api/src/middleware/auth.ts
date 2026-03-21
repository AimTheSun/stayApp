import type { Request, Response, NextFunction } from "express";
import { supabaseAdmin } from "../supabase.js";

declare global {
  namespace Express {
    interface Request {
      userId: string;
      accessToken: string;
    }
  }
}

export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    res.status(401).json({ error: "Missing authorization header" });
    return;
  }

  const token = header.slice(7);
  const { data, error } = await supabaseAdmin.auth.getUser(token);

  if (error || !data.user) {
    res.status(401).json({ error: "Invalid token" });
    return;
  }

  req.userId = data.user.id;
  req.accessToken = token;
  next();
}
