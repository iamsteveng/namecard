import * as cdk from 'aws-cdk-lib';
import { Template, Match } from 'aws-cdk-lib/assertions';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as rds from 'aws-cdk-lib/aws-rds';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';
import { ApiStack } from '../lib/api-stack';

const synthesize = (environment: string = 'dev'): Template => {
  const app = new cdk.App({
    context: {
      environment,
      skipCrossStackNetworking: true,
    },
  });

  const importScope = new cdk.Stack(app, `Imports-${environment}`);

  const importedVpc = ec2.Vpc.fromVpcAttributes(importScope, 'ImportedVpc', {
    vpcId: 'vpc-1234567890',
    availabilityZones: ['us-east-1a', 'us-east-1b'],
    privateSubnetIds: ['subnet-private-a', 'subnet-private-b'],
    privateSubnetRouteTableIds: ['rtb-private-a', 'rtb-private-b'],
    publicSubnetIds: ['subnet-public-a', 'subnet-public-b'],
    publicSubnetRouteTableIds: ['rtb-public-a', 'rtb-public-b'],
    isolatedSubnetIds: ['subnet-isolated-a', 'subnet-isolated-b'],
    isolatedSubnetRouteTableIds: ['rtb-isolated-a', 'rtb-isolated-b'],
  });

  const lambdaSecurityGroup = ec2.SecurityGroup.fromSecurityGroupId(
    importScope,
    'LambdaSecurityGroupImport',
    'sg-lambda',
  );

  const databaseSecurityGroup = ec2.SecurityGroup.fromSecurityGroupId(
    importScope,
    'DatabaseSecurityGroupImport',
    'sg-database',
  );

  const dbSecret = secretsmanager.Secret.fromSecretCompleteArn(
    importScope,
    'DatabaseSecretImport',
    'arn:aws:secretsmanager:us-east-1:123456789012:secret:dummy-abc123',
  );

  const dbCluster = rds.DatabaseCluster.fromDatabaseClusterAttributes(
    importScope,
    'DatabaseClusterImport',
    {
      clusterIdentifier: 'namecard-cluster',
      clusterEndpointAddress: 'namecard-cluster.cluster-example.amazonaws.com',
      port: 5432,
      engine: rds.DatabaseClusterEngine.auroraPostgres({
        version: rds.AuroraPostgresEngineVersion.VER_16_2,
      }),
      securityGroups: [databaseSecurityGroup],
      secret: dbSecret,
    },
  );

  const stack = new ApiStack(app, `ApiStack-${environment}`, {
    environment,
    vpc: importedVpc,
    dbCluster,
    dbSecret,
    lambdaSecurityGroup,
    applicationSubnets: {
      subnets: importedVpc.selectSubnets({
        subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS,
      }).subnets,
    },
    databaseSecurityGroup,
  });

  return Template.fromStack(stack);
};

describe('ApiStack observability', () => {
  it('configures shared dead-letter queue and alarms', () => {
    const template = synthesize('dev');

    template.hasResourceProperties('AWS::SQS::Queue', {
      QueueName: 'namecard-dev-lambda-dlq',
    });

    template.hasResourceProperties('AWS::CloudWatch::Alarm', {
      AlarmDescription: Match.stringLikeRegexp('DLQ'),
      MetricName: 'ApproximateNumberOfMessagesVisible',
    });
  });

  it('enables dead-letter config and tracing for Lambda services', () => {
    const template = synthesize('staging');

    template.hasResourceProperties('AWS::Lambda::Function', {
      TracingConfig: { Mode: 'Active' },
      DeadLetterConfig: {
        TargetArn: Match.anyValue(),
      },
    });
  });

  it('creates latency and database connection alarms', () => {
    const template = synthesize('prod');

    template.hasResourceProperties('AWS::CloudWatch::Alarm', {
      MetricName: 'Latency',
      Namespace: 'AWS/ApiGateway',
      ComparisonOperator: 'GreaterThanOrEqualToThreshold',
    });

    template.hasResourceProperties('AWS::CloudWatch::Alarm', {
      MetricName: 'DatabaseConnections',
      Namespace: 'AWS/RDS',
      ComparisonOperator: 'GreaterThanOrEqualToThreshold',
    });
  });

  it('adds an observability dashboard with key widgets', () => {
    const template = synthesize('dev');

    template.hasResourceProperties('AWS::CloudWatch::Dashboard', {
      DashboardName: 'namecard-dev-observability',
    });
  });
});
