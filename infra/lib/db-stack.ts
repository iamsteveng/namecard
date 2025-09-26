import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as rds from 'aws-cdk-lib/aws-rds';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';

type EnvironmentKey = 'dev' | 'staging' | 'prod';

export interface DbStackProps extends cdk.StackProps {
  /**
   * Deployment environment provided either via props or CDK context.
   */
  readonly environment?: string;
}

interface ProvisionedInstanceSizing {
  readonly class: ec2.InstanceClass;
  readonly size: ec2.InstanceSize;
}

interface EnvironmentConfig {
  readonly vpcCidr: string;
  readonly maxAzs: number;
  readonly natGateways: number;
  readonly backupRetention: cdk.Duration;
  readonly backupWindow: string;
  readonly maintenanceWindow: string;
  readonly deletionProtection: boolean;
  readonly removalPolicy: cdk.RemovalPolicy;
  readonly performanceInsights: boolean;
  readonly performanceInsightRetention?: rds.PerformanceInsightRetention;
  readonly monitoringInterval?: cdk.Duration;
  readonly rotationInterval: cdk.Duration;
  readonly maxConnections: number;
  readonly enableLocalWriteForwarding?: boolean;
  readonly serverless?: {
    readonly minCapacity: number;
    readonly maxCapacity: number;
    readonly readerCount: number;
  };
  readonly provisioned?: {
    readonly writer: ProvisionedInstanceSizing;
    readonly reader?: ProvisionedInstanceSizing;
    readonly readerCount: number;
  };
}

const ENGINE = rds.DatabaseClusterEngine.auroraPostgres({
  version: rds.AuroraPostgresEngineVersion.VER_16_6,
});

const ENVIRONMENT_CONFIG: Record<EnvironmentKey, EnvironmentConfig> = {
  dev: {
    vpcCidr: '10.20.0.0/16',
    maxAzs: 2,
    natGateways: 1,
    backupRetention: cdk.Duration.days(7),
    backupWindow: '03:00-04:00',
    maintenanceWindow: 'Mon:00:00-Mon:02:00',
    deletionProtection: false,
    removalPolicy: cdk.RemovalPolicy.DESTROY,
    performanceInsights: false,
    monitoringInterval: undefined,
    rotationInterval: cdk.Duration.days(90),
    maxConnections: 75,
    serverless: { minCapacity: 0.5, maxCapacity: 4, readerCount: 0 },
  },
  staging: {
    vpcCidr: '10.30.0.0/16',
    maxAzs: 2,
    natGateways: 1,
    backupRetention: cdk.Duration.days(14),
    backupWindow: '02:00-03:00',
    maintenanceWindow: 'Sun:01:00-Sun:03:00',
    deletionProtection: false,
    removalPolicy: cdk.RemovalPolicy.SNAPSHOT,
    performanceInsights: true,
    performanceInsightRetention: rds.PerformanceInsightRetention.MONTHS_3,
    monitoringInterval: cdk.Duration.minutes(1),
    rotationInterval: cdk.Duration.days(60),
    maxConnections: 200,
    enableLocalWriteForwarding: true,
    serverless: { minCapacity: 1, maxCapacity: 8, readerCount: 1 },
  },
  prod: {
    vpcCidr: '10.40.0.0/16',
    maxAzs: 3,
    natGateways: 2,
    backupRetention: cdk.Duration.days(35),
    backupWindow: '00:30-01:30',
    maintenanceWindow: 'Sun:02:00-Sun:04:00',
    deletionProtection: true,
    removalPolicy: cdk.RemovalPolicy.SNAPSHOT,
    performanceInsights: true,
    performanceInsightRetention: rds.PerformanceInsightRetention.LONG_TERM,
    monitoringInterval: cdk.Duration.minutes(1),
    rotationInterval: cdk.Duration.days(30),
    maxConnections: 500,
    enableLocalWriteForwarding: true,
    provisioned: {
      writer: { class: ec2.InstanceClass.R6G, size: ec2.InstanceSize.LARGE },
      reader: { class: ec2.InstanceClass.R6G, size: ec2.InstanceSize.LARGE },
      readerCount: 1,
    },
  },
};

