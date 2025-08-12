import * as cdk from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as rds from 'aws-cdk-lib/aws-rds';
import * as ecs from 'aws-cdk-lib/aws-ecs';
import * as ecsPatterns from 'aws-cdk-lib/aws-ecs-patterns';
import * as elasticache from 'aws-cdk-lib/aws-elasticache';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as elbv2 from 'aws-cdk-lib/aws-elasticloadbalancingv2';
import * as certificatemanager from 'aws-cdk-lib/aws-certificatemanager';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import * as origins from 'aws-cdk-lib/aws-cloudfront-origins';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as s3deployment from 'aws-cdk-lib/aws-s3-deployment';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as iam from 'aws-cdk-lib/aws-iam';
import { Platform } from 'aws-cdk-lib/aws-ecr-assets';
import { Construct } from 'constructs';

export interface ProductionStackProps extends cdk.StackProps {
  environment: string;
  domainName?: string;
  certificateArn?: string;
  // Reference existing stacks
  s3Bucket?: s3.IBucket;
  cognitoUserPoolId?: string;
  cognitoClientId?: string;
}

export class ProductionStack extends cdk.Stack {
  public readonly vpc: ec2.Vpc;
  public readonly database: rds.DatabaseInstance;
  public readonly ecsCluster: ecs.Cluster;
  public readonly apiService: ecsPatterns.ApplicationLoadBalancedFargateService;
  public readonly redis: elasticache.CfnCacheCluster;
  public readonly secrets: secretsmanager.Secret;
  public readonly migrationFunction: lambda.Function;
  
  constructor(scope: Construct, id: string, props: ProductionStackProps) {
    super(scope, id, props);

    const { environment, domainName, certificateArn } = props;

    // Create VPC with public and private subnets
    this.vpc = this.createVPC(environment);

    // Create database secrets
    this.secrets = this.createSecrets(environment);

    // Create RDS PostgreSQL database
    this.database = this.createDatabase(environment);

    // Create ElastiCache Redis cluster
    this.redis = this.createRedisCluster(environment);

    // Create ECS cluster
    this.ecsCluster = this.createECSCluster(environment);

    // Create migration Lambda function
    this.migrationFunction = this.createMigrationFunction(environment);

    // Create API service with load balancer
    this.apiService = this.createAPIService(environment, domainName, certificateArn);

    // Create frontend S3 bucket and CloudFront (if not using existing)
    if (!props.s3Bucket) {
      this.createFrontendInfrastructure(environment, domainName);
    }

    // Add monitoring and logging
    this.setupMonitoring(environment);

    // Add stack tags
    cdk.Tags.of(this).add('Environment', environment);
    cdk.Tags.of(this).add('Application', 'NameCard');
    cdk.Tags.of(this).add('ManagedBy', 'CDK');
    cdk.Tags.of(this).add('Stack', 'Production');

    // Create outputs
    this.createOutputs(environment, props);
  }

  private createVPC(environment: string): ec2.Vpc {
    return new ec2.Vpc(this, 'NameCardVPC', {
      vpcName: `namecard-vpc-${environment}`,
      maxAzs: 2, // Use 2 availability zones for cost optimization
      ipAddresses: ec2.IpAddresses.cidr('10.0.0.0/16'),
      
      subnetConfiguration: [
        // Public subnets for load balancers
        {
          cidrMask: 24,
          name: 'PublicSubnet',
          subnetType: ec2.SubnetType.PUBLIC,
        },
        // Private subnets for applications
        {
          cidrMask: 24,
          name: 'PrivateWithEgress',
          subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS,
        },
        // Isolated subnets for databases
        {
          cidrMask: 24,
          name: 'Isolated',
          subnetType: ec2.SubnetType.PRIVATE_ISOLATED,
        },
      ],
      
      natGateways: environment === 'production' ? 2 : 1, // Single NAT for dev/staging
      
      enableDnsHostnames: true,
      enableDnsSupport: true,
    });
  }

