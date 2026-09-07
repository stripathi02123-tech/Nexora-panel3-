import { Router, Response } from 'express';
import { AuthRequest, authenticate } from '../middleware/auth';
import { BillingService } from '../services/BillingService';
import { prisma } from '../utils/database';

const router = Router();

async function canAccessSubscription(user: { id: string; role: string }, id: string): Promise<boolean> {
  if (user.role === 'ADMIN') return true;
  const subscription = await prisma.subscription.findUnique({ where: { id }, select: { userId: true } });
  return !!subscription && subscription.userId === user.id;
}

async function canAccessInvoice(user: { id: string; role: string }, id: string): Promise<boolean> {
  if (user.role === 'ADMIN') return true;
  const invoice = await prisma.invoice.findUnique({ where: { id }, select: { userId: true } });
  return !!invoice && invoice.userId === user.id;
}

router.get('/subscriptions', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.role === 'ADMIN' ? (req.query.userId as string | undefined) : req.user!.id;
    return res.json(await BillingService.listSubscriptions(userId));
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
});

router.get('/subscriptions/:id', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    if (!(await canAccessSubscription(req.user!, req.params.id))) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    return res.json(await BillingService.getSubscription(req.params.id));
  } catch (error: any) {
    return res.status(404).json({ error: error.message });
  }
});

router.post('/subscriptions', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    return res.status(201).json(await BillingService.createSubscription(req.user!.id, req.body.planId));
  } catch (error: any) {
    return res.status(400).json({ error: error.message });
  }
});

router.post('/subscriptions/:id/cancel', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    if (!(await canAccessSubscription(req.user!, req.params.id))) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    await BillingService.cancelSubscription(req.params.id);
    return res.json({ message: 'Subscription cancelled' });
  } catch (error: any) {
    return res.status(400).json({ error: error.message });
  }
});

router.post('/subscriptions/:id/renew', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    if (!(await canAccessSubscription(req.user!, req.params.id))) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    return res.json(await BillingService.renewSubscription(req.params.id));
  } catch (error: any) {
    return res.status(400).json({ error: error.message });
  }
});

router.get('/invoices', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.role === 'ADMIN' ? (req.query.userId as string | undefined) : req.user!.id;
    return res.json(await BillingService.listInvoices(userId));
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
});

router.get('/invoices/:id', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    if (!(await canAccessInvoice(req.user!, req.params.id))) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    return res.json(await BillingService.getInvoice(req.params.id));
  } catch (error: any) {
    return res.status(404).json({ error: error.message });
  }
});

router.post('/invoices/:id/pay', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    if (req.user!.role !== 'ADMIN') {
      return res.status(403).json({ error: 'Only administrators can mark invoices as paid' });
    }
    await BillingService.payInvoice(req.params.id);
    return res.json({ message: 'Invoice paid' });
  } catch (error: any) {
    return res.status(400).json({ error: error.message });
  }
});

router.get('/usage', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    return res.json(await BillingService.getUserUsage(req.user!.id));
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
});

export default router;
