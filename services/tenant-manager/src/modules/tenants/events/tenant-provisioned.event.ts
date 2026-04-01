export class TenantProvisionedEvent {
  readonly tenantId: string;
  readonly slug: string;
  readonly plan: string;
  readonly adminEmail: string;
  readonly timestamp: string;

  constructor(data: Omit<TenantProvisionedEvent, 'timestamp'>) {
    this.tenantId = data.tenantId;
    this.slug = data.slug;
    this.plan = data.plan;
    this.adminEmail = data.adminEmail;
    this.timestamp = new Date().toISOString();
  }
}

export class TenantSuspendedEvent {
  readonly tenantId: string;
  readonly reason?: string;
  readonly timestamp: string;

  constructor(data: Omit<TenantSuspendedEvent, 'timestamp'>) {
    this.tenantId = data.tenantId;
    this.reason = data.reason;
    this.timestamp = new Date().toISOString();
  }
}

export class TenantPlanChangedEvent {
  readonly tenantId: string;
  readonly oldPlan: string;
  readonly newPlan: string;
  readonly timestamp: string;

  constructor(data: Omit<TenantPlanChangedEvent, 'timestamp'>) {
    this.tenantId = data.tenantId;
    this.oldPlan = data.oldPlan;
    this.newPlan = data.newPlan;
    this.timestamp = new Date().toISOString();
  }
}

export class TenantFeatureToggledEvent {
  readonly tenantId: string;
  readonly featureCode: string;
  readonly enabled: boolean;
  readonly timestamp: string;

  constructor(data: Omit<TenantFeatureToggledEvent, 'timestamp'>) {
    this.tenantId = data.tenantId;
    this.featureCode = data.featureCode;
    this.enabled = data.enabled;
    this.timestamp = new Date().toISOString();
  }
}
