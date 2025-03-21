import * as cdk from "aws-cdk-lib";
import { IConstruct } from "constructs";

export interface ResourceTags {
  Project: string;
  Environment: string;
  Stack: string;
  Component: string;
  Service: string;
  CostCenter: string;
  AutoScaling?: string;
  DataClassification?: string;
}

export class TagManager {
  static getCoreTags(stack: cdk.Stack, component: string): ResourceTags {
    return {
      Project: "LoreChat",
      Environment: process.env.CDK_ENV || "dev",
      Stack: stack.stackName,
      Component: component,
      CostCenter: "LoreChat-Project",
      Service: "", // To be filled by specific resource
    };
  }

  static addTags(
    resource: IConstruct,
    stack: cdk.Stack,
    service: string,
    extraTags?: Partial<ResourceTags>
  ) {
    const baseTags = this.getCoreTags(stack, stack.constructor.name);
    const tags = {
      ...baseTags,
      Service: service,
      ...extraTags,
    };

    Object.entries(tags).forEach(([key, value]) => {
      if (value) {
        if ("addPropertyOverride" in resource) {
          // For L1 constructs
          const existingTags = (resource as any).tags || [];
          const newTags = [
            ...existingTags,
            { Key: key, Value: value.toString() },
          ];
          (resource as any).addPropertyOverride("Tags", newTags);
        } else {
          // For L2 constructs and other resources
          cdk.Tags.of(resource).add(key, value.toString());
        }
      }
    });
  }
}
