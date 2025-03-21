import * as cdk from "aws-cdk-lib";
import * as iam from "aws-cdk-lib/aws-iam";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as s3 from "aws-cdk-lib/aws-s3";
import * as s3n from "aws-cdk-lib/aws-s3-notifications";
import { Construct, IConstruct } from "constructs";
import { Constants } from "../../config/constants";
import { ResourceTags, TagManager } from "../utils/tag-manager";
import { InfrastructureStack } from "./infrastructure_stack";

export interface DataStackProps extends cdk.StackProps {
  infrastructureStack: InfrastructureStack;
}

export class DataStack extends cdk.Stack {
  public readonly processedDataBucket: s3.Bucket;
  public readonly sourceDataBucket: s3.Bucket;

  constructor(scope: Construct, id: string, props: DataStackProps) {
    super(scope, id, props);

    const addTags = (
      resource: IConstruct,
      service: string,
      extraTags?: Partial<ResourceTags>
    ) => {
      TagManager.addTags(resource, this, service, extraTags);
    };

    // Create bucket for source data
    this.sourceDataBucket = new s3.Bucket(this, "SourceDataBucket", {
      encryption: s3.BucketEncryption.S3_MANAGED,
      enforceSSL: true,
      versioned: true,
    });
    addTags(this.sourceDataBucket, "S3", {
      DataClassification: "External",
    });

    // Create bucket for processed data
    this.processedDataBucket = new s3.Bucket(this, "ProcessedDataBucket", {
      encryption: s3.BucketEncryption.S3_MANAGED,
      enforceSSL: true,
      versioned: true,
      lifecycleRules: [
        {
          enabled: true,
          expiration: cdk.Duration.days(30), // Adjust retention period as needed
        },
      ],
    });
    addTags(this.processedDataBucket, "S3", {
      DataClassification: "Internal",
    });

    // Create Lambda for data processing
    const processingLambda = new lambda.Function(this, "DataProcessingLambda", {
      runtime: lambda.Runtime.PYTHON_3_12,
      handler: "index.lambda_handler",
      code: lambda.Code.fromAsset("lambda/data_processing", {
        bundling: {
          image: lambda.Runtime.PYTHON_3_12.bundlingImage,
          command: [
            "bash",
            "-c",
            "pip install -r requirements.txt -t /asset-output && cp index.py /asset-output/",
          ],
        },
      }),
      timeout: cdk.Duration.minutes(5),
      memorySize: 1024,
      environment: {
        PROCESSED_BUCKET_NAME: this.processedDataBucket.bucketName,
        LOG_LEVEL: "INFO",
      },
      tracing: lambda.Tracing.ACTIVE,
    });
    addTags(processingLambda, "Lambda", {
      DataClassification: "Internal",
    });

    // Create Lambda for vectorization
    const vectorizationLambda = new lambda.Function(
      this,
      "VectorizationLambda",
      {
        runtime: lambda.Runtime.PYTHON_3_12,
        handler: "index.lambda_handler",
        code: lambda.Code.fromAsset("lambda/vectorization_lambda", {
          bundling: {
            image: lambda.Runtime.PYTHON_3_12.bundlingImage,
            command: [
              "bash",
              "-c",
              "pip install -r requirements.txt -t /asset-output && cp index.py /asset-output/",
            ],
          },
        }),
        timeout: cdk.Duration.minutes(5),
        memorySize: 1024,
        environment: {
          UPSTASH_ENDPOINT_SECRET_NAME:
            props.infrastructureStack.upstashEndpointSecret.secretName,
          UPSTASH_TOKEN_SECRET_NAME:
            props.infrastructureStack.upstashTokenSecret.secretName,
          BEDROCK_EMBEDDING_MODEL: Constants.EMBEDDING_MODEL_ID,
          EMBEDDING_DIMENSIONS: Constants.EMBEDDING_DIMENSIONS.toString(),
          LOG_LEVEL: "INFO",
        },
        tracing: lambda.Tracing.ACTIVE,
      }
    );
    addTags(vectorizationLambda, "Lambda", {
      DataClassification: "Internal",
    });

    // Grant Lambda permissions
    this.sourceDataBucket.grantRead(processingLambda);
    this.processedDataBucket.grantReadWrite(processingLambda);
    this.processedDataBucket.grantRead(vectorizationLambda);
    props.infrastructureStack.upstashEndpointSecret.grantRead(
      vectorizationLambda
    );
    props.infrastructureStack.upstashTokenSecret.grantRead(vectorizationLambda);

    // Allow vectorization Lambda to use Bedrock for embeddings
    vectorizationLambda.addToRolePolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: [
          "bedrock:InvokeModel",
          "bedrock:InvokeModelWithResponseStream",
        ],
        resources: ["*"], // Consider restricting to specific model ARNs
      })
    );

    // Set up S3 event notification to trigger processing Lambda
    this.sourceDataBucket.addEventNotification(
      s3.EventType.OBJECT_CREATED,
      new s3n.LambdaDestination(processingLambda)
    );

    // Set up event notification from processed data to vectorization Lambda
    this.processedDataBucket.addEventNotification(
      s3.EventType.OBJECT_CREATED,
      new s3n.LambdaDestination(vectorizationLambda),
      { prefix: "processed/" } // Only trigger on processed files
    );

    // Outputs
    new cdk.CfnOutput(this, "SourceDataBucketName", {
      value: this.sourceDataBucket.bucketName,
      description: "Name of the bucket for source data uploads",
    });

    new cdk.CfnOutput(this, "ProcessedDataBucketName", {
      value: this.processedDataBucket.bucketName,
      description: "Name of the bucket containing processed data",
    });

    new cdk.CfnOutput(this, "DataProcessingLambdaName", {
      value: processingLambda.functionName,
      description: "Name of the data processing Lambda function",
    });

    new cdk.CfnOutput(this, "VectorizationLambdaName", {
      value: vectorizationLambda.functionName,
      description: "Name of the vectorization Lambda function",
    });
  }
}
