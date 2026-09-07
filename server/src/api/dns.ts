import { Router, Response } from 'express';
import { body } from 'express-validator';
import { AuthRequest, authenticate } from '../middleware/auth';
import { validate } from '../middleware/validate';
import { prisma } from '../utils/database';

const router = Router();

router.get('/domains', authenticate, async (req: AuthRequest, res: Response) => {
  const domains = await prisma.domain.findMany({
    where: { userId: req.user!.id },
    include: { _count: { select: { dnsRecords: true } } },
    orderBy: { createdAt: 'desc' },
  });
  res.json(domains);
});

router.get('/domains/:id', authenticate, async (req: AuthRequest, res: Response) => {
  const domain = await prisma.domain.findFirst({
    where: { id: req.params.id, userId: req.user!.id },
    include: { dnsRecords: { orderBy: { name: 'asc' } } },
  });
  if (!domain) {
    res.status(404).json({ error: 'Domain not found' });
    return;
  }
  res.json(domain);
});

router.post(
  '/domains',
  authenticate,
  validate([body('name').notEmpty().trim()]),
  async (req: AuthRequest, res: Response) => {
    try {
      const domain = await prisma.domain.create({
        data: {
          userId: req.user!.id,
          name: req.body.name,
          target: req.body.target,
          type: req.body.type || 'A',
          ttl: req.body.ttl || 3600,
        },
      });
      res.status(201).json(domain);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  }
);

router.put('/domains/:id', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const domain = await prisma.domain.findFirst({ where: { id: req.params.id, userId: req.user!.id } });
    if (!domain) {
      res.status(404).json({ error: 'Domain not found' });
      return;
    }
    const updated = await prisma.domain.update({
      where: { id: req.params.id },
      data: {
        target: req.body.target,
        type: req.body.type,
        ttl: req.body.ttl,
      },
    });
    res.json(updated);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

router.delete('/domains/:id', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const domain = await prisma.domain.findFirst({ where: { id: req.params.id, userId: req.user!.id } });
    if (!domain) {
      res.status(404).json({ error: 'Domain not found' });
      return;
    }
    await prisma.dnsRecord.deleteMany({ where: { domainId: req.params.id } });
    await prisma.domain.delete({ where: { id: req.params.id } });
    res.json({ message: 'Domain deleted' });
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

router.get('/domains/:domainId/records', authenticate, async (req: AuthRequest, res: Response) => {
  const domain = await prisma.domain.findFirst({ where: { id: req.params.domainId, userId: req.user!.id } });
  if (!domain) {
    res.status(404).json({ error: 'Domain not found' });
    return;
  }
  const records = await prisma.dnsRecord.findMany({
    where: { domainId: req.params.domainId },
    orderBy: [{ name: 'asc' }, { type: 'asc' }],
  });
  res.json(records);
});

router.post(
  '/domains/:domainId/records',
  authenticate,
  validate([body('name').notEmpty(), body('type').notEmpty(), body('value').notEmpty()]),
  async (req: AuthRequest, res: Response) => {
    try {
      const domain = await prisma.domain.findFirst({ where: { id: req.params.domainId, userId: req.user!.id } });
      if (!domain) {
        res.status(404).json({ error: 'Domain not found' });
        return;
      }
      const record = await prisma.dnsRecord.create({
        data: {
          domainId: req.params.domainId,
          name: req.body.name,
          type: req.body.type,
          value: req.body.value,
          ttl: req.body.ttl || 3600,
          priority: req.body.priority || 0,
        },
      });
      res.status(201).json(record);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  }
);

router.put('/domains/:domainId/records/:recordId', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const record = await prisma.dnsRecord.findFirst({
      where: { id: req.params.recordId, domain: { userId: req.user!.id } },
    });
    if (!record) {
      res.status(404).json({ error: 'Record not found' });
      return;
    }
    const updated = await prisma.dnsRecord.update({
      where: { id: req.params.recordId },
      data: {
        name: req.body.name,
        type: req.body.type,
        value: req.body.value,
        ttl: req.body.ttl,
        priority: req.body.priority,
      },
    });
    res.json(updated);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

router.delete('/domains/:domainId/records/:recordId', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const record = await prisma.dnsRecord.findFirst({
      where: { id: req.params.recordId, domain: { userId: req.user!.id } },
    });
    if (!record) {
      res.status(404).json({ error: 'Record not found' });
      return;
    }
    await prisma.dnsRecord.delete({ where: { id: req.params.recordId } });
    res.json({ message: 'Record deleted' });
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

export default router;
