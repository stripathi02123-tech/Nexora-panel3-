import { Router, Request, Response } from 'express';
import { body } from 'express-validator';
import { AuthRequest, authenticate, hasAdmin } from '../middleware/auth';
import { validate } from '../middleware/validate';
import { prisma } from '../utils/database';
import { auditLog } from '../middleware/audit';

const router = Router();

router.get('/', authenticate, async (req: Request, res: Response) => {
  const locations = await prisma.location.findMany({
    orderBy: { name: 'asc' },
    include: { _count: { select: { nodes: true } } },
  });
  res.json(locations);
});

router.get('/:id', authenticate, async (req: Request, res: Response) => {
  const location = await prisma.location.findUnique({
    where: { id: req.params.id },
    include: { nodes: true },
  });
  if (!location) { res.status(404).json({ error: 'Location not found' }); return; }
  res.json(location);
});

router.post(
  '/',
  authenticate,
  hasAdmin,
  validate([body('name').notEmpty()]),
  auditLog('CREATE', 'LOCATION'),
  async (req: Request, res: Response) => {
    try {
      const location = await prisma.location.create({
        data: {
          name: req.body.name,
          city: req.body.city || null,
          country: req.body.country || null,
          datacenter: req.body.datacenter || null,
          region: req.body.region || null,
          notes: req.body.notes || null,
        },
      });
      res.status(201).json(location);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  }
);

router.put('/:id', authenticate, hasAdmin, auditLog('UPDATE', 'LOCATION'), async (req: AuthRequest, res: Response) => {
  try {
    const location = await prisma.location.update({
      where: { id: req.params.id },
      data: {
        name: req.body.name,
        city: req.body.city,
        country: req.body.country,
        datacenter: req.body.datacenter,
        region: req.body.region,
        notes: req.body.notes,
      },
    });
    res.json(location);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

router.delete('/:id', authenticate, hasAdmin, auditLog('DELETE', 'LOCATION'), async (req: AuthRequest, res: Response) => {
  try {
    await prisma.location.delete({ where: { id: req.params.id } });
    res.json({ message: 'Location deleted' });
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

export default router;
