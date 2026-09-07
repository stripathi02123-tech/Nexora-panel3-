import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../config';
import { prisma } from '../utils/database';

export interface AuthRequest extends Request {
  user?: {
    id: string;
    email: string;
    name: string;
    role: string;
  };
  apiKey?: string;
}

interface JwtPayload {
  id: string;
  email: string;
  name: string;
  role: string;
}

export async function authenticate(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const authHeader = req.headers.authorization;
    const apiKeyHeader = req.headers['x-api-key'] as string;

    if (apiKeyHeader) {
      const apiKey = await prisma.apiKey.findUnique({ where: { key: apiKeyHeader }, include: { user: true } });
      if (!apiKey || !apiKey.user.isActive) {
        res.status(401).json({ error: 'Invalid or inactive API key' });
        return;
      }
      await prisma.apiKey.update({ where: { id: apiKey.id }, data: { lastUsed: new Date() } });
      req.user = { id: apiKey.user.id, email: apiKey.user.email, name: apiKey.user.name, role: apiKey.user.role };
      req.apiKey = apiKey.key;
      next();
      return;
    }

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      res.status(401).json({ error: 'No token provided' });
      return;
    }

    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, config.jwtSecret) as JwtPayload;
    req.user = { id: decoded.id, email: decoded.email, name: decoded.name, role: decoded.role };
    next();
  } catch (error) {
    if (error instanceof jwt.TokenExpiredError) {
      res.status(401).json({ error: 'Token expired' });
      return;
    }
    res.status(401).json({ error: 'Invalid token' });
  }
}

export function hasRole(...roles: string[]) {
  return (req: AuthRequest, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ error: 'Not authenticated' });
      return;
    }
    if (!roles.includes(req.user.role)) {
      res.status(403).json({ error: 'Insufficient permissions' });
      return;
    }
    next();
  };
}

export const hasAdmin = hasRole('ADMIN');

export function optionalAuth(req: AuthRequest, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    try {
      const token = authHeader.split(' ')[1];
      const decoded = jwt.verify(token, config.jwtSecret) as JwtPayload;
      req.user = { id: decoded.id, email: decoded.email, name: decoded.name, role: decoded.role };
    } catch {
      // Ignore invalid tokens for optional auth
    }
  }
  next();
}
