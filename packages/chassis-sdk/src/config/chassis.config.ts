export interface ChassisOptions {
  serviceName: string;
  tenantManagerUrl?: string;
  rabbitmqUrl?: string;
  redisUrl?: string;
  jwtSecret?: string;
  serviceToken?: string;
  enableAuditLogging?: boolean;
  enableFeatureGating?: boolean;
  requestTimeoutMs?: number;
}
