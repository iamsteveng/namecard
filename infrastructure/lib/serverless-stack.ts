import * as cdk from 'aws-cdk-lib';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import * as cloudwatch from 'aws-cdk-lib/aws-cloudwatch';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as xray from 'aws-cdk-lib/aws-xray';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';
import { Construct } from 'constructs';

export interface ServerlessStackProps extends cdk.StackProps {
  environment: string;
  vpc?: ec2.IVpc;
  databaseSecurityGroup?: ec2.ISecurityGroup;
  cognitoUserPoolId?: string;
  s3BucketName?: string;
  s3CdnDomain?: string;
  apiSecret?: secretsmanager.ISecret;
}

export class ServerlessStack extends cdk.Stack {
  public readonly apiGateway: apigateway.RestApi;
  public readonly monitoringDashboard: cloudwatch.Dashboard;
  public readonly lambdaSecurityGroup: ec2.SecurityGroup;

  constructor(scope: Construct, id: string, props: ServerlessStackProps) {
    super(scope, id, props);

    const { environment, vpc, databaseSecurityGroup, cognitoUserPoolId, s3BucketName, s3CdnDomain, apiSecret } = props;

    // Import VPC from existing production stack
    const existingVpc = vpc || ec2.Vpc.fromLookup(this, 'ExistingVPC', {
      vpcId: cdk.Fn.importValue(`NameCardProd-${environment}-VpcId`),
    });

    // Create security group for Lambda functions
    this.lambdaSecurityGroup = this.createLambdaSecurityGroup(existingVpc, environment);

    // Create API Gateway
    this.apiGateway = this.createApiGateway(environment);
    
    // Create monitoring dashboard
    this.monitoringDashboard = this.createServerlessMonitoringDashboard(environment);
    
    // Create CloudWatch alarms
    this.createServerlessAlarms(environment);
    
    // Enable X-Ray tracing
    this.enableXRayTracing(environment);
    
    // Setup custom metrics
    this.setupCustomMetrics(environment);

    // Add stack tags
    cdk.Tags.of(this).add('Environment', environment);
    cdk.Tags.of(this).add('Application', 'NameCard');
    cdk.Tags.of(this).add('ManagedBy', 'CDK');
    cdk.Tags.of(this).add('Stack', 'Serverless');

    // Create outputs
    this.createOutputs(environment);
  }

  private createLambdaSecurityGroup(vpc: ec2.IVpc, environment: string): ec2.SecurityGroup {
    const lambdaSG = new ec2.SecurityGroup(this, 'LambdaSecurityGroup', {
      vpc,
      securityGroupName: `namecard-lambda-sg-${environment}`,
      description: 'Security group for NameCard Lambda functions',
      allowAllOutbound: true,
    });

    // Allow Lambda functions to access RDS database
    // The database security group should allow inbound connections from this security group
    cdk.Tags.of(lambdaSG).add('Name', `namecard-lambda-sg-${environment}`);

    return lambdaSG;
  }

  private createApiGateway(environment: string): apigateway.RestApi {
    const api = new apigateway.RestApi(this, 'NameCardServerlessAPI', {
      restApiName: `namecard-serverless-${environment}`,
      description: `NameCard Serverless API Gateway - ${environment}`,
      
      // API Gateway configuration
      deployOptions: {
        stageName: environment,
        tracingEnabled: true,
        loggingLevel: apigateway.MethodLoggingLevel.INFO,
        dataTraceEnabled: true,
        metricsEnabled: true,
        throttlingBurstLimit: 1000,
        throttlingRateLimit: 500,
      },

      // Default CORS configuration
      defaultCorsPreflightOptions: {
        allowOrigins: ['*'],
        allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
        allowHeaders: [
          'Content-Type',
          'Authorization',
          'X-Amz-Date',
          'X-Api-Key',
          'X-Amz-Security-Token',
        ],
        maxAge: cdk.Duration.days(1),
      },

      // Binary media types for image uploads
      binaryMediaTypes: [
        'image/jpeg',
        'image/png',
        'image/heic',
        'image/webp',
        'multipart/form-data',
      ],

      // Policy to restrict access if needed
      policy: undefined, // Open for now, can be restricted later
    });

    // Create API Gateway resources structure
    const apiV1 = api.root.addResource('api').addResource('v1');
    
    // Add service resources (these will be connected to Lambda functions during deployment)
    const authResource = apiV1.addResource('auth');
    const cardsResource = apiV1.addResource('cards');
    const uploadResource = apiV1.addResource('upload');
    const scanResource = apiV1.addResource('scan');
    const enrichmentResource = apiV1.addResource('enrichment');

    // Add proxy resources for each service
    authResource.addProxy({
      anyMethod: false, // We'll add methods explicitly through serverless
    });
    cardsResource.addProxy({
      anyMethod: false,
    });
    uploadResource.addProxy({
      anyMethod: false,
    });
    scanResource.addProxy({
      anyMethod: false,
    });
    enrichmentResource.addProxy({
      anyMethod: false,
    });

    // Add custom domain if specified
    // This would be configured later with Route 53 and SSL certificate
    
    return api;
  }

