import * as cdk from "aws-cdk-lib";
import * as ecs from "aws-cdk-lib/aws-ecs";
import * as elbv2 from "aws-cdk-lib/aws-elasticloadbalancingv2";
import * as iam from "aws-cdk-lib/aws-iam";
import * as logs from "aws-cdk-lib/aws-logs";
import { Construct } from "constructs";
import { Constants } from "../../config/constants";
import { InfrastructureStack } from "./infrastructure_stack";
import { LLMStack } from "./llm_stack";

export interface ServiceStackProps extends cdk.StackProps {
  infrastructureStack: InfrastructureStack;
  llmStack: LLMStack;
}

export class ServiceStack extends cdk.Stack {
  public readonly fargateService: ecs.FargateService;

  constructor(scope: Construct, id: string, props: ServiceStackProps) {
    super(scope, id, props);

    // Create ECS Cluster
    const cluster = new ecs.Cluster(this, "SiteChatCluster", {
      vpc: props.infrastructureStack.vpc,
      enableFargateCapacityProviders: true,
    });

    // Create Log Group
    const logGroup = new logs.LogGroup(this, "SiteChatLogGroup", {
      retention: logs.RetentionDays.ONE_WEEK, // Minimize costs
      removalPolicy: cdk.RemovalPolicy.DESTROY, // Clean up logs when stack is destroyed
    });

    // Create Fargate Task Definition
    const taskDefinition = new ecs.FargateTaskDefinition(
      this,
      "SiteChatTaskDef",
      {
        memoryLimitMiB: 512, // Minimum memory for Fargate
        cpu: 256, // 0.25 vCPU
      }
    );

    // Add Secrets Manager permissions to task role
    taskDefinition.taskRole.addToPrincipalPolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: [
          "secretsmanager:GetSecretValue",
          "secretsmanager:ListSecrets",
          "secretsmanager:BatchGetSecretValue",
          "secretsmanager:DescribeSecret",
        ],
        resources: [
          `arn:aws:secretsmanager:${this.region}:${this.account}:secret:SiteChat-*`,
        ],
      })
    );

    // Add container to task definition
    const container = taskDefinition.addContainer("SiteChatContainer", {
      image: ecs.ContainerImage.fromAsset("../SiteChatContainer"),
      logging: ecs.LogDrivers.awsLogs({
        streamPrefix: Constants.LOG_PREFIX,
        logGroup: logGroup,
      }),
      environment: {
        OPENSEARCH_ENDPOINT: props.llmStack.openSearchDomain.domainEndpoint,
        STREAMLIT_PORT: Constants.STREAMLIT_PORT.toString(),
      },
      portMappings: [{ containerPort: Constants.STREAMLIT_PORT }],
    });

    // Create Fargate Service
    this.fargateService = new ecs.FargateService(this, "SiteChatService", {
      cluster,
      taskDefinition,
      desiredCount: 1, // Start with 1 instance to minimize costs
      assignPublicIp: true, // Required for public subnet
      securityGroups: [props.infrastructureStack.webSecurityGroup],
      capacityProviderStrategies: [
        {
          capacityProvider: "FARGATE_SPOT", // Use Spot to reduce costs
          weight: 1,
        },
      ],
    });

    // Add Auto Scaling
    const scaling = this.fargateService.autoScaleTaskCount({
      minCapacity: 1,
      maxCapacity: 4,
    });

    // Add CPU utilization scaling policy
    scaling.scaleOnCpuUtilization("CpuScaling", {
      targetUtilizationPercent: 70,
      scaleInCooldown: cdk.Duration.seconds(Constants.SCALE_COOLDOWN),
      scaleOutCooldown: cdk.Duration.seconds(Constants.SCALE_COOLDOWN),
    });

    // Add memory utilization scaling policy
    scaling.scaleOnMemoryUtilization("MemoryScaling", {
      targetUtilizationPercent: 70,
      scaleInCooldown: cdk.Duration.seconds(Constants.SCALE_COOLDOWN),
      scaleOutCooldown: cdk.Duration.seconds(Constants.SCALE_COOLDOWN),
    });

    // Create HTTPS listener with target group
    const listener = props.infrastructureStack.alb.addListener(
      "SiteChatListener",
      {
        port: 443,
        protocol: elbv2.ApplicationProtocol.HTTPS,
        certificates: [props.infrastructureStack.certificate],
        defaultAction: elbv2.ListenerAction.forward([
          new elbv2.ApplicationTargetGroup(this, "SiteChatTargetGroup", {
            vpc: props.infrastructureStack.vpc,
            port: Constants.STREAMLIT_PORT,
            protocol: elbv2.ApplicationProtocol.HTTP,
            targets: [this.fargateService],
            healthCheck: {
              path: Constants.HEALTH_CHECK_PATH,
              interval: cdk.Duration.seconds(Constants.HEALTH_CHECK_INTERVAL),
              timeout: cdk.Duration.seconds(Constants.HEALTH_CHECK_TIMEOUT),
            },
          }),
        ]),
      }
    );
  }
}
