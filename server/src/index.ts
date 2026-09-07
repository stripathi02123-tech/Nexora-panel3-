import { httpServer } from './app';
import { config } from './config';
import { connectDatabase, disconnectDatabase } from './utils/database';
import { logger } from './utils/logger';
import { MonitoringService } from './services/MonitoringService';
import { NodeService } from './services/NodeService';
import { BackupService } from './services/BackupService';
import { BillingService } from './services/BillingService';
import cron from 'node-cron';

async function start(): Promise<void> {
  try {
    await connectDatabase();

    httpServer.listen(config.port, () => {
      logger.info(`Nexora Server started on port ${config.port}`);
      logger.info(`Environment: ${config.nodeEnv}`);
      logger.info(`WebSocket server ready`);
    });

    NodeService.checkAllNodes().catch((err) => logger.error('Initial node health check error:', err));

    cron.schedule('* * * * *', async () => {
      logger.debug('Running scheduled metrics collection');
      await MonitoringService.collectAllMetrics().catch((err) => logger.error('Metrics collection error:', err));
    });

    cron.schedule('*/5 * * * *', async () => {
      logger.debug('Running scheduled node health check');
      await NodeService.checkAllNodes().catch((err) => logger.error('Node health check error:', err));
    });

    cron.schedule('0 0 * * *', async () => {
      logger.info('Running daily backup schedule');
      await BackupService.runScheduledBackups().catch((err) => logger.error('Scheduled backup error:', err));
      await BackupService.cleanup().catch((err) => logger.error('Backup cleanup error:', err));
    });

    cron.schedule('0 0 * * *', async () => {
      logger.info('Running daily subscription expiry check');
      await BillingService.processExpiredSubscriptions().catch((err) => logger.error('Subscription expiry error:', err));
    });

    process.on('SIGINT', async () => {
      logger.info('Shutting down...');
      await disconnectDatabase();
      process.exit(0);
    });

    process.on('SIGTERM', async () => {
      logger.info('Shutting down...');
      await disconnectDatabase();
      process.exit(0);
    });

    process.on('unhandledRejection', (reason, promise) => {
      logger.error('Unhandled Rejection at:', promise, 'reason:', reason);
    });

    process.on('uncaughtException', (error) => {
      logger.error('Uncaught Exception:', error);
    });
  } catch (error) {
    logger.error('Failed to start server:', error);
    process.exit(1);
  }
}

start();
