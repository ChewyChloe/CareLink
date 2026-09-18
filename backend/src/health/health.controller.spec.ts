import { Test, TestingModule } from '@nestjs/testing';
import { HealthController } from './health.controller';
import { HealthService } from './health.service';
import { PrismaService } from '../prisma/prisma.service';

describe('HealthController', () => {
  let controller: HealthController;
  let prismaService: PrismaService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [HealthController],
      providers: [
        HealthService,
        {
          provide: PrismaService,
          useValue: {
            checkHealth: jest.fn(),
          },
        },
      ],
    }).compile();

    controller = module.get<HealthController>(HealthController);
    prismaService = module.get<PrismaService>(PrismaService);
  });

  it('should return ok when database is healthy', async () => {
    jest.spyOn(prismaService, 'checkHealth').mockResolvedValue({
      isHealthy: true,
      latencyMs: 5,
    });

    const result = await controller.getApiHealth();
    expect(result.status).toBe('ok');
    expect(result.database.status).toBe('connected');
    expect(result.service).toBe('CareLink Modular Monolith Backend');
    expect(result.version).toBe('0.1.0');
    expect(result.timestamp).toBeDefined();
    // Ensure no secrets or database credentials are leaked
    expect(JSON.stringify(result)).not.toContain('password');
    expect(JSON.stringify(result)).not.toContain('postgresql://');
  });

  it('should return degraded and disconnected when database is unreachable without crashing', async () => {
    jest.spyOn(prismaService, 'checkHealth').mockResolvedValue({
      isHealthy: false,
      error: 'Connection refused at localhost:5432',
    });

    const result = await controller.getApiHealth();
    expect(result.status).toBe('degraded');
    expect(result.database.status).toBe('disconnected');
    expect(result.database.reason).toBe('Database connection unavailable');
    // Ensure no stack traces or database URLs leaked
    expect(JSON.stringify(result)).not.toContain('localhost:5432');
    expect(JSON.stringify(result)).not.toContain('password');
  });
});
