import * as apigateway from "@aws-cdk/aws-apigateway";
import * as acm from "@aws-cdk/aws-certificatemanager";
import * as eventbridge from "@aws-cdk/aws-events";
import { Effect, PolicyStatement } from "@aws-cdk/aws-iam";
import * as lambda from "@aws-cdk/aws-lambda";
import * as lambdaNodeJs from "@aws-cdk/aws-lambda-nodejs";
import * as sns from "@aws-cdk/aws-sns";
import * as cdk from "@aws-cdk/core";
import * as path from "path";

export class WebpageMonitorStack extends cdk.Stack {
  constructor(
    scope: cdk.Construct,
    id: string,
    props: cdk.StackProps & { certificate: acm.Certificate; domainName: string }
  ) {
    super(scope, id, props);

    const emailOnWebpageChangedTopic = new sns.Topic(
      this,
      "WebpageChangedTopic",
      {
        displayName: "Email On Changed Webpage Topic",
      }
    );

    const monitor = new lambdaNodeJs.NodejsFunction(this, "Monitor", {
      handler: "handler",
      entry: path.join(__dirname, "../lambdas/monitor.ts"),
      runtime: lambda.Runtime.NODEJS_14_X,
      bundling: {
        minify: true,
      },
      environment: {
        EMAIL_ON_WEBPAGE_CHANGED_TOPIC: emailOnWebpageChangedTopic.topicArn,
      },
    });

    emailOnWebpageChangedTopic.grantPublish(monitor);

    const scheduler = new lambdaNodeJs.NodejsFunction(this, "Scheduler", {
      handler: "handler",
      entry: path.join(__dirname, "../lambdas/scheduler.ts"),
      runtime: lambda.Runtime.NODEJS_14_X,
      timeout: cdk.Duration.seconds(5),
      bundling: {
        minify: true,
        externalModules: ["aws-sdk"],
      },
      environment: {
        DOWNSTREAM_LAMBDA_ARN: monitor.functionArn,
        DOWNSTREAM_LAMBDA_NAME: monitor.functionName,
        SNS_TOPIC_ARN: emailOnWebpageChangedTopic.topicArn,
      },
    });

    const bus = eventbridge.EventBus.fromEventBusArn(
      this,
      "bus",
      // TODO extract env vars / parameters for Region and Account ID
      `arn:aws:events:${props.env?.region}:${props.env?.account}:event-bus/default`
    );
    const anyEventBridgeRuleInAccountRegion = `arn:aws:events:${props.env?.region}:${props.env?.account}:rule/*`;
    scheduler.addToRolePolicy(
      new PolicyStatement({
        effect: Effect.ALLOW,
        actions: ["events:PutRule", "events:PutTargets"],
        // "events:DescribeRule",
        // "events:DeleteRule",
        resources: [anyEventBridgeRuleInAccountRegion],
      })
    );
    // scheduler adds permissions to publish to
    scheduler.addToRolePolicy(
      new PolicyStatement({
        effect: Effect.ALLOW,
        actions: ["lambda:AddPermission"],
        resources: [monitor.functionArn],
      })
    );
    scheduler.addToRolePolicy(
      new PolicyStatement({
        effect: Effect.ALLOW,
        actions: ["sns:Subscribe"],
        resources: [emailOnWebpageChangedTopic.topicArn],
        // conditions: { // TODO check whether possible to use this
        //   StringEquals: {
        //     "sns:Protocol": "email",
        //   },
        // },
      })
    );

    const api = new apigateway.LambdaRestApi(this, "myapi", {
      handler: scheduler,
      proxy: false,
      defaultCorsPreflightOptions: {
        allowOrigins: apigateway.Cors.ALL_ORIGINS, // TODO set to your domain
        allowMethods: ["POST"], // this is also the default
      },
      domainName: {
        certificate: props.certificate,
        domainName: props.domainName,
      },
    });
    api.root.addMethod("POST");
  }
}
