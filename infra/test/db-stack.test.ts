import * as cdk from 'aws-cdk-lib';
import { Template, Match } from 'aws-cdk-lib/assertions';
import { DbStack } from '../lib/db-stack.js';

const synthesize = (environment: string): Template => {
  const app = new cdk.App({
    context: { environment },
  });
  const stack = new DbStack(app, `DbStack-${environment}`, { environment });
  return Template.fromStack(stack);
};

describe('DbStack', () => {
  test('dev uses Aurora Serverless v2 with conservative limits', () => {
    const template = synthesize('dev');

    template.hasResourceProperties('AWS::RDS::DBCluster', {
      Engine: 'aurora-postgresql',
      EngineVersion: '16.6',
      DeletionProtection: false,
      BackupRetentionPeriod: 7,
      ServerlessV2ScalingConfiguration: {
        MinCapacity: 0.5,
        MaxCapacity: 4,
      },
    });

    template.hasResourceProperties('AWS::RDS::DBParameterGroup', {
      Parameters: Match.objectLike({
        max_connections: '75',
        shared_preload_libraries: 'pg_stat_statements',
      }),
    });

    template.hasResourceProperties('AWS::SecretsManager::RotationSchedule', {
      RotationRules: Match.objectLike({
        ScheduleExpression: 'rate(90 days)',
      }),
    });

    template.hasResourceProperties('AWS::EC2::SecurityGroupIngress', {
      Description: 'Allow Lambda security group to reach Aurora',
      IpProtocol: 'tcp',
      SourceSecurityGroupId: {
        'Fn::GetAtt': [Match.stringLikeRegexp('LambdaSecurityGroup'), 'GroupId'],
      },
    });
  });

  test('staging scales serverless capacity and enables write forwarding', () => {
    const template = synthesize('staging');

    template.hasResourceProperties('AWS::RDS::DBCluster', {
      ServerlessV2ScalingConfiguration: {
        MinCapacity: 1,
        MaxCapacity: 8,
      },
      EnableLocalWriteForwarding: true,
      BackupRetentionPeriod: 14,
    });

    template.hasResourceProperties('AWS::RDS::DBParameterGroup', {
      Parameters: Match.objectLike({
        max_connections: '200',
      }),
    });

    template.hasResourceProperties('AWS::SecretsManager::RotationSchedule', {
      RotationRules: Match.objectLike({
        ScheduleExpression: 'rate(60 days)',
      }),
    });
  });

  test('prod provisions r6g instances with stricter durability settings', () => {
    const template = synthesize('prod');

    template.hasResourceProperties('AWS::RDS::DBCluster', {
      EngineVersion: '16.6',
      DeletionProtection: true,
      BackupRetentionPeriod: 35,
    });

    template.hasResourceProperties('AWS::RDS::DBInstance', {
      DBInstanceClass: 'db.r6g.large',
    });

    template.hasResourceProperties('AWS::RDS::DBParameterGroup', {
      Parameters: Match.objectLike({
        max_connections: '500',
      }),
    });

    template.hasResourceProperties('AWS::SecretsManager::RotationSchedule', {
      RotationRules: Match.objectLike({
        ScheduleExpression: 'rate(30 days)',
      }),
    });
  });
});
