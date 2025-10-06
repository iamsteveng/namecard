import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as cdk from 'aws-cdk-lib';
import { Duration, StackProps, CustomResource } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import { NodejsFunction, OutputFormat, type BundlingOptions } from 'aws-cdk-lib/aws-lambda-nodejs';
import * as rds from 'aws-cdk-lib/aws-rds';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';
import * as apigwv2 from 'aws-cdk-lib/aws-apigatewayv2';
import * as apigwv2Integrations from 'aws-cdk-lib/aws-apigatewayv2-integrations';
import { AccessLogFormat } from 'aws-cdk-lib/aws-apigateway';
import * as cr from 'aws-cdk-lib/custom-resources';
import * as cw from 'aws-cdk-lib/aws-cloudwatch';
import * as sqs from 'aws-cdk-lib/aws-sqs';

export type EnvironmentKey = 'dev' | 'staging' | 'prod';

export interface ApiStackProps extends StackProps {
  readonly environment?: string;
  readonly vpc: ec2.IVpc;
  readonly dbCluster: rds.IDatabaseCluster;
  readonly dbSecret: secretsmanager.ISecret;
  readonly lambdaSecurityGroup?: ec2.ISecurityGroup;
  readonly applicationSubnets: ec2.SubnetSelection;
  readonly databaseSecurityGroup: ec2.ISecurityGroup;
}

interface ServiceScalingConfig {
  readonly reservedConcurrency: Record<EnvironmentKey, number>;
  readonly provisionedConcurrency?: Partial<Record<EnvironmentKey, number>>;
}

interface ServiceDefinition {
  readonly id: string;
  readonly domain: string;
  readonly entry: string;
  readonly pathPrefix: string;
  readonly description: string;
  readonly timeout: Duration;
  readonly memorySize: number;
  readonly scaling: ServiceScalingConfig;
  readonly environment?: Record<string, string>;
}

const DATABASE_NAME = 'namecard';
const DATABASE_USER = 'namecard_owner';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const SERVICES_DIR = path.resolve(__dirname, '../../services');

export const SERVICE_DEFINITIONS: ServiceDefinition[] = [
  {
    id: 'AuthService',
    domain: 'auth',
    entry: path.join(__dirname, '../../services/auth/handler.ts'),
    pathPrefix: '/v1/auth',
    description: 'Authentication, session management, and profile bootstrap',
    timeout: Duration.seconds(10),
    memorySize: 512,
    scaling: {
      reservedConcurrency: { dev: 3, staging: 10, prod: 25 },
      provisionedConcurrency: { staging: 1, prod: 4 },
    },
    environment: {
      POWERTOOLS_SERVICE_NAME: 'auth',
    },
  },
  {
    id: 'CardsService',
    domain: 'cards',
    entry: path.join(__dirname, '../../services/cards/handler.ts'),
    pathPrefix: '/v1/cards',
    description: 'Card ingestion, CRUD, and workflow orchestration',
    timeout: Duration.seconds(15),
    memorySize: 1024,
    scaling: {
      reservedConcurrency: { dev: 4, staging: 12, prod: 35 },
      provisionedConcurrency: { staging: 1, prod: 6 },
    },
    environment: {
      POWERTOOLS_SERVICE_NAME: 'cards',
    },
  },
  {
    id: 'OcrService',
    domain: 'ocr',
    entry: path.join(__dirname, '../../services/ocr/handler.ts'),
    pathPrefix: '/v1/ocr',
    description: 'Textract job coordination and OCR status APIs',
    timeout: Duration.seconds(30),
    memorySize: 1536,
    scaling: {
      reservedConcurrency: { dev: 2, staging: 6, prod: 12 },
    },
    environment: {
      POWERTOOLS_SERVICE_NAME: 'ocr',
    },
  },
  {
    id: 'EnrichmentService',
    domain: 'enrichment',
    entry: path.join(__dirname, '../../services/enrichment/handler.ts'),
    pathPrefix: '/v1/enrichment',
    description: 'Company enrichment orchestration and lookups',
    timeout: Duration.seconds(25),
    memorySize: 1536,
    scaling: {
      reservedConcurrency: { dev: 2, staging: 6, prod: 10 },
    },
    environment: {
      POWERTOOLS_SERVICE_NAME: 'enrichment',
    },
  },
  {
    id: 'UploadsService',
    domain: 'uploads',
    entry: path.join(__dirname, '../../services/uploads/handler.ts'),
    pathPrefix: '/v1/uploads',
    description: 'Upload orchestration and presigned URL flows',
    timeout: Duration.seconds(10),
    memorySize: 512,
    scaling: {
      reservedConcurrency: { dev: 2, staging: 6, prod: 10 },
    },
    environment: {
      POWERTOOLS_SERVICE_NAME: 'uploads',
    },
  },
  {
    id: 'SearchService',
    domain: 'search',
    entry: path.join(__dirname, '../../services/search/handler.ts'),
    pathPrefix: '/v1/search',
    description: 'Search API routing backed by projection store',
    timeout: Duration.seconds(12),
    memorySize: 1024,
    scaling: {
      reservedConcurrency: { dev: 2, staging: 8, prod: 18 },
    },
    environment: {
      POWERTOOLS_SERVICE_NAME: 'search',
    },
  },
];

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
      throw new Error(`Unsupported environment: ${input ?? 'undefined'}. Expected dev | staging | prod.`);
  }
}

