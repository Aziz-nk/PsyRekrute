import { HealthCheckService, HealthCheckResult } from '@nestjs/terminus';
import { HealthController } from './health.controller';
import { PrismaHealthIndicator } from './prisma.health';

describe('HealthController', () => {
  it('delegue la verification a HealthCheckService et PrismaHealthIndicator', async () => {
    const isHealthy = jest.fn().mockResolvedValue({ postgresql: { status: 'up' } });
    const check = jest.fn(async (indicators: Array<() => Promise<unknown>>) => {
      for (const fn of indicators) await fn();
      return {
        status: 'ok',
        info: { postgresql: { status: 'up' } },
        error: {},
        details: { postgresql: { status: 'up' } },
      } as HealthCheckResult;
    });

    const ctrl = new HealthController(
      { check } as unknown as HealthCheckService,
      { isHealthy } as unknown as PrismaHealthIndicator,
    );

    const res = await ctrl.check();
    expect(res.status).toBe('ok');
    expect(isHealthy).toHaveBeenCalledWith('postgresql');
  });
});
