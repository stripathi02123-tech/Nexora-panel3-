import { Router } from 'express';
import { LicenseService } from '../services/LicenseService';

const router = Router();

router.get('/status', async (req, res, next) => {
  try {
    return res.json(await LicenseService.status());
  } catch (error) {
    return next(error);
  }
});

router.post('/activate', async (req, res) => {
  try {
    const { licenseKey } = req.body;
    if (!licenseKey) return res.status(400).json({ error: 'License key is required' });
    const domain = req.headers.host || req.hostname;
    const ip = req.ip;
    return res.json(await LicenseService.activate(licenseKey, domain, ip));
  } catch (error: any) {
    return res.status(400).json({ error: error.response?.data?.error || error.message || 'Activation failed' });
  }
});

router.post('/validate', async (req, res, next) => {
  try {
    const valid = await LicenseService.validate();
    return res.json({ valid });
  } catch (error) {
    return next(error);
  }
});

export default router;
