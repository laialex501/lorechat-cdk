import * as cdk from "aws-cdk-lib";
import * as budgets from "aws-cdk-lib/aws-budgets";
import * as cloudwatch from "aws-cdk-lib/aws-cloudwatch";
import { Construct } from "constructs";
import { Constants } from "../../config/constants";
import { InfrastructureStack } from "./infrastructure_stack";
import { ServiceStack } from "./service_stack";

export interface MonitoringStackProps extends cdk.StackProps {
  infrastructureStack: InfrastructureStack;
  serviceStack: ServiceStack;
}

export class MonitoringStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: MonitoringStackProps) {
    super(scope, id, props);

    // Create a CloudWatch dashboard
    const dashboard = new cloudwatch.Dashboard(this, "LoreChatDashboard", {
      dashboardName: "LoreChat-Dashboard",
    });

    // Add widgets to the dashboard
    dashboard.addWidgets(
      new cloudwatch.GraphWidget({
        title: "ECS CPU Utilization",
        left: [props.serviceStack.fargateService.metricCpuUtilization()],
      }),
      new cloudwatch.GraphWidget({
        title: "ECS Memory Utilization",
        left: [props.serviceStack.fargateService.metricMemoryUtilization()],
      }),
      new cloudwatch.GraphWidget({
        title: "ALB Request Count",
        left: [props.infrastructureStack.alb.metrics.requestCount()],
      })
    );

    // Create a budget
    const budget = new budgets.CfnBudget(this, "MonthlyBudget", {
      budget: {
        budgetType: "COST",
        timeUnit: "MONTHLY",
        budgetLimit: {
          amount: 100,
          unit: "USD",
        },
      },
      notificationsWithSubscribers: [
        {
          notification: {
            comparisonOperator: "GREATER_THAN",
            threshold: 80,
            thresholdType: "PERCENTAGE",
            notificationType: "ACTUAL",
          },
          subscribers: [
            {
              subscriptionType: "EMAIL",
              address: Constants.ALERT_EMAIL,
            },
          ],
        },
      ],
    });

    // Enable VPC Flow Logs
    props.infrastructureStack.vpc.addFlowLog("FlowLog");

    // Add CloudWatch Alarms
    const cpuAlarm = new cloudwatch.Alarm(this, "HighCPUAlarm", {
      metric: props.serviceStack.fargateService.metricCpuUtilization(),
      threshold: 80,
      evaluationPeriods: 3,
      datapointsToAlarm: 2,
    });

    const memoryAlarm = new cloudwatch.Alarm(this, "HighMemoryAlarm", {
      metric: props.serviceStack.fargateService.metricMemoryUtilization(),
      threshold: 80,
      evaluationPeriods: 3,
      datapointsToAlarm: 2,
    });
  }
}
