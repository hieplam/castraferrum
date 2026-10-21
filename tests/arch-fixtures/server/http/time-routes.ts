// Valid: the entry layer calls services through an interface and may use fastify + contracts.
import type { FastifyInstance } from 'fastify';
import { instantDto } from '../../shared/contracts/dto';
import type { TimeService } from '../services/contracts';
export function timeRoutes(app: FastifyInstance, time: TimeService) { app.get('/t', async () => instantDto.parse(time.now())); }