  private createSecrets(environment: string): secretsmanager.Secret {
    // Database credentials
    const dbSecret = new secretsmanager.Secret(this, 'DatabaseSecret', {
      secretName: `namecard/database/${environment}`,
      description: `Database credentials for NameCard ${environment}`,
      generateSecretString: {
        secretStringTemplate: JSON.stringify({ username: 'namecard_admin' }),
        generateStringKey: 'password',
        excludeCharacters: ' %+~`#$&*()|[]{}:;<>?!\'/@"\\',
        includeSpace: false,
        passwordLength: 32,
      },
    });

    // API secrets (JWT secret, API keys, etc.)
    const apiSecret = new secretsmanager.Secret(this, 'APISecret', {
      secretName: `namecard/api/${environment}`,
      description: `API secrets for NameCard ${environment}`,
      secretObjectValue: {
        JWT_SECRET: cdk.SecretValue.unsafePlainText(this.generateRandomString(64)),
        SESSION_SECRET: cdk.SecretValue.unsafePlainText(this.generateRandomString(32)),
        ENCRYPTION_KEY: cdk.SecretValue.unsafePlainText(this.generateRandomString(32)),
      },
    });

    return dbSecret;
  }

  private createDatabase(environment: string): rds.DatabaseInstance {
    // Database parameter group for PostgreSQL optimization
    const parameterGroup = new rds.ParameterGroup(this, 'DatabaseParameterGroup', {
      engine: rds.DatabaseInstanceEngine.postgres({
        version: rds.PostgresEngineVersion.VER_15_13,
      }),
      parameters: {
        shared_preload_libraries: 'pg_stat_statements',
        log_statement: 'all',
        log_duration: 'on',
        log_lock_waits: 'on',
        log_min_duration_statement: '1000', // Log queries taking more than 1 second
      },
    });

    // Database subnet group
    const subnetGroup = new rds.SubnetGroup(this, 'DatabaseSubnetGroup', {
      vpc: this.vpc,
      subnetGroupName: `namecard-db-subnet-${environment}`,
      description: `Database subnet group for NameCard ${environment}`,
      vpcSubnets: {
        subnetType: ec2.SubnetType.PRIVATE_ISOLATED,
      },
    });

    // Database security group
    const databaseSG = new ec2.SecurityGroup(this, 'DatabaseSecurityGroup', {
      vpc: this.vpc,
      securityGroupName: `namecard-db-sg-${environment}`,
      description: 'Security group for NameCard database',
      allowAllOutbound: false, // Restrict outbound traffic
    });

    return new rds.DatabaseInstance(this, 'Database', {
      databaseName: 'namecard',
      instanceIdentifier: `namecard-db-${environment}`,
      
      // Engine configuration
      engine: rds.DatabaseInstanceEngine.postgres({
        version: rds.PostgresEngineVersion.VER_15_13,
      }),
      
      // Instance configuration
      instanceType: environment === 'production' 
        ? ec2.InstanceType.of(ec2.InstanceClass.T3, ec2.InstanceSize.MEDIUM)
        : ec2.InstanceType.of(ec2.InstanceClass.T3, ec2.InstanceSize.MICRO),
      
      // Credentials
      credentials: rds.Credentials.fromSecret(this.secrets),
      
      // Network configuration
      vpc: this.vpc,
      subnetGroup,
      securityGroups: [databaseSG],
      
      // Storage configuration
      allocatedStorage: environment === 'production' ? 100 : 20,
      maxAllocatedStorage: environment === 'production' ? 1000 : 100,
      storageType: rds.StorageType.GP3,
      storageEncrypted: true,
      
      // Backup configuration
      backupRetention: environment === 'production' 
        ? cdk.Duration.days(30) 
        : cdk.Duration.days(7),
      deleteAutomatedBackups: environment !== 'production',
      copyTagsToSnapshot: true,
      
      // Multi-AZ for production
      multiAz: environment === 'production',
      
      // Performance monitoring
      monitoringInterval: environment === 'production' 
        ? cdk.Duration.seconds(60)
        : cdk.Duration.seconds(0),
      enablePerformanceInsights: environment === 'production',
      performanceInsightRetention: environment === 'production' 
        ? rds.PerformanceInsightRetention.LONG_TERM
        : undefined,
      
      // Maintenance and updates
      autoMinorVersionUpgrade: true,
      allowMajorVersionUpgrade: false,
      preferredMaintenanceWindow: 'sun:02:00-sun:04:00', // Sunday 2-4 AM UTC
      preferredBackupWindow: '01:00-02:00', // 1-2 AM UTC
      
      // Parameter group
      parameterGroup,
      
      // Logging
      cloudwatchLogsExports: ['postgresql'],
      
      // Deletion protection
      deletionProtection: environment === 'production',
      removalPolicy: environment === 'production' 
        ? cdk.RemovalPolicy.RETAIN 
        : cdk.RemovalPolicy.DESTROY,
    });
  }

