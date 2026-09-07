import { Router, Request, Response } from 'express';
import { body } from 'express-validator';
import { AuthService } from '../services/AuthService';
import { AuthRequest, authenticate } from '../middleware/auth';
import { validate } from '../middleware/validate';
import { prisma } from '../utils/database';

const router = Router();

router.post(
  '/register',
  validate([
    body('email').isEmail().normalizeEmail(),
    body('password').isLength({ min: 8 }),
    body('name').notEmpty().trim(),
  ]),
  async (req: Request, res: Response) => {
    try {
      const { email, password, name } = req.body;
      const result = await AuthService.register(email, password, name);
      res.status(201).json(result);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  }
);

router.post(
  '/login',
  validate([
    body('email').isEmail().normalizeEmail(),
    body('password').notEmpty(),
  ]),
  async (req: Request, res: Response) => {
    try {
      const { email, password } = req.body;
      const result = await AuthService.login(email, password);
      res.json(result);
    } catch (error: any) {
      res.status(401).json({ error: error.message });
    }
  }
);

router.post(
  '/verify-2fa',
  validate([
    body('userId').notEmpty(),
    body('token').notEmpty(),
  ]),
  async (req: Request, res: Response) => {
    try {
      const { userId, token } = req.body;
      const result = await AuthService.verify2FA(userId, token);
      res.json(result);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  }
);

router.post(
  '/forgot-password',
  validate([body('email').isEmail().normalizeEmail()]),
  async (req: Request, res: Response) => {
    try {
      await AuthService.forgotPassword(req.body.email);
      res.json({ message: 'If the email exists, a reset link has been sent' });
    } catch (error: any) {
      res.json({ message: 'If the email exists, a reset link has been sent' });
    }
  }
);

router.post(
  '/reset-password',
  validate([
    body('email').isEmail().normalizeEmail(),
    body('token').notEmpty(),
    body('password').isLength({ min: 8 }),
  ]),
  async (req: Request, res: Response) => {
    try {
      const { email, token, password } = req.body;
      await AuthService.resetPassword(email, token, password);
      res.json({ message: 'Password reset successful' });
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  }
);

router.post(
  '/change-password',
  authenticate,
  validate([
    body('currentPassword').notEmpty(),
    body('newPassword').isLength({ min: 8 }),
  ]),
  async (req: AuthRequest, res: Response) => {
    try {
      await AuthService.changePassword(req.user!.id, req.body.currentPassword, req.body.newPassword);
      res.json({ message: 'Password changed successfully' });
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  }
);

router.get('/me', authenticate, async (req: AuthRequest, res: Response) => {
  const user = await prisma.user.findUnique({
    where: { id: req.user!.id },
    select: { id: true, email: true, name: true, role: true, isActive: true, avatar: true, createdAt: true },
  });
  res.json(user);
});

router.put('/me', authenticate, async (req: AuthRequest, res: Response) => {
  const user = await prisma.user.update({
    where: { id: req.user!.id },
    data: { name: req.body.name, avatar: req.body.avatar },
    select: { id: true, email: true, name: true, role: true, isActive: true, avatar: true },
  });
  res.json(user);
});

router.post('/api-keys', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { name, permissions } = req.body;
    const apiKey = await AuthService.generateApiKey(req.user!.id, name, permissions);
    res.status(201).json(apiKey);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

router.get('/api-keys', authenticate, async (req: AuthRequest, res: Response) => {
  const keys = await AuthService.listApiKeys(req.user!.id);
  res.json(keys);
});

router.delete('/api-keys/:id', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    await AuthService.revokeApiKey(req.user!.id, req.params.id);
    res.json({ message: 'API key revoked' });
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

export default router;
