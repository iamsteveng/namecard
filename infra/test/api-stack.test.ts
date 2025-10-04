import * as cdk from 'aws-cdk-lib';
import { Template, Match } from 'aws-cdk-lib/assertions';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as rds from 'aws-cdk-lib/aws-rds';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';
import { ApiStack } from '../lib/api-stack.js';

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

  const apiStack = new ApiStack(app, `ApiStack-${environment}`, {
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

  return Template.fromStack(apiStack);
};

describe('ApiStack', () => {
  test('configures RDS Proxy with TLS and IAM authentication', () => {
    const template = synthesize('dev');

    template.hasResourceProperties('AWS::RDS::DBProxy', {
      RequireTLS: true,
      Auth: Match.arrayWith([
        Match.objectLike({
          IAMAuth: 'REQUIRED',
        }),
      ]),
    });
  });

  test('exposes stage per environment with access logging', () => {
    const template = synthesize('staging');

    template.hasResourceProperties('AWS::ApiGatewayV2::Stage', {
      StageName: 'staging',
      AccessLogSettings: Match.objectLike({
        DestinationArn: Match.anyValue(),
        Format: Match.stringLikeRegexp('requestTime'),
      }),
    });
  });

  test('auth function is wired with reserved concurrency and proxy environment', () => {
    const template = synthesize('prod');

    template.hasResourceProperties('AWS::Lambda::Function', {
      Description: Match.stringLikeRegexp('Authentication, session management'),
      ReservedConcurrentExecutions: 25,
      Environment: {
        Variables: Match.objectLike({
          DB_PROXY_ENDPOINT: Match.anyValue(),
          SERVICE_NAME: 'auth',
          POWERTOOLS_SERVICE_NAME: 'auth',
        }),
      },
      Layers: Match.anyValue(),
    });
  });

  test('creates shared lambda layer for services', () => {
    const template = synthesize();

    template.resourceCountIs('AWS::Lambda::LayerVersion', 1);
  });

  test('registers custom resource for schema migrations', () => {
    const template = synthesize();

    template.hasResourceProperties('AWS::CloudFormation::CustomResource', {
      ServiceToken: Match.anyValue(),
      version: 'bootstrap',
    });
  });
});