function normalizeEnvironment(input?: string): EnvironmentKey {
  switch ((input ?? '').toLowerCase()) {
    case 'dev':
    case 'development':
      return 'dev';
    case 'staging':
      return 'staging';
    case 'prod':
    case 'production':
      return 'prod';
    default:
      throw new Error(
        `Unsupported environment: ${input ?? 'undefined'}. Expected dev | staging | prod.`,
      );
  }
}

function toInstanceType(sizing: ProvisionedInstanceSizing): ec2.InstanceType {
  return ec2.InstanceType.of(sizing.class, sizing.size);
}

export class DbStack extends cdk.Stack {
  public readonly vpc: ec2.Vpc;
  public readonly cluster: rds.DatabaseCluster;
  public readonly dbSecret: secretsmanager.ISecret;
  public readonly databaseSecurityGroup: ec2.ISecurityGroup;
  public readonly lambdaSecurityGroup: ec2.ISecurityGroup;
  public readonly databaseSubnetGroup: rds.SubnetGroup;
  public readonly applicationSubnetSelection: ec2.SubnetSelection;

  constructor(scope: Construct, id: string, props: DbStackProps = {}) {
    super(scope, id, props);

    const environment = normalizeEnvironment(props.environment ?? this.node.tryGetContext('environment'));
    const config = ENVIRONMENT_CONFIG[environment];

    this.vpc = new ec2.Vpc(this, 'Vpc', {
      vpcName: `namecard-${environment}-core`,
      ipAddresses: ec2.IpAddresses.cidr(config.vpcCidr),
      maxAzs: config.maxAzs,
      natGateways: config.natGateways,
      subnetConfiguration: [
        { name: 'Public', subnetType: ec2.SubnetType.PUBLIC, cidrMask: 24 },
        { name: 'Application', subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS, cidrMask: 24 },
        { name: 'Data', subnetType: ec2.SubnetType.PRIVATE_ISOLATED, cidrMask: 24 },
      ],
      enableDnsHostnames: true,
      enableDnsSupport: true,
    });

    this.applicationSubnetSelection = { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS };

    this.lambdaSecurityGroup = new ec2.SecurityGroup(this, 'LambdaSecurityGroup', {
      vpc: this.vpc,
      allowAllOutbound: true,
      description: 'Security group for Lambda functions accessing Aurora',
    });

    this.databaseSecurityGroup = new ec2.SecurityGroup(this, 'DatabaseSecurityGroup', {
      vpc: this.vpc,
      allowAllOutbound: true,
      description: 'Security group for Aurora PostgreSQL cluster',
    });

    this.databaseSubnetGroup = new rds.SubnetGroup(this, 'DatabaseSubnetGroup', {
      description: `Isolated subnets for Aurora PostgreSQL - ${environment}`,
      subnetGroupName: `namecard-${environment}-db`,
      vpc: this.vpc,
      vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_ISOLATED },
    });

    this.dbSecret = new rds.DatabaseSecret(this, 'DatabaseCredentialsSecret', {
      secretName: `namecard/database/${environment}`,
      username: 'namecard_owner',
      dbname: 'namecard',
      excludeCharacters: '"\\/@',
    });

    const instanceParameterGroup = new rds.ParameterGroup(this, 'InstanceParameterGroup', {
      engine: ENGINE,
      description: `Instance parameters for namecard Aurora cluster (${environment})`,
      parameters: {
        max_connections: config.maxConnections.toString(),
        shared_preload_libraries: 'pg_stat_statements',
        log_min_duration_statement: '5000', // log queries slower than 5 seconds
        log_lock_waits: '1',
      },
    });

    const writer = config.serverless
      ? rds.ClusterInstance.serverlessV2('WriterInstance', {
          autoMinorVersionUpgrade: true,
          enablePerformanceInsights: config.performanceInsights,
          performanceInsightRetention: config.performanceInsightRetention,
          parameterGroup: instanceParameterGroup,
        })
      : rds.ClusterInstance.provisioned('WriterInstance', {
          autoMinorVersionUpgrade: true,
          enablePerformanceInsights: config.performanceInsights,
          performanceInsightRetention: config.performanceInsightRetention,
          instanceType: toInstanceType(config.provisioned!.writer),
          parameterGroup: instanceParameterGroup,
        });

    const readers: rds.IClusterInstance[] = [];

