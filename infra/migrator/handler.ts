import type { OnEventRequest, OnEventResponse } from 'aws-cdk-lib/custom-resources';

export const handler = async (event: OnEventRequest): Promise<OnEventResponse> => {
  console.log('migration stub invoked', { requestType: event.RequestType });

  return {
    PhysicalResourceId: event.PhysicalResourceId ?? 'namecard-migrations-stub',
  };
};
