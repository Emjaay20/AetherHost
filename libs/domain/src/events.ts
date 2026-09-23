export class ApplicationProvisioningRequested {
  public readonly eventName = 'ApplicationProvisioningRequested';
  constructor(public readonly tenantId: string, public readonly applicationId: string) {}
}

export class ApplicationStatusChanged {
  public readonly eventName = 'ApplicationStatusChanged';
  constructor(public readonly tenantId: string, public readonly applicationId: string, public readonly payload: any) {}
}

export class AIRequestCompleted {
  public readonly eventName = 'AIRequestCompleted';
  // applicationId is optional for AI requests
  constructor(public readonly tenantId: string, public readonly applicationId: string | undefined | null, public readonly payload: any) {}
}

export class PaymentSucceeded {
  public readonly eventName = 'PaymentSucceeded';
  constructor(public readonly tenantId: string, public readonly payload: any) {}
}