    if (config.serverless?.readerCount) {
      for (let index = 0; index < config.serverless.readerCount; index += 1) {
        readers.push(
          rds.ClusterInstance.serverlessV2(`Reader${index + 1}`, {
            autoMinorVersionUpgrade: true,
            enablePerformanceInsights: config.performanceInsights,
            performanceInsightRetention: config.performanceInsightRetention,
            parameterGroup: instanceParameterGroup,
            scaleWithWriter: index === 0,
          }),
        );
      }
    }

    if (config.provisioned?.readerCount) {
      const readerSizing = config.provisioned.reader ?? config.provisioned.writer;
      for (let index = 0; index < config.provisioned.readerCount; index += 1) {
        readers.push(
          rds.ClusterInstance.provisioned(`ProvisionedReader${index + 1}`, {
            autoMinorVersionUpgrade: true,
            enablePerformanceInsights: config.performanceInsights,
            performanceInsightRetention: config.performanceInsightRetention,
            instanceType: toInstanceType(readerSizing),
            parameterGroup: instanceParameterGroup,
            promotionTier: index + 1,
          }),
        );
      }
    }

    this.cluster = new rds.DatabaseCluster(this, 'DatabaseCluster', {
      engine: ENGINE,
      writer,
      readers,
      vpc: this.vpc,
      vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_ISOLATED },
      securityGroups: [this.databaseSecurityGroup],
      subnetGroup: this.databaseSubnetGroup,
      credentials: rds.Credentials.fromSecret(this.dbSecret),
      defaultDatabaseName: 'namecard',
      clusterIdentifier: `namecard-${environment}-aurora`,
      backup: {
        retention: config.backupRetention,
        preferredWindow: config.backupWindow,
      },
      cloudwatchLogsExports: ['postgresql'],
      monitoringInterval: config.monitoringInterval,
      enablePerformanceInsights: config.performanceInsights,
      performanceInsightRetention: config.performanceInsightRetention,
      deletionProtection: config.deletionProtection,
      removalPolicy: config.removalPolicy,
      copyTagsToSnapshot: true,
      enableLocalWriteForwarding: config.enableLocalWriteForwarding ?? false,
      preferredMaintenanceWindow: config.maintenanceWindow,
      iamAuthentication: true,
      instanceUpdateBehaviour: rds.InstanceUpdateBehaviour.ROLLING,
      serverlessV2MinCapacity: config.serverless?.minCapacity,
      serverlessV2MaxCapacity: config.serverless?.maxCapacity,
    });

    this.cluster.connections.allowDefaultPortFrom(
      this.lambdaSecurityGroup,
      'Allow Lambda security group to reach Aurora',
    );

    this.cluster.addRotationSingleUser({
      automaticallyAfter: config.rotationInterval,
      excludeCharacters: '"\\/@',
    });

    cdk.Tags.of(this).add('Environment', environment);
    cdk.Tags.of(this).add('Application', 'NameCard');
    cdk.Tags.of(this).add('Component', 'Database');

    new cdk.CfnOutput(this, 'DatabaseEndpoint', {
      value: this.cluster.clusterEndpoint.socketAddress,
      description: 'Aurora PostgreSQL endpoint (reader/writer)',
      exportName: `namecard-${environment}-db-endpoint`,
    });

    new cdk.CfnOutput(this, 'DatabaseSecretArn', {
      value: this.dbSecret.secretArn,
      description: 'Secrets Manager ARN for Aurora credentials',
      exportName: `namecard-${environment}-db-secret-arn`,
    });

    new cdk.CfnOutput(this, 'VpcId', {
      value: this.vpc.vpcId,
      description: 'Core VPC for database-connected services',
      exportName: `namecard-${environment}-vpc-id`,
    });

    new cdk.CfnOutput(this, 'LambdaSecurityGroupId', {
      value: this.lambdaSecurityGroup.securityGroupId,
      description: 'Security group for Lambdas connecting to Aurora',
      exportName: `namecard-${environment}-lambda-sg-id`,
    });

    new cdk.CfnOutput(this, 'DatabaseSecurityGroupId', {
      value: this.databaseSecurityGroup.securityGroupId,
      description: 'Security group protecting the Aurora cluster',
      exportName: `namecard-${environment}-db-sg-id`,
    });
  }
}
