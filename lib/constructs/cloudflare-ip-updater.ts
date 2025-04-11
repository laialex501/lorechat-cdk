import * as cdk from "aws-cdk-lib";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as events from "aws-cdk-lib/aws-events";
import * as targets from "aws-cdk-lib/aws-events-targets";
import * as iam from "aws-cdk-lib/aws-iam";
import * as lambda from "aws-cdk-lib/aws-lambda";
import { Construct } from "constructs";
import * as path from "path";

export interface CloudflareIpUpdaterProps {
  /**
   * The security group to update with Cloudflare IP ranges
   */
  securityGroup: ec2.ISecurityGroup;

  /**
   * The schedule for updating IP ranges (default: weekly)
   */
  schedule?: events.Schedule;

  /**
   * The ports to allow from Cloudflare IPs
   */
  ports?: number[];
}

export class CloudflareIpUpdater extends Construct {
  constructor(scope: Construct, id: string, props: CloudflareIpUpdaterProps) {
    super(scope, id);

    // Default values
    const schedule =
      props.schedule || events.Schedule.rate(cdk.Duration.days(7));
    const ports = props.ports || [80, 443];

    // Create Lambda function
    const updaterFunction = new lambda.Function(
      this,
      "CloudflareIpUpdaterFunction",
      {
        runtime: lambda.Runtime.NODEJS_18_X,
        handler: "index.handler",
        code: lambda.Code.fromAsset(
          path.join(__dirname, "../../lambda/cloudflare_ip_updater")
        ),
        timeout: cdk.Duration.minutes(5),
        description:
          "Updates security group rules with latest Cloudflare IP ranges",
        environment: {
          SECURITY_GROUP_ID: props.securityGroup.securityGroupId,
          PORTS: ports.join(","),
        },
      }
    );

    // Grant permissions to modify security group
    updaterFunction.addToRolePolicy(
      new iam.PolicyStatement({
        actions: [
          "ec2:DescribeSecurityGroups",
          "ec2:RevokeSecurityGroupIngress",
          "ec2:AuthorizeSecurityGroupIngress",
        ],
        resources: ["*"], // Scope down if possible in production
      })
    );

    // Create EventBridge rule to trigger Lambda on schedule
    new events.Rule(this, "ScheduleRule", {
      schedule,
      targets: [new targets.LambdaFunction(updaterFunction)],
      description: "Triggers Cloudflare IP range update on schedule",
    });
  }
}