  private createServerlessMonitoringDashboard(environment: string): cloudwatch.Dashboard {
    const dashboard = new cloudwatch.Dashboard(this, 'ServerlessMonitoringDashboard', {
      dashboardName: `NameCard-Serverless-${environment}`,
    });

    // Lambda Function Duration Metrics Widget
    const lambdaDurationWidget = new cloudwatch.GraphWidget({
      title: 'Lambda Function Duration',
      left: [
        new cloudwatch.Metric({
          namespace: 'AWS/Lambda',
          metricName: 'Duration',
          dimensionsMap: { FunctionName: `namecard-auth-${environment}` },
          statistic: 'Average',
          period: cdk.Duration.minutes(5),
        }),
        new cloudwatch.Metric({
          namespace: 'AWS/Lambda',
          metricName: 'Duration',
          dimensionsMap: { FunctionName: `namecard-cards-${environment}` },
          statistic: 'Average',
          period: cdk.Duration.minutes(5),
        }),
        new cloudwatch.Metric({
          namespace: 'AWS/Lambda',
          metricName: 'Duration',
          dimensionsMap: { FunctionName: `namecard-upload-${environment}` },
          statistic: 'Average',
          period: cdk.Duration.minutes(5),
        }),
        new cloudwatch.Metric({
          namespace: 'AWS/Lambda',
          metricName: 'Duration',
          dimensionsMap: { FunctionName: `namecard-scan-${environment}` },
          statistic: 'Average',
          period: cdk.Duration.minutes(5),
        }),
        new cloudwatch.Metric({
          namespace: 'AWS/Lambda',
          metricName: 'Duration',
          dimensionsMap: { FunctionName: `namecard-enrichment-${environment}` },
          statistic: 'Average',
          period: cdk.Duration.minutes(5),
        }),
      ],
      width: 12,
      height: 6,
    });

    // Lambda Function Error Metrics Widget
    const lambdaErrorWidget = new cloudwatch.GraphWidget({
      title: 'Lambda Function Errors',
      left: [
        new cloudwatch.Metric({
          namespace: 'AWS/Lambda',
          metricName: 'Errors',
          dimensionsMap: { FunctionName: `namecard-auth-${environment}` },
          statistic: 'Sum',
          period: cdk.Duration.minutes(5),
        }),
        new cloudwatch.Metric({
          namespace: 'AWS/Lambda',
          metricName: 'Errors',
          dimensionsMap: { FunctionName: `namecard-cards-${environment}` },
          statistic: 'Sum',
          period: cdk.Duration.minutes(5),
        }),
        new cloudwatch.Metric({
          namespace: 'AWS/Lambda',
          metricName: 'Errors',
          dimensionsMap: { FunctionName: `namecard-upload-${environment}` },
          statistic: 'Sum',
          period: cdk.Duration.minutes(5),
        }),
        new cloudwatch.Metric({
          namespace: 'AWS/Lambda',
          metricName: 'Errors',
          dimensionsMap: { FunctionName: `namecard-scan-${environment}` },
          statistic: 'Sum',
          period: cdk.Duration.minutes(5),
        }),
        new cloudwatch.Metric({
          namespace: 'AWS/Lambda',
          metricName: 'Errors',
          dimensionsMap: { FunctionName: `namecard-enrichment-${environment}` },
          statistic: 'Sum',
          period: cdk.Duration.minutes(5),
        }),
      ],
      width: 12,
      height: 6,
    });

    // API Gateway Metrics Widget
    const apiGatewayRequestsWidget = new cloudwatch.GraphWidget({
      title: 'API Gateway Requests',
      left: [
        new cloudwatch.Metric({
          namespace: 'AWS/ApiGateway',
          metricName: 'Count',
          dimensionsMap: { ApiName: `namecard-serverless-${environment}` },
          statistic: 'Sum',
          period: cdk.Duration.minutes(5),
        }),
      ],
      width: 6,
      height: 6,
    });

    // API Gateway Latency Widget
    const apiGatewayLatencyWidget = new cloudwatch.GraphWidget({
      title: 'API Gateway Latency',
      left: [
        new cloudwatch.Metric({
          namespace: 'AWS/ApiGateway',
          metricName: 'Latency',
          dimensionsMap: { ApiName: `namecard-serverless-${environment}` },
          statistic: 'Average',
          period: cdk.Duration.minutes(5),
        }),
      ],
      width: 6,
      height: 6,
    });

    // Database Connection Pool Widget
    const databaseConnectionsWidget = new cloudwatch.GraphWidget({
      title: 'Database Connections',
      left: [
        new cloudwatch.Metric({
          namespace: 'NameCard/Database',
          metricName: 'ActiveConnections',
          statistic: 'Average',
          period: cdk.Duration.minutes(5),
        }),
      ],
      width: 6,
      height: 6,
    });

    // Business Metrics Widget
    const businessMetricsWidget = new cloudwatch.GraphWidget({
      title: 'Business Metrics',
      left: [
        new cloudwatch.Metric({
          namespace: 'NameCard/Business',
          metricName: 'CardScans',
          statistic: 'Sum',
          period: cdk.Duration.minutes(5),
        }),
        new cloudwatch.Metric({
          namespace: 'NameCard/Business',
          metricName: 'UserRegistrations',
          statistic: 'Sum',
          period: cdk.Duration.minutes(5),
        }),
      ],
      width: 6,
      height: 6,
    });

    // Add widgets to dashboard
    dashboard.addWidgets(lambdaDurationWidget, lambdaErrorWidget);
    dashboard.addWidgets(
      apiGatewayRequestsWidget,
      apiGatewayLatencyWidget,
      databaseConnectionsWidget,
      businessMetricsWidget
    );

    return dashboard;
  }

