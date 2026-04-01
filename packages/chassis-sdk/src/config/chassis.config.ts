export interface ChassisOptions {
  serviceName: string;
  tenantManagerUrl?: string;
  rabbitmqUrl?: string;
  redisUrl?: string;
  jwtSecret?: string;
  enableAuditLogging?: boolean;
  enableFeatureGating?: boolean;
}
