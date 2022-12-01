import type {
  APIGatewayProxyEventV2,
  APIGatewayProxyResultV2,
  Handler,
} from "aws-lambda";
import { EventBridge, Lambda, SNS } from "aws-sdk";
import { URL } from "url";
import { v4 } from "uuid";
import type { MonitorInput } from "./monitor";

const eventBridge = new EventBridge();
const lambda = new Lambda();
const sns = new SNS();

export const handler: Handler<APIGatewayProxyEventV2, APIGatewayProxyResultV2> =
  async ({ body }) => {
    try {
      // START VALIDATION
      if (!body) {
        throw new Error("No body");
      }
      const payload: Partial<{
        email: string;
        url: string;
        watchPhrase: string;
        intervalValue: number;
        intervalUnit: "minute" | "minutes" | "hour" | "hours" | "day" | "days";
      }> = JSON.parse(body);
      // TODO validate email, url, watchPhrase, intervalValue, intervalUnit
      if (
        !payload.email ||
        !payload.url ||
        !payload.watchPhrase ||
        !payload.intervalValue ||
        !payload.intervalUnit ||
        !["minute", "minutes", "hour", "hours", "day", "days"].includes(
          payload.intervalUnit
        )
      ) {
        throw new Error("invalid body");
      }
      if (
        ["minute", "hour", "day"].includes(payload.intervalUnit) &&
        payload.intervalValue !== 1
      ) {
        throw new Error(
          "intervalUnit must match multiplicity (singular/plural) of intervalValue"
        );
      }

      const env = {
        DOWNSTREAM_LAMBDA_ARN: process.env.DOWNSTREAM_LAMBDA_ARN,
        DOWNSTREAM_LAMBDA_NAME: process.env.DOWNSTREAM_LAMBDA_NAME,
        SNS_TOPIC_ARN: process.env.SNS_TOPIC_ARN,
      };
      if (
        !env.DOWNSTREAM_LAMBDA_ARN ||
        !env.DOWNSTREAM_LAMBDA_NAME ||
        !env.SNS_TOPIC_ARN
      )
        throw new Error("Missing Env var");
      // END VALIDATION

      const ruleName = `webpage-monitor-rule-${v4()}`;
      const runOnScheduleRule = await addScheduleRule(ruleName, payload);

      const downstreamLambdaBody = {
        email: payload.email,
        url: payload.url,
        watchPhrase: payload.watchPhrase,
      };
      const target = await addRuleTarget(
        ruleName,
        env.DOWNSTREAM_LAMBDA_ARN,
        downstreamLambdaBody
      );

      const downstreamLambdaCanBeInvokedByEventBridgeRule = {
        Action: "lambda:InvokeFunction",
        FunctionName: env.DOWNSTREAM_LAMBDA_NAME,
        Principal: "events.amazonaws.com",
        StatementId: ruleName,
        SourceArn: runOnScheduleRule.RuleArn,
      };
      await lambda
        .addPermission(downstreamLambdaCanBeInvokedByEventBridgeRule)
        .promise();

      const subscription = await sns
        .subscribe({
          Protocol: "email",
          TopicArn: env.SNS_TOPIC_ARN,
          Endpoint: payload.email,
          Attributes: {
            // only subscribe to events that include this email is attributes
            FilterPolicy: JSON.stringify({ email: [payload.email] }),
          },
        })
        .promise();

      console.log("subscription", subscription);
      console.log("rule", runOnScheduleRule);
      console.log("target", target);
      return {
        body: "success",
        statusCode: 201,
      };
    } catch (error) {
      console.log(error);
      return {
        body:
          typeof error.message === "string"
            ? error.message
            : JSON.stringify(error.message),
        statusCode: 500,
      };
    }
  };

async function addRuleTarget(
  ruleName: string,
  downstreamLambdaArn: string,
  downstreamLambdaBody: MonitorInput
) {
  const ruleTargets = {
    Rule: ruleName,
    Targets: [
      {
        Id: `${ruleName}-target`,
        Arn: downstreamLambdaArn,
        Input: JSON.stringify(downstreamLambdaBody),
      },
    ],
  };
  const target = await eventBridge.putTargets(ruleTargets).promise();
  return target;
}

async function addScheduleRule(
  ruleName: string,
  {
    intervalValue,
    intervalUnit,
    url,
  }: Partial<{
    intervalValue: number;
    intervalUnit: string;
    url: string;
  }>
) {
  const onScheduleRuleCfg = {
    Name: ruleName,
    ScheduleExpression: `rate(${intervalValue} ${intervalUnit})`,
    Description: new URL(url || "https://example.com").hostname,
  };
  const runOnScheduleRule = await eventBridge
    .putRule(onScheduleRuleCfg)
    .promise();
  return runOnScheduleRule;
}