  private createRedisCluster(environment: string): elasticache.CfnCacheCluster {
    // ElastiCache subnet group
    const cacheSubnetGroup = new elasticache.CfnSubnetGroup(this, 'CacheSubnetGroup', {
      description: `Cache subnet group for NameCard ${environment}`,
      subnetIds: this.vpc.privateSubnets.map(subnet => subnet.subnetId),
      cacheSubnetGroupName: `namecard-cache-subnet-${environment}`,
    });

    // Cache security group
    const cacheSG = new ec2.SecurityGroup(this, 'CacheSecurityGroup', {
      vpc: this.vpc,
      securityGroupName: `namecard-cache-sg-${environment}`,
      description: 'Security group for NameCard Redis cache',
      allowAllOutbound: false,
    });

    return new elasticache.CfnCacheCluster(this, 'RedisCluster', {
      cacheNodeType: environment === 'production' ? 'cache.t3.medium' : 'cache.t3.micro',
      engine: 'redis',
      numCacheNodes: 1,
      clusterName: `namecard-redis-${environment}`,
      cacheSubnetGroupName: cacheSubnetGroup.cacheSubnetGroupName,
      vpcSecurityGroupIds: [cacheSG.securityGroupId],
      
      // Redis configuration
      engineVersion: '7.0',
      port: 6379,
      
      // Backup configuration
      snapshotRetentionLimit: environment === 'production' ? 5 : 1,
      snapshotWindow: '01:00-02:00',
      
      // Maintenance
      preferredMaintenanceWindow: 'sun:02:00-sun:04:00',
      
      // Monitoring
      notificationTopicArn: undefined, // TODO: Add SNS topic for notifications
      
      // Tags
      tags: [
        { key: 'Environment', value: environment },
        { key: 'Application', value: 'NameCard' },
        { key: 'Component', value: 'Cache' },
      ],
    });
  }

  private createECSCluster(environment: string): ecs.Cluster {
    return new ecs.Cluster(this, 'ECSCluster', {
      clusterName: `namecard-cluster-${environment}`,
      vpc: this.vpc,
      enableFargateCapacityProviders: true,
    });
  }

