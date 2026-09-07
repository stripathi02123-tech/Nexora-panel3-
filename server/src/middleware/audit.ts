import { Response, NextFunction } from 'express';
import { AuthRequest } from './auth';
import { prisma } from '../utils/database';
import { logger } from '../utils/logger';

export function auditLog(action: string, resource: string) {
  return async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
    const originalJson = res.json.bind(res);
    res.json = function (body: any) {
      const resourceId = req.params.id || req.params.vmid || body?.id;
      prisma.auditLog.create({
        data: {
          userId: req.user?.id,
          action,
          resource,
          resourceId: resourceId?.toString(),
          details: JSON.stringify({ method: req.method, path: req.path, body: req.method === 'GET' ? undefined : sanitizeBody(req.body) }),
          ip: req.ip || req.socket.remoteAddress,
        },
      }).catch((err) => logger.error('Audit log error:', err));
      return originalJson(body);
    };
    next();
  };
}

function sanitizeBody(body: any): any {
  if (!body) return body;
  const sanitized = { ...body };
  delete sanitized.password;
  delete sanitized.secret;
  delete sanitized.token;
  delete sanitized.twoFactorSecret;
  return sanitized;
}
