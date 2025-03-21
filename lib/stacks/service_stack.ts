import * as cdk from "aws-cdk-lib";
import { Platform } from "aws-cdk-lib/aws-ecr-assets";
import * as ecs from "aws-cdk-lib/aws-ecs";
import * as iam from "aws-cdk-lib/aws-iam";
import * as logs from "aws-cdk-lib/aws-logs";
import { Construct, IConstruct } from "constructs";
import { Constants } from "../../config/constants";
import { ResourceTags, TagManager } from "../utils/tag-manager";
import { InfrastructureStack } from "./infrastructure_stack";

export interface ServiceStackProps extends cdk.StackProps {
  infrastructureStack: InfrastructureStack;
}

export class ServiceStack extends cdk.Stack {
  public readonly fargateService: ecs.FargateService;
  constructor(scope: Construct, id: string, props: ServiceStackProps) {
    super(scope, id, props);

    const addTags = (
      resource: IConstruct,
      service: string,
      extraTags?: Partial<ResourceTags>
    ) => {
      TagManager.addTags(resource, this, service, extraTags);
    };

    // Create ECS Cluster
    const cluster = new ecs.Cluster(this, "LoreChatCluster", {
      vpc: props.infrastructureStack.vpc,
      enableFargateCapacityProviders: true,
    });
    cluster.applyRemovalPolicy(cdk.RemovalPolicy.DESTROY); // Ensure proper cleanup
    addTags(cluster, "ECS");

    // Create Log Group
    const logGroup = new logs.LogGroup(this, "LoreChatLogGroup", {
      retention: logs.RetentionDays.ONE_WEEK, // Minimize costs
      removalPolicy: cdk.RemovalPolicy.DESTROY, // Clean up logs when stack is destroyed
    });
    addTags(logGroup, "CloudWatch", { DataClassification: "Internal" });

    // Create Fargate Task Definition
    const taskDefinition = new ecs.FargateTaskDefinition(
      this,
      "LoreChatTaskDef",
      {
        memoryLimitMiB: 1024, // Minimum memory for Fargate
        cpu: 512, // 0.5 vCPU
      }
    );
    addTags(taskDefinition, "ECS", { AutoScaling: "true" });

    // Add Secrets Manager and Bedrock permissions to task role
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
          `arn:aws:secretsmanager:${this.region}:${this.account}:secret:LoreChat-*`,
        ],
      })
    );

    // Add Bedrock permissions for embeddings and LLM
    taskDefinition.taskRole.addToPrincipalPolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: [
          "bedrock:InvokeModel",
          "bedrock:InvokeModelWithResponseStream",
          "bedrock:ListFoundationModels",
        ],
        resources: ["*"], // Consider restricting to specific model ARNs in production
      })
    );

    // Add container to task definition
    const image = ecs.ContainerImage.fromAsset("../LoreChatContainer", {
      file: "docker/prod/Dockerfile",
      platform: Platform.LINUX_AMD64,
      buildArgs: {
        USE_FINCH: process.env.USE_FINCH || "false",
      },
      extraHash: process.env.USE_FINCH === "true" ? "finch" : "docker", // Force rebuild when switching between Docker and Finch
    });
    const container = taskDefinition.addContainer("LoreChatContainer", {
      image: image,
      logging: ecs.LogDrivers.awsLogs({
        streamPrefix: Constants.LOG_PREFIX,
        logGroup: logGroup,
      }),
      healthCheck: {
        command: [
          "CMD-SHELL",
          `curl -f http://localhost:${Constants.STREAMLIT_PORT}${Constants.HEALTH_CHECK_PATH} || exit 1`,
        ],
        interval: cdk.Duration.seconds(30),
        timeout: cdk.Duration.seconds(5),
        retries: 3,
        startPeriod: cdk.Duration.seconds(60),
      },
      environment: {
        STREAMLIT_PORT: Constants.STREAMLIT_PORT.toString(),
        UPSTASH_ENDPOINT_SECRET_NAME:
          props.infrastructureStack.upstashEndpointSecret.secretName,
        UPSTASH_TOKEN_SECRET_NAME:
          props.infrastructureStack.upstashTokenSecret.secretName,
        OPENAI_API_SECRET_NAME:
          props.infrastructureStack.openaiAPISecret.secretName,
        TAVILY_API_SECRET_NAME:
          props.infrastructureStack.tavilyAPISecret.secretName,
        BEDROCK_EMBEDDING_MODEL_ID: Constants.EMBEDDING_MODEL_ID,
        EMBEDDING_DIMENSIONS: Constants.EMBEDDING_DIMENSIONS.toString(),
      },
      portMappings: [{ containerPort: Constants.STREAMLIT_PORT }],
      command: ["streamlit", "run", "main.py"],
    });

    // Create Fargate Service
    this.fargateService = new ecs.FargateService(this, "LoreChatService", {
      cluster,
      taskDefinition,
      desiredCount: 1, // Start with 1 instance to minimize costs
      minHealthyPercent: 50, // Minimize costs
      maxHealthyPercent: 200, // Minimize costs
      assignPublicIp: true, // Required for public subnet
      securityGroups: [props.infrastructureStack.webSecurityGroup],
      capacityProviderStrategies: [
        {
          capacityProvider: "FARGATE_SPOT", // Use Spot to reduce costs
          weight: 1,
          base: 0, // Minimum of 0 tasks
        },
      ],
    });
    addTags(this.fargateService, "ECS", { AutoScaling: "true" });

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

    // Add the Fargate service to the target group
    props.infrastructureStack.chatTargetGroup.addTarget(this.fargateService);
  }
}
