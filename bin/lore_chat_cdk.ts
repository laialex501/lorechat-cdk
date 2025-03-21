#!/usr/bin/env node
import * as cdk from "aws-cdk-lib";
import { DataStack } from "../lib/stacks/data_stack";
import { InfrastructureStack } from "../lib/stacks/infrastructure_stack";
import { MonitoringStack } from "../lib/stacks/monitoring_stack";
import { ServiceStack } from "../lib/stacks/service_stack";

const app = new cdk.App();

const env = {
  account: process.env.CDK_DEFAULT_ACCOUNT,
  region: process.env.CDK_DEFAULT_REGION,
};

const infrastructureStack = new InfrastructureStack(
  app,
  "LoreChatInfrastructureStack",
  { env }
);

const dataStack = new DataStack(app, "LoreChatDataStack", {
  infrastructureStack: infrastructureStack,
  env,
});

const serviceStack = new ServiceStack(app, "LoreChatServiceStack", {
  infrastructureStack: infrastructureStack,
  env,
});

const monitoringStack = new MonitoringStack(app, "LoreChatMonitoringStack", {
  infrastructureStack: infrastructureStack,
  serviceStack: serviceStack,
  env,
});

// Add tags to all stacks
const stackList = [
  infrastructureStack,
  dataStack,
  serviceStack,
  monitoringStack,
];
stackList.forEach((stack) => {
  cdk.Tags.of(stack).add("Project", "LoreChat");
  cdk.Tags.of(stack).add("Environment", process.env.CDK_ENV || "dev");
  cdk.Tags.of(stack).add("ManagedBy", "CDK");
});