  private createServerlessAlarms(environment: string): void {
    // High Error Rate Alarm for all Lambda functions
    new cloudwatch.Alarm(this, 'LambdaHighErrorRate', {
      alarmName: `NameCard-Lambda-High-Error-Rate-${environment}`,
      alarmDescription: 'Alert when Lambda error rate exceeds 5%',
      metric: new cloudwatch.MathExpression({
        expression: '(errors/invocations)*100',
        usingMetrics: {
          errors: new cloudwatch.Metric({
            namespace: 'AWS/Lambda',
            metricName: 'Errors',
            statistic: 'Sum',
            period: cdk.Duration.minutes(5),
          }),
          invocations: new cloudwatch.Metric({
            namespace: 'AWS/Lambda',
            metricName: 'Invocations',
            statistic: 'Sum',
            period: cdk.Duration.minutes(5),
          }),
        },
      }),
      threshold: 5,
      evaluationPeriods: 2,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    });

    // High Latency Alarm for API Gateway
    new cloudwatch.Alarm(this, 'ApiGatewayHighLatency', {
      alarmName: `NameCard-API-High-Latency-${environment}`,
      alarmDescription: 'Alert when API Gateway latency exceeds 2 seconds',
      metric: new cloudwatch.Metric({
        namespace: 'AWS/ApiGateway',
        metricName: 'Latency',
        dimensionsMap: { ApiName: `namecard-serverless-${environment}` },
        statistic: 'Average',
        period: cdk.Duration.minutes(5),
      }),
      threshold: 2000, // 2 seconds in milliseconds
      evaluationPeriods: 3,
    });

    // Database Connection High Alarm
    new cloudwatch.Alarm(this, 'DatabaseConnectionHigh', {
      alarmName: `NameCard-Database-Connection-High-${environment}`,
      alarmDescription: 'Alert when database connections exceed 80% of max',
      metric: new cloudwatch.Metric({
        namespace: 'NameCard/Database',
        metricName: 'ActiveConnections',
        statistic: 'Maximum',
        period: cdk.Duration.minutes(5),
      }),
      threshold: 80, // Assuming max 100 connections
      evaluationPeriods: 2,
    });

    // API Gateway 4xx Error Rate Alarm
    new cloudwatch.Alarm(this, 'ApiGateway4xxErrors', {
      alarmName: `NameCard-API-4xx-Errors-${environment}`,
      alarmDescription: 'Alert when API Gateway 4xx error rate is high',
      metric: new cloudwatch.Metric({
        namespace: 'AWS/ApiGateway',
        metricName: '4XXError',
        dimensionsMap: { ApiName: `namecard-serverless-${environment}` },
        statistic: 'Sum',
        period: cdk.Duration.minutes(5),
      }),
      threshold: 20, // 20 4xx errors in 5 minutes
      evaluationPeriods: 2,
    });

    // API Gateway 5xx Error Rate Alarm
    new cloudwatch.Alarm(this, 'ApiGateway5xxErrors', {
      alarmName: `NameCard-API-5xx-Errors-${environment}`,
      alarmDescription: 'Alert when API Gateway 5xx error rate is high',
      metric: new cloudwatch.Metric({
        namespace: 'AWS/ApiGateway',
        metricName: '5XXError',
        dimensionsMap: { ApiName: `namecard-serverless-${environment}` },
        statistic: 'Sum',
        period: cdk.Duration.minutes(5),
      }),
      threshold: 5, // 5 5xx errors in 5 minutes
      evaluationPeriods: 1,
    });
  }

