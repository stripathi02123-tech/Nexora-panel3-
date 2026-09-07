import { Router, Response } from 'express';
import { body } from 'express-validator';
import { AuthRequest, authenticate } from '../middleware/auth';
import { validate } from '../middleware/validate';
import { prisma } from '../utils/database';
import crypto from 'crypto';

const router = Router();

router.get('/', authenticate, async (req: AuthRequest, res: Response) => {
  const keys = await prisma.sshKey.findMany({
    where: { userId: req.user!.id },
    select: { id: true, name: true, publicKey: true, fingerprint: true, createdAt: true },
    orderBy: { createdAt: 'desc' },
  });
  res.json(keys);
});

router.get('/:id', authenticate, async (req: AuthRequest, res: Response) => {
  const key = await prisma.sshKey.findFirst({ where: { id: req.params.id, userId: req.user!.id } });
  if (!key) {
    res.status(404).json({ error: 'SSH key not found' });
    return;
  }
  res.json(key);
});

router.post(
  '/',
  authenticate,
  validate([body('name').notEmpty().trim(), body('publicKey').notEmpty()]),
  async (req: AuthRequest, res: Response) => {
    try {
      const fingerprint = crypto.createHash('sha256').update(req.body.publicKey.trim()).digest('hex');
      const key = await prisma.sshKey.create({
        data: {
          userId: req.user!.id,
          name: req.body.name,
          publicKey: req.body.publicKey.trim(),
          fingerprint,
        },
      });
      res.status(201).json({ id: key.id, name: key.name, fingerprint: key.fingerprint, createdAt: key.createdAt });
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  }
);

router.delete('/:id', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const key = await prisma.sshKey.findFirst({ where: { id: req.params.id, userId: req.user!.id } });
    if (!key) {
      res.status(404).json({ error: 'SSH key not found' });
      return;
    }
    await prisma.sshKey.delete({ where: { id: req.params.id } });
    res.json({ message: 'SSH key deleted' });
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

export default router;
