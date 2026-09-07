import { Request, Response, NextFunction } from 'express';
import { LicenseService } from '../services/LicenseService';
import { config } from '../config';

export async function requireLicense(req: Request, res: Response, next: NextFunction) {
  if (!config.licenseRequired) return next();
  const openPaths = ['/api/health', '/api/license/status', '/api/license/activate', '/api/license/validate'];
  if (openPaths.some((p) => req.path === p || req.originalUrl.startsWith(p))) return next();
  const status = await LicenseService.status();
  if (!status.activated) return res.status(423).json({ error: 'Nexora Panel license activation required', activationRequired: true });
  next();
}
