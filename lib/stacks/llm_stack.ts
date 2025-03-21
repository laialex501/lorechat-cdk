import * as cdk from "aws-cdk-lib";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as iam from "aws-cdk-lib/aws-iam";
import * as opensearch from "aws-cdk-lib/aws-opensearchservice";
import { Construct } from "constructs";
import { InfrastructureStack } from "./infrastructure_stack";

export interface LLMStackProps extends cdk.StackProps {
  infrastructureStack: InfrastructureStack;
}

export class LLMStack extends cdk.Stack {
  public readonly openSearchDomain: opensearch.Domain;

  constructor(scope: Construct, id: string, props: LLMStackProps) {
    super(scope, id, props);

    // Create OpenSearch domain with minimal configuration for development
    this.openSearchDomain = new opensearch.Domain(this, "SiteChatOpenSearch", {
      version: opensearch.EngineVersion.OPENSEARCH_2_9,
      vpc: props.infrastructureStack.vpc,
      vpcSubnets: [{ subnetType: ec2.SubnetType.PUBLIC }],
      capacity: {
        dataNodes: 1,
        dataNodeInstanceType: "t3.small.search",
        masterNodes: 0, // Explicitly disable dedicated master nodes
        multiAzWithStandbyEnabled: false,
      },
      ebs: {
        volumeSize: 10,
        volumeType: ec2.EbsDeviceVolumeType.GP3,
      },
      encryptionAtRest: {
        enabled: true,
      },
      nodeToNodeEncryption: true,
      enforceHttps: true,
      zoneAwareness: {
        enabled: false, // Single AZ deployment
        availabilityZoneCount: 2,
      },
      logging: {
        slowSearchLogEnabled: true,
        appLogEnabled: true,
        slowIndexLogEnabled: true,
      },
    });

    // Allow access from the web security group
    this.openSearchDomain.connections.allowFrom(
      props.infrastructureStack.webSecurityGroup,
      ec2.Port.tcp(443)
    );

    // Create IAM role for Bedrock access
    const bedrockRole = new iam.Role(this, "BedrockAccessRole", {
      assumedBy: new iam.ServicePrincipal("ecs-tasks.amazonaws.com"),
      description: "Role for accessing AWS Bedrock",
    });

    bedrockRole.addToPolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: [
          "bedrock:InvokeModel",
          "bedrock:InvokeModelWithResponseStream",
          "bedrock:ListFoundationModels",
        ],
        resources: ["*"], // You might want to restrict this to specific model ARNs
      })
    );

    // Output the OpenSearch domain endpoint
    new cdk.CfnOutput(this, "OpenSearchDomainEndpoint", {
      value: this.openSearchDomain.domainEndpoint,
      description: "OpenSearch domain endpoint",
    });
  }
}