  private enableXRayTracing(environment: string): void {
    // Create X-Ray sampling rule for cost optimization
    new xray.CfnSamplingRule(this, 'ServerlessSamplingRule', {
      samplingRule: {
        ruleName: `NameCard-Serverless-${environment}`,
        priority: 9000,
        fixedRate: 0.1, // 10% sampling rate
        reservoirSize: 1,
        serviceName: `namecard-${environment}`,
        serviceType: '*',
        host: '*',
        httpMethod: '*',
        urlPath: '*',
        resourceArn: '*',
        version: 1,
      },
    });
  }

  private setupCustomMetrics(environment: string): void {
    // Custom metrics will be emitted from Lambda functions
    // This creates the log groups and metric filters for each service
    
    const services = ['auth', 'cards', 'upload', 'scan', 'enrichment'];
    
    services.forEach(service => {
      const logGroup = new logs.LogGroup(this, `${service}LogGroup`, {
        logGroupName: `/aws/lambda/namecard-${service}-${environment}`,
        retention: environment === 'production' ? logs.RetentionDays.ONE_MONTH : logs.RetentionDays.ONE_WEEK,
        removalPolicy: cdk.RemovalPolicy.DESTROY,
      });

      // Metric filter for business metrics
      new logs.MetricFilter(this, `${service}BusinessMetrics`, {
        logGroup,
        metricNamespace: 'NameCard/Business',
        metricName: service === 'auth' ? 'UserRegistrations' : 
                   service === 'cards' ? 'CardOperations' :
                   service === 'scan' ? 'CardScans' : 
                   service === 'enrichment' ? 'EnrichmentRequests' : 'FileUploads',
        filterPattern: logs.FilterPattern.stringValue('$.eventType', '=', 'BUSINESS_METRIC'),
        metricValue: '$.count',
        defaultValue: 0,
      });

      // Metric filter for database connections
      new logs.MetricFilter(this, `${service}DatabaseConnections`, {
        logGroup,
        metricNamespace: 'NameCard/Database',
        metricName: 'ActiveConnections',
        filterPattern: logs.FilterPattern.stringValue('$.eventType', '=', 'DB_CONNECTION'),
        metricValue: '$.activeConnections',
        defaultValue: 0,
      });
    });
  }

  private createOutputs(environment: string): void {
    // API Gateway URL
    new cdk.CfnOutput(this, 'ApiGatewayUrl', {
      value: this.apiGateway.url,
      description: 'Serverless API Gateway URL',
      exportName: `${this.stackName}-ApiGatewayUrl`,
    });

    // API Gateway ID
    new cdk.CfnOutput(this, 'ApiGatewayId', {
      value: this.apiGateway.restApiId,
      description: 'Serverless API Gateway ID',
      exportName: `${this.stackName}-ApiGatewayId`,
    });

    // Lambda Security Group ID for use by serverless functions
    new cdk.CfnOutput(this, 'LambdaSecurityGroupId', {
      value: this.lambdaSecurityGroup.securityGroupId,
      description: 'Security Group ID for Lambda functions',
      exportName: `${this.stackName}-LambdaSecurityGroupId`,
    });

    // Dashboard URL
    new cdk.CfnOutput(this, 'DashboardUrl', {
      value: `https://console.aws.amazon.com/cloudwatch/home?region=${this.region}#dashboards:name=${this.monitoringDashboard.dashboardName}`,
      description: 'CloudWatch Dashboard URL',
    });

    // X-Ray Service Map URL
    new cdk.CfnOutput(this, 'XRayServiceMapUrl', {
      value: `https://console.aws.amazon.com/xray/home?region=${this.region}#/service-map`,
      description: 'X-Ray Service Map URL',
    });
  }
}

export default ServerlessStack;