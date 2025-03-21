#!/usr/bin/env node
import * as cdk from "aws-cdk-lib";
import { InfrastructureStack } from "../lib/stacks/infrastructure_stack";
import { LLMStack } from "../lib/stacks/llm_stack";
import { MonitoringStack } from "../lib/stacks/monitoring_stack";
import { ServiceStack } from "../lib/stacks/service_stack";

const app = new cdk.App();

const infrastructureStack = new InfrastructureStack(
  app,
  "SiteChatInfrastructureStack",
  {
    env: {
      account: process.env.CDK_DEFAULT_ACCOUNT,
      region: process.env.CDK_DEFAULT_REGION,
    },
  }
);

const llmStack = new LLMStack(app, "SiteChatLLMStack", {
  infrastructureStack: infrastructureStack,
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION,
  },
});

const serviceStack = new ServiceStack(app, "SiteChatServiceStack", {
  infrastructureStack: infrastructureStack,
  llmStack: llmStack,
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION,
  },
});

new MonitoringStack(app, "SiteChatMonitoringStack", {
  infrastructureStack: infrastructureStack,
  llmStack: llmStack,
  serviceStack: serviceStack,
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION,
  },
});
