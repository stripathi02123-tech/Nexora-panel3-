import axios from 'axios';
import crypto from 'crypto';
import fs from 'fs';
import os from 'os';
import { prisma } from '../utils/database';
import { config } from '../config';

export class LicenseService {
  static getMachineId(): string {
    let base = '';
    try {
      if (fs.existsSync('/etc/machine-id')) base = fs.readFileSync('/etc/machine-id', 'utf8').trim();
    } catch {}
    if (!base) base = `${os.hostname()}-${os.platform()}-${os.arch()}`;
    return crypto.createHash('sha256').update(base).digest('hex').slice(0, 32);
  }

  static async getActivation() {
    return prisma.licenseActivation.findFirst({ orderBy: { activatedAt: 'desc' } });
  }

  static async status() {
    if (!config.licenseRequired) {
      return { required: false, activated: true, machineId: this.getMachineId() };
    }
    const activation = await this.getActivation();
    return {
      required: true,
      activated: activation?.status === 'ACTIVE',
      machineId: this.getMachineId(),
      lastCheckAt: activation?.lastCheckAt,
      activatedAt: activation?.activatedAt,
    };
  }

  static async activate(licenseKey: string, domain?: string, ip?: string) {
    const machineId = this.getMachineId();
    const endpoint = `${config.licenseServerUrl.replace(/\/$/, '')}/api/activate`;
    const response = await axios.post(endpoint, {
      license_key: licenseKey,
      machine_id: machineId,
      domain,
      ip,
    }, { timeout: 15000 });

    if (!response.data?.success) throw new Error(response.data?.error || 'License activation failed');

    await prisma.licenseActivation.deleteMany({});
    await prisma.licenseActivation.create({
      data: {
        licenseKey,
        machineId,
        token: response.data.token || null,
        status: 'ACTIVE',
        lastCheckAt: new Date(),
      },
    });

    return { success: true, machineId };
  }

  static async validate() {
    if (!config.licenseRequired) return true;
    const activation = await this.getActivation();
    if (!activation || activation.status !== 'ACTIVE') return false;

    try {
      const endpoint = `${config.licenseServerUrl.replace(/\/$/, '')}/api/validate`;
      const response = await axios.post(endpoint, {
        license_key: activation.licenseKey,
        machine_id: activation.machineId,
      }, { timeout: 15000 });

      if (response.data?.valid) {
        await prisma.licenseActivation.update({
          where: { id: activation.id },
          data: { token: response.data.token || activation.token, lastCheckAt: new Date(), status: 'ACTIVE' },
        });
        return true;
      }
    } catch {}

    await prisma.licenseActivation.update({ where: { id: activation.id }, data: { status: 'INVALID' } });
    return false;
  }
}