  private createAPIService(environment: string, domainName?: string, certificateArn?: string): ecsPatterns.ApplicationLoadBalancedFargateService {
    // Create log group for the service
    const logGroup = new logs.LogGroup(this, 'APIServiceLogGroup', {
      logGroupName: `/namecard/api-service/${environment}`,
      retention: environment === 'production' 
        ? logs.RetentionDays.ONE_MONTH 
        : logs.RetentionDays.ONE_WEEK,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    // Create the Fargate service
    const fargateService = new ecsPatterns.ApplicationLoadBalancedFargateService(this, 'APIService', {
      serviceName: `namecard-api-${environment}`,
      cluster: this.ecsCluster,
      
      // Task configuration
      cpu: environment === 'production' ? 1024 : 512, // 1 vCPU for prod, 0.5 for dev
      memoryLimitMiB: environment === 'production' ? 2048 : 1024, // 2GB for prod, 1GB for dev
      desiredCount: environment === 'production' ? 2 : 1,
      platformVersion: ecs.FargatePlatformVersion.LATEST, // Use latest platform
      runtimePlatform: {
        operatingSystemFamily: ecs.OperatingSystemFamily.LINUX,
        cpuArchitecture: ecs.CpuArchitecture.X86_64, // Force x86_64 architecture
      },
      
      // Task definition
      taskImageOptions: {
        image: ecs.ContainerImage.fromAsset('../', {
          file: 'packages/api/Dockerfile',
          platform: Platform.LINUX_AMD64, // Force x86_64 architecture for AWS Fargate
          exclude: [
            'infrastructure/',
            'node_modules/',
            '.git/',
            'cypress/',
            'docs/',
            '*.md',
            '.github/',
          ],
        }),
        containerPort: 3001,
        containerName: 'namecard-api',
        
        // Environment variables (non-sensitive)
        environment: {
          NODE_ENV: environment === 'production' ? 'production' : 'development',
          PORT: '3001',
          AWS_REGION: this.region,
          DB_HOST: this.database.instanceEndpoint.hostname,
          DB_PORT: this.database.instanceEndpoint.port.toString(),
          DB_NAME: 'namecard',
          
          // S3 Configuration
          S3_BUCKET_NAME: `namecard-images-${environment}-${this.account}`,
          S3_REGION: this.region,
          S3_CDN_DOMAIN: '', // Will be populated by CloudFront if needed
          
          // Cognito Configuration
          COGNITO_USER_POOL_ID: 'ap-southeast-1_bOA22s0Op',
          COGNITO_CLIENT_ID: '5s54d0ifpt3frtvut325uglrjp',
          COGNITO_REGION: this.region,
          
          // Redis Configuration
          REDIS_URL: `redis://${this.redis.attrRedisEndpointAddress}:6379`,
          REDIS_PASSWORD: '',
          
          // Security Configuration
          CORS_ORIGIN: 'http://localhost:3000,http://localhost:5173,http://localhost:8080',
          RATE_LIMIT_WINDOW_MS: '900000',
          RATE_LIMIT_MAX_REQUESTS: '100',
          
          // File Upload Configuration
          MAX_FILE_SIZE: '10485760', // 10MB
          ALLOWED_FILE_TYPES: 'image/jpeg,image/png,image/heic,image/webp',
          
          // Logging Configuration
          LOG_LEVEL: environment === 'production' ? 'info' : 'debug',
          LOG_FILE: 'logs/app.log',
          
          // External APIs (optional)
          CLEARBIT_API_KEY: '',
          NEWS_API_KEY: '',
        },
        
        // Secrets from AWS Secrets Manager (sensitive)
        secrets: {
          DB_USER: ecs.Secret.fromSecretsManager(this.secrets, 'username'),
          DB_PASS: ecs.Secret.fromSecretsManager(this.secrets, 'password'),
          JWT_SECRET: ecs.Secret.fromSecretsManager(
            secretsmanager.Secret.fromSecretNameV2(this, 'APISecretRef', `namecard/api/${environment}`),
            'JWT_SECRET'
          ),
        },
        
        // Logging
        logDriver: ecs.LogDrivers.awsLogs({
          streamPrefix: 'namecard-api',
          logGroup,
        }),
      },
      
      // Network configuration
      publicLoadBalancer: true,
      listenerPort: domainName && certificateArn ? 443 : 80,
      protocol: domainName && certificateArn ? elbv2.ApplicationProtocol.HTTPS : elbv2.ApplicationProtocol.HTTP,
      
      // Domain and certificate (only if both are provided)
      domainName: domainName && certificateArn ? `api.${domainName}` : undefined,
      domainZone: undefined, // TODO: Add Route 53 hosted zone if using custom domain
      certificate: certificateArn ? 
        certificatemanager.Certificate.fromCertificateArn(this, 'Certificate', certificateArn) : 
        undefined,
      
      // Health check
      healthCheckGracePeriod: cdk.Duration.seconds(300),
    });

    // Configure health check
    fargateService.targetGroup.configureHealthCheck({
      path: '/health',
      healthyHttpCodes: '200',
      interval: cdk.Duration.seconds(30),
      timeout: cdk.Duration.seconds(5),
      healthyThresholdCount: 2,
      unhealthyThresholdCount: 5,
    });

    // Auto-scaling configuration
    const scalableTarget = fargateService.service.autoScaleTaskCount({
      minCapacity: environment === 'production' ? 2 : 1,
      maxCapacity: environment === 'production' ? 10 : 3,
    });

    // CPU-based scaling
    scalableTarget.scaleOnCpuUtilization('CpuScaling', {
      targetUtilizationPercent: 70,
      scaleInCooldown: cdk.Duration.minutes(5),
      scaleOutCooldown: cdk.Duration.minutes(2),
    });

    // Memory-based scaling
    scalableTarget.scaleOnMemoryUtilization('MemoryScaling', {
      targetUtilizationPercent: 80,
      scaleInCooldown: cdk.Duration.minutes(5),
      scaleOutCooldown: cdk.Duration.minutes(2),
    });

    // Configure security groups
    this.configureSecurityGroups(fargateService);

    // Add Cognito permissions to task role
    this.configureTaskRolePermissions(fargateService, environment);

    return fargateService;
  }

  private configureSecurityGroups(fargateService: ecsPatterns.ApplicationLoadBalancedFargateService): void {
    // Allow database access from API service
    this.database.connections.allowFrom(
      fargateService.service,
      ec2.Port.tcp(5432),
      'Allow API service to access database'
    );

    // Allow Redis access from API service
    const redisPort = ec2.Port.tcp(6379);
    const cacheSG = ec2.SecurityGroup.fromSecurityGroupId(
      this,
      'CacheSecurityGroupRef',
      this.redis.vpcSecurityGroupIds![0]
    );
    
    cacheSG.addIngressRule(
      fargateService.service.connections.securityGroups[0],
      redisPort,
      'Allow API service to access Redis'
    );

    // Allow HTTP/HTTPS traffic to load balancer
    fargateService.loadBalancer.connections.allowFromAnyIpv4(
      ec2.Port.tcp(80),
      'Allow HTTP traffic'
    );
    
    fargateService.loadBalancer.connections.allowFromAnyIpv4(
      ec2.Port.tcp(443),
      'Allow HTTPS traffic'
    );
  }

  private configureTaskRolePermissions(fargateService: ecsPatterns.ApplicationLoadBalancedFargateService, environment: string): void {
    // Add Cognito permissions to the task role
    const cognitoPolicy = new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: [
        'cognito-idp:AdminCreateUser',
        'cognito-idp:AdminSetUserPassword',
        'cognito-idp:AdminInitiateAuth',
        'cognito-idp:AdminGetUser',
        'cognito-idp:AdminUpdateUserAttributes',
        'cognito-idp:AdminDeleteUser',
        'cognito-idp:AdminConfirmSignUp',
        'cognito-idp:AdminRespondToAuthChallenge',
        'cognito-idp:ListUsers',
      ],
      resources: [
        `arn:aws:cognito-idp:${this.region}:${this.account}:userpool/ap-southeast-1_bOA22s0Op`,
      ],
    });

    // Add S3 permissions for image storage
    const s3Policy = new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: [
        's3:GetObject',
        's3:PutObject',
        's3:DeleteObject',
        's3:ListBucket',
      ],
      resources: [
        `arn:aws:s3:::namecard-images-${environment}-${this.account}`,
        `arn:aws:s3:::namecard-images-${environment}-${this.account}/*`,
      ],
    });

    // Add Textract permissions for OCR processing
    const textractPolicy = new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: [
        'textract:DetectDocumentText',
        'textract:AnalyzeDocument',
      ],
      resources: ['*'], // Textract doesn't support resource-level permissions
    });

    // Add the policies to the task role
    fargateService.taskDefinition.taskRole.addToPrincipalPolicy(cognitoPolicy);
    fargateService.taskDefinition.taskRole.addToPrincipalPolicy(s3Policy);
    fargateService.taskDefinition.taskRole.addToPrincipalPolicy(textractPolicy);
  }

  private createFrontendInfrastructure(environment: string, domainName?: string): void {
    // S3 bucket for frontend static files
    const frontendBucket = new s3.Bucket(this, 'FrontendBucket', {
      bucketName: `namecard-frontend-${environment}-${this.account}`,
      publicReadAccess: false,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED,
      enforceSSL: true,
      
      // Website configuration
      websiteIndexDocument: 'index.html',
      websiteErrorDocument: 'index.html', // For SPA routing
      
      removalPolicy: environment === 'production' 
        ? cdk.RemovalPolicy.RETAIN 
        : cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: environment !== 'production',
    });

    // CloudFront Origin Access Control
    const oac = new cloudfront.S3OriginAccessControl(this, 'FrontendOAC', {
      description: `OAC for NameCard Frontend - ${environment}`,
    });

    // CloudFront distribution for frontend
    const distribution = new cloudfront.Distribution(this, 'FrontendDistribution', {
      comment: `NameCard Frontend CDN - ${environment}`,
      defaultBehavior: {
        origin: origins.S3BucketOrigin.withOriginAccessControl(frontendBucket, {
          originAccessControl: oac,
        }),
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        allowedMethods: cloudfront.AllowedMethods.ALLOW_GET_HEAD_OPTIONS,
        cachedMethods: cloudfront.CachedMethods.CACHE_GET_HEAD_OPTIONS,
        compress: true,
        cachePolicy: cloudfront.CachePolicy.CACHING_OPTIMIZED,
      },
      
      // API proxy behavior
      additionalBehaviors: {
        '/api/*': {
          origin: new origins.LoadBalancerV2Origin(this.apiService.loadBalancer, {
            protocolPolicy: cloudfront.OriginProtocolPolicy.HTTPS_ONLY,
          }),
          viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
          allowedMethods: cloudfront.AllowedMethods.ALLOW_ALL,
          cachedMethods: cloudfront.CachedMethods.CACHE_GET_HEAD_OPTIONS,
          cachePolicy: cloudfront.CachePolicy.CACHING_DISABLED,
          originRequestPolicy: cloudfront.OriginRequestPolicy.ALL_VIEWER,
        },
      },
      
      // Error pages for SPA
      errorResponses: [
        {
          httpStatus: 404,
          responseHttpStatus: 200,
          responsePagePath: '/index.html',
          ttl: cdk.Duration.minutes(5),
        },
        {
          httpStatus: 403,
          responseHttpStatus: 200,
          responsePagePath: '/index.html',
          ttl: cdk.Duration.minutes(5),
        },
      ],
      
      // Domain configuration (optional)
      domainNames: domainName ? [domainName] : undefined,
      
      priceClass: environment === 'production' 
        ? cloudfront.PriceClass.PRICE_CLASS_ALL
        : cloudfront.PriceClass.PRICE_CLASS_100,
    });
  }

  private setupMonitoring(environment: string): void {
    // API service monitoring is handled by ECS patterns
    // Database monitoring is built into RDS
    // Additional custom metrics and dashboards can be added here
    
    // Log groups are already created for VPC Flow Logs and API Service
    
    // TODO: Add CloudWatch dashboards
    // TODO: Add CloudWatch alarms
    // TODO: Add SNS topics for alerts
  }

  private createMigrationFunction(environment: string): lambda.Function {
    // Create Lambda execution role
    const migrationRole = new iam.Role(this, 'MigrationFunctionRole', {
      roleName: `namecard-migration-lambda-role-${environment}`,
      assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AWSLambdaVPCAccessExecutionRole'),
      ],
    });

    // Grant access to database secret
    this.secrets.grantRead(migrationRole);

    // Create Lambda function
    const migrationFunction = new lambda.Function(this, 'MigrationFunction', {
      functionName: `namecard-migration-${environment}`,
      runtime: lambda.Runtime.NODEJS_18_X,
      handler: 'index.handler',
      code: lambda.Code.fromAsset('lambda/migration'),
      timeout: cdk.Duration.minutes(10), // Migrations can take time
      memorySize: 512,
      role: migrationRole,
      
      // Deploy in VPC so it can access RDS
      vpc: this.vpc,
      vpcSubnets: {
        subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS,
      },
      securityGroups: [this.createMigrationSecurityGroup()],
      
      environment: {
        NODE_ENV: environment === 'production' ? 'production' : 'development',
        DB_SECRET_ID: this.secrets.secretName,
        LOG_LEVEL: environment === 'production' ? 'info' : 'debug',
      },
      
      description: `Database migration function for NameCard ${environment}`,
    });

    // Allow database access from migration function
    this.database.connections.allowFrom(
      migrationFunction,
      ec2.Port.tcp(5432),
      'Allow migration Lambda to access database'
    );

    return migrationFunction;
  }

  private createMigrationSecurityGroup(): ec2.SecurityGroup {
    const migrationSG = new ec2.SecurityGroup(this, 'MigrationSecurityGroup', {
      vpc: this.vpc,
      securityGroupName: `namecard-migration-sg-${this.node.tryGetContext('environment') || 'staging'}`,
      description: 'Security group for migration Lambda function',
      allowAllOutbound: true, // Needed for npm installs and AWS API calls
    });

    return migrationSG;
  }


  private generateRandomString(length: number): string {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let result = '';
    for (let i = 0; i < length; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
  }

  private createOutputs(environment: string, props: ProductionStackProps): void {
    // VPC outputs
    new cdk.CfnOutput(this, 'VpcId', {
      value: this.vpc.vpcId,
      description: 'VPC ID',
      exportName: `${this.stackName}-VpcId`,
    });

    // Database outputs
    new cdk.CfnOutput(this, 'DatabaseEndpoint', {
      value: this.database.instanceEndpoint.hostname,
      description: 'Database endpoint',
      exportName: `${this.stackName}-DatabaseEndpoint`,
    });

    new cdk.CfnOutput(this, 'DatabasePort', {
      value: this.database.instanceEndpoint.port.toString(),
      description: 'Database port',
      exportName: `${this.stackName}-DatabasePort`,
    });

    // API service outputs
    new cdk.CfnOutput(this, 'APIServiceUrl', {
      value: `https://${this.apiService.loadBalancer.loadBalancerDnsName}`,
      description: 'API service URL',
      exportName: `${this.stackName}-APIServiceUrl`,
    });

    // Redis outputs
    new cdk.CfnOutput(this, 'RedisEndpoint', {
      value: this.redis.attrRedisEndpointAddress,
      description: 'Redis endpoint',
      exportName: `${this.stackName}-RedisEndpoint`,
    });

    // Secrets outputs
    new cdk.CfnOutput(this, 'DatabaseSecretArn', {
      value: this.secrets.secretArn,
      description: 'Database secret ARN',
      exportName: `${this.stackName}-DatabaseSecretArn`,
    });

    // Migration function outputs
    new cdk.CfnOutput(this, 'MigrationFunctionName', {
      value: this.migrationFunction.functionName,
      description: 'Migration Lambda function name',
      exportName: `${this.stackName}-MigrationFunctionName`,
    });

    new cdk.CfnOutput(this, 'MigrationFunctionArn', {
      value: this.migrationFunction.functionArn,
      description: 'Migration Lambda function ARN',
      exportName: `${this.stackName}-MigrationFunctionArn`,
    });

    // Summary output
    new cdk.CfnOutput(this, 'DeploymentSummary', {
      value: JSON.stringify({
        environment,
        vpcId: this.vpc.vpcId,
        databaseEndpoint: this.database.instanceEndpoint.hostname,
        apiUrl: `https://${this.apiService.loadBalancer.loadBalancerDnsName}`,
        region: this.region,
      }),
      description: 'Production deployment summary',
    });
  }
}