function shellQuotePath(value: string): string {
  return `'${value.replace(/'/g, "'\\''")}'`;
}

function toLogRetention(env: EnvironmentKey): logs.RetentionDays {
  switch (env) {
    case 'dev':
      return logs.RetentionDays.ONE_MONTH;
    case 'staging':
      return logs.RetentionDays.THREE_MONTHS;
    case 'prod':
      return logs.RetentionDays.SIX_MONTHS;
  }
}

export class ApiStack extends cdk.Stack {
  public readonly httpApi: apigwv2.HttpApi;
  public readonly rdsProxy: rds.DatabaseProxy;
  public readonly migrationFunction: lambda.Function;
  public readonly lambdaSecurityGroup: ec2.ISecurityGroup;

  constructor(scope: Construct, id: string, props: ApiStackProps) {
    super(scope, id, props);

    const envKey = normalizeEnvironment(props.environment ?? this.node.tryGetContext('environment'));
    const stageName = envKey;
    const skipNetworkWiring = this.node.tryGetContext('skipCrossStackNetworking') === true;

    const baseLambdaEnv = {
      NODE_ENV: envKey,
      APP_ENVIRONMENT: envKey,
      LOG_LEVEL: envKey === 'prod' ? 'info' : 'debug',
      POWERTOOLS_METRICS_NAMESPACE: 'NameCard',
      DB_NAME: DATABASE_NAME,
      DB_USER: DATABASE_USER,
      DB_SECRET_ARN: props.dbSecret.secretArn,
    } satisfies Record<string, string>;

    const lambdaBundling: BundlingOptions = {
      format: OutputFormat.ESM,
      target: 'node20',
      minify: envKey !== 'dev',
      sourceMap: true,
    };

    const lambdaSecurityGroup =
      props.lambdaSecurityGroup ??
      new ec2.SecurityGroup(this, 'LambdaSharedSecurityGroup', {
        vpc: props.vpc,
        allowAllOutbound: true,
        description: 'Shared security group for NameCard Lambda functions',
      });

    this.lambdaSecurityGroup = lambdaSecurityGroup;

    const proxySecurityGroup = new ec2.SecurityGroup(this, 'RdsProxySecurityGroup', {
      vpc: props.vpc,
      description: 'Security group for RDS Proxy accepting Lambda traffic',
      allowAllOutbound: true,
    });

    // Allow proxy to reach the cluster and lambdas to reach the proxy
    if (!skipNetworkWiring) {
      new ec2.CfnSecurityGroupIngress(this, 'ProxyToClusterIngress', {
        groupId: props.databaseSecurityGroup.securityGroupId,
        sourceSecurityGroupId: proxySecurityGroup.securityGroupId,
        ipProtocol: 'tcp',
        fromPort: props.dbCluster.clusterEndpoint.port,
        toPort: props.dbCluster.clusterEndpoint.port,
        description: 'Allow RDS Proxy to reach Aurora cluster',
      });
    }

    const proxyClusterTarget = rds.DatabaseCluster.fromDatabaseClusterAttributes(this, 'ProxyClusterTarget', {
      clusterIdentifier: props.dbCluster.clusterIdentifier,
      engine: props.dbCluster.engine,
      port: props.dbCluster.clusterEndpoint.port,
      securityGroups: [],
      secret: props.dbSecret,
    });

    this.rdsProxy = new rds.DatabaseProxy(this, 'NameCardRdsProxy', {
      proxyTarget: rds.ProxyTarget.fromCluster(proxyClusterTarget),
      vpc: props.vpc,
      secrets: [props.dbSecret],
      securityGroups: [proxySecurityGroup],
      borrowTimeout: Duration.seconds(30),
      maxConnectionsPercent: 80,
      requireTLS: true,
      debugLogging: envKey !== 'prod',
      iamAuth: true,
      dbProxyName: `namecard-${envKey}-proxy`,
      vpcSubnets: props.applicationSubnets,
    });

    if (!skipNetworkWiring) {
      new ec2.CfnSecurityGroupIngress(this, 'LambdaToProxyIngress', {
        groupId: proxySecurityGroup.securityGroupId,
        sourceSecurityGroupId: lambdaSecurityGroup.securityGroupId,
        ipProtocol: 'tcp',
        fromPort: props.dbCluster.clusterEndpoint.port,
        toPort: props.dbCluster.clusterEndpoint.port,
        description: 'Allow Lambda security group to reach RDS Proxy',
      });
    }

    const accessLogGroup = new logs.LogGroup(this, 'HttpApiAccessLogs', {
      retention: toLogRetention(envKey),
      removalPolicy: envKey === 'prod' ? cdk.RemovalPolicy.RETAIN : cdk.RemovalPolicy.DESTROY,
    });

    this.httpApi = new apigwv2.HttpApi(this, 'NameCardHttpApi', {
      apiName: `namecard-${envKey}-http`,
      corsPreflight: {
        allowHeaders: ['*'],
        allowMethods: [apigwv2.CorsHttpMethod.ANY],
        allowOrigins: ['*'],
        exposeHeaders: ['*'],
        maxAge: Duration.days(1),
      },
    });

    const stage = this.httpApi.addStage('PrimaryStage', {
      stageName,
      autoDeploy: true,
      accessLogSettings: {
        destination: new apigwv2.LogGroupLogDestination(accessLogGroup),
        format: AccessLogFormat.jsonWithStandardFields({
          caller: true,
          httpMethod: true,
          ip: true,
          protocol: true,
          requestTime: true,
          resourcePath: true,
          responseLength: true,
          status: true,
          user: true,
        }),
      },
    });

    stage.node.addDependency(accessLogGroup);

    const deadLetterQueue = new sqs.Queue(this, 'LambdaDeadLetterQueue', {
      queueName: `namecard-${envKey}-lambda-dlq`,
      retentionPeriod: envKey === 'prod' ? Duration.days(14) : Duration.days(7),
      encryption: sqs.QueueEncryption.KMS_MANAGED,
      visibilityTimeout: Duration.minutes(5),
    });

    const migrationLambda = new NodejsFunction(this, 'SchemaMigrator', {
      entry: path.join(__dirname, '../migrator/handler.ts'),
      runtime: lambda.Runtime.NODEJS_20_X,
      architecture: lambda.Architecture.ARM_64,
      memorySize: 1024,
      timeout: Duration.minutes(5),
      description: 'Runs ordered database schema migrations from service folders',
      bundling: {
        ...lambdaBundling,
        format: OutputFormat.CJS,
        commandHooks: {
          beforeBundling(inputDir, outputDir) {
            const migrationsDir = `${outputDir}/migrations`;
            const quotedMigrationsDir = shellQuotePath(migrationsDir);
            const quotedServicesDir = shellQuotePath(SERVICES_DIR);
            return [
              `mkdir -p ${quotedMigrationsDir}`,
              `find ${quotedServicesDir} -maxdepth 2 -type f -path '*/migrations/*' -name '*.sql' -exec cp {} ${quotedMigrationsDir}/ \\;`,
            ];
          },
          afterBundling() {
            return [];
          },
          beforeInstall() {
            return [];
          },
        },
      },
      vpc: props.vpc,
      securityGroups: [lambdaSecurityGroup],
      vpcSubnets: props.applicationSubnets,
      environment: {
        ...baseLambdaEnv,
        POWERTOOLS_SERVICE_NAME: 'migrator',
        DB_PROXY_ENDPOINT: this.rdsProxy.endpoint,
        DB_PROXY_NAME: this.rdsProxy.dbProxyName,
        DB_CLUSTER_ENDPOINT: props.dbCluster.clusterEndpoint.hostname,
      },
      tracing: lambda.Tracing.ACTIVE,
    });

    new logs.LogRetention(this, 'SchemaMigratorLogRetention', {
      logGroupName: migrationLambda.logGroup.logGroupName,
      retention: toLogRetention(envKey),
    });

    props.dbSecret.grantRead(migrationLambda);
    this.rdsProxy.grantConnect(migrationLambda, DATABASE_USER);

    this.migrationFunction = migrationLambda;

    const migrationProvider = new cr.Provider(this, 'MigrationProvider', {
      onEventHandler: migrationLambda,
    });

    const migrationsVersion = this.node.tryGetContext('migrationsVersion') ?? 'bootstrap';

    const runMigrations = new CustomResource(this, 'RunMigrations', {
      serviceToken: migrationProvider.serviceToken,
      properties: {
        version: migrationsVersion,
      },
    });

    const lambdaLayer = new lambda.LayerVersion(this, 'SharedDataLayer', {
      compatibleRuntimes: [lambda.Runtime.NODEJS_20_X],
      description: 'Shared runtime dependencies for NameCard Lambdas',
      removalPolicy: cdk.RemovalPolicy.RETAIN_ON_UPDATE_OR_DELETE,
      code: lambda.Code.fromAsset(path.join(__dirname, '../../services/layers/data')),
    });

    const serviceIntegrations: Record<string, apigwv2Integrations.HttpLambdaIntegration> = {};
    const functionRecords: Array<{ definition: ServiceDefinition; fn: NodejsFunction }> = [];

    SERVICE_DEFINITIONS.forEach((service) => {
      const functionEnv = {
        ...baseLambdaEnv,
        DB_PROXY_ENDPOINT: this.rdsProxy.endpoint,
        SERVICE_NAME: service.domain,
        ...(service.environment ?? {}),
      };

      const fn = new NodejsFunction(this, `${service.id}Function`, {
        entry: service.entry,
        runtime: lambda.Runtime.NODEJS_20_X,
        architecture: lambda.Architecture.ARM_64,
        memorySize: service.memorySize,
        timeout: service.timeout,
        description: service.description,
        bundling: lambdaBundling,
        vpc: props.vpc,
        securityGroups: [lambdaSecurityGroup],
        vpcSubnets: props.applicationSubnets,
        reservedConcurrentExecutions: service.scaling.reservedConcurrency[envKey],
        tracing: lambda.Tracing.ACTIVE,
        environment: functionEnv,
        layers: [lambdaLayer],
        deadLetterQueue,
        deadLetterQueueEnabled: true,
      });

      new logs.LogRetention(this, `${service.id}LogRetention`, {
        logGroupName: fn.logGroup.logGroupName,
        retention: toLogRetention(envKey),
      });

      props.dbSecret.grantRead(fn);
      this.rdsProxy.grantConnect(fn, DATABASE_USER);

      fn.addToRolePolicy(new iam.PolicyStatement({
        actions: ['secretsmanager:GetSecretValue'],
        resources: [props.dbSecret.secretArn],
      }));

      fn.node.addDependency(runMigrations);

      functionRecords.push({ definition: service, fn });

      const provisionedValue = service.scaling.provisionedConcurrency?.[envKey];
      const integrationTarget: lambda.IFunction = (() => {
        if (provisionedValue && provisionedValue > 0) {
          const alias = new lambda.Alias(this, `${service.id}Alias`, {
            aliasName: `${stageName}-live`,
            version: fn.currentVersion,
            provisionedConcurrentExecutions: provisionedValue,
          });
          return alias;
        }
        return fn;
      })();

      const integration = new apigwv2Integrations.HttpLambdaIntegration(
        `${service.id}Integration`,
        integrationTarget,
      );

      serviceIntegrations[service.domain] = integration;

      this.httpApi.addRoutes({
        path: service.pathPrefix,
        methods: [apigwv2.HttpMethod.ANY],
        integration,
      });

      this.httpApi.addRoutes({
        path: `${service.pathPrefix}/{proxy+}`,
        methods: [apigwv2.HttpMethod.ANY],
        integration,
      });
    });

    new cdk.CfnOutput(this, 'HttpApiUrl', {
      value: this.httpApi.apiEndpoint,
      description: 'HTTP API base URL for the NameCard services',
      exportName: `namecard-${envKey}-http-endpoint`,
    });

    new cdk.CfnOutput(this, 'RdsProxyEndpoint', {
      value: this.rdsProxy.endpoint,
      description: 'RDS Proxy endpoint for Lambda connections',
      exportName: `namecard-${envKey}-rds-proxy-endpoint`,
    });

    functionRecords.forEach(({ definition, fn }) => {
      const durationThreshold = Math.max(200, Math.round(definition.timeout.toMilliseconds() * 0.8));

      new cw.Alarm(this, `${definition.id}ErrorsAlarm`, {
        alarmDescription: `${definition.domain} Lambda error rate exceeds threshold`,
        metric: fn.metricErrors({
          period: Duration.minutes(5),
          statistic: 'Sum',
        }),
        comparisonOperator: cw.ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
        threshold: envKey === 'prod' ? 1 : 3,
        evaluationPeriods: 1,
        datapointsToAlarm: 1,
        treatMissingData: cw.TreatMissingData.NOT_BREACHING,
      });

      new cw.Alarm(this, `${definition.id}ThrottlesAlarm`, {
        alarmDescription: `${definition.domain} Lambda throttles detected`,
        metric: fn.metricThrottles({
          period: Duration.minutes(5),
          statistic: 'Sum',
        }),
        comparisonOperator: cw.ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
        threshold: 1,
        evaluationPeriods: 1,
        datapointsToAlarm: 1,
        treatMissingData: cw.TreatMissingData.NOT_BREACHING,
      });

      new cw.Alarm(this, `${definition.id}LatencyAlarm`, {
        alarmDescription: `${definition.domain} Lambda latency p95 saturation`,
        metric: fn.metricDuration({
          period: Duration.minutes(5),
          statistic: 'p95',
        }),
        comparisonOperator: cw.ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
        threshold: durationThreshold,
        evaluationPeriods: 1,
        datapointsToAlarm: 1,
        treatMissingData: cw.TreatMissingData.NOT_BREACHING,
      });
    });

    new cw.Alarm(this, 'LambdaDeadLetterQueueAlarm', {
      alarmDescription: 'Lambda DLQ has messages pending investigation',
      metric: deadLetterQueue.metricApproximateNumberOfMessagesVisible({
        period: Duration.minutes(5),
        statistic: 'Average',
      }),
      comparisonOperator: cw.ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
      threshold: envKey === 'prod' ? 1 : 5,
      evaluationPeriods: 1,
      datapointsToAlarm: 1,
      treatMissingData: cw.TreatMissingData.NOT_BREACHING,
    });

    const apiLatencyMetric = new cw.Metric({
      namespace: 'AWS/ApiGateway',
      metricName: 'Latency',
      statistic: 'p95',
      period: Duration.minutes(5),
      dimensionsMap: {
        ApiId: this.httpApi.apiId,
        Stage: stageName,
      },
    });

    new cw.Alarm(this, 'HttpApiLatencyAlarm', {
      alarmDescription: 'HTTP API latency exceeding target p95 threshold',
      metric: apiLatencyMetric,
      comparisonOperator: cw.ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
      threshold: envKey === 'prod' ? 750 : 1200,
      evaluationPeriods: 1,
      datapointsToAlarm: 1,
      treatMissingData: cw.TreatMissingData.NOT_BREACHING,
    });

    const dbConnectionsMetric = new cw.Metric({
      namespace: 'AWS/RDS',
      metricName: 'DatabaseConnections',
      statistic: 'Average',
      period: Duration.minutes(5),
      dimensionsMap: {
        DBClusterIdentifier: props.dbCluster.clusterIdentifier,
      },
    });

    new cw.Alarm(this, 'DbConnectionsAlarm', {
      alarmDescription: 'Aurora database connections nearing capacity',
      metric: dbConnectionsMetric,
      comparisonOperator: cw.ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
      threshold: envKey === 'prod' ? 450 : envKey === 'staging' ? 180 : 60,
      evaluationPeriods: 1,
      datapointsToAlarm: 1,
      treatMissingData: cw.TreatMissingData.NOT_BREACHING,
    });

    const proxyConnectionsMetric = new cw.Metric({
      namespace: 'AWS/RDS',
      metricName: 'DatabaseConnections',
      statistic: 'Average',
      period: Duration.minutes(5),
      dimensionsMap: {
        DBProxyName: this.rdsProxy.dbProxyName,
      },
    });

    new cw.Alarm(this, 'RdsProxyConnectionsAlarm', {
      alarmDescription: 'RDS Proxy connection pool saturation detected',
      metric: proxyConnectionsMetric,
      comparisonOperator: cw.ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
      threshold: envKey === 'prod' ? 350 : 120,
      evaluationPeriods: 1,
      datapointsToAlarm: 1,
      treatMissingData: cw.TreatMissingData.NOT_BREACHING,
    });

    const dashboard = new cw.Dashboard(this, 'ObservabilityDashboard', {
      dashboardName: `namecard-${envKey}-observability`,
      start: '-PT12H',
    });

    dashboard.addWidgets(
      new cw.GraphWidget({
        title: 'Lambda Errors (5m)',
        left: functionRecords.map(({ definition, fn }) =>
          fn.metricErrors({ period: Duration.minutes(5), statistic: 'Sum', label: definition.domain }),
        ),
      }),
      new cw.GraphWidget({
        title: 'Lambda Duration p95 (5m)',
        left: functionRecords.map(({ definition, fn }) =>
          fn.metricDuration({ period: Duration.minutes(5), statistic: 'p95', label: definition.domain }),
        ),
      }),
    );

    dashboard.addWidgets(
      new cw.GraphWidget({
        title: 'DLQ Depth',
        left: [deadLetterQueue.metricApproximateNumberOfMessagesVisible({ period: Duration.minutes(5) })],
      }),
      new cw.GraphWidget({
        title: 'API Latency p95',
        left: [apiLatencyMetric],
      }),
    );

    dashboard.addWidgets(
      new cw.GraphWidget({
        title: 'Database Connections',
        left: [dbConnectionsMetric, proxyConnectionsMetric],
      }),
    );

    cdk.Tags.of(this).add('Environment', envKey);
    cdk.Tags.of(this).add('Application', 'NameCard');
    cdk.Tags.of(this).add('Component', 'Api');
  }
}
