import type { Handler } from "aws-lambda";
import { SNS } from "aws-sdk";
import fetch from "node-fetch";
import { URL } from "url";

var sns = new SNS();

export interface MonitorInput {
  email: string;
  url: string;
  watchPhrase: string;
}

export const handler: Handler<MonitorInput> = async (event) => {
  try {
    const env = {
      EMAIL_ON_WEBPAGE_CHANGED_TOPIC:
        process.env.EMAIL_ON_WEBPAGE_CHANGED_TOPIC,
    };
    if (!env.EMAIL_ON_WEBPAGE_CHANGED_TOPIC) throw new Error("missing env var");
    const res = await fetch(event.url);
    if (!res.ok) throw new Error("Failed to fetch url");
    const page = await res.text();

    const pageHasChanged = !page.includes(event.watchPhrase);
    if (pageHasChanged) {
      console.log(
        `webpage changed, ${event.watchPhrase} not found anymore on ${event.url}`
      );
      await sns
        .publish({
          TopicArn: env.EMAIL_ON_WEBPAGE_CHANGED_TOPIC,
          Message: `Webpage ${event.url} changed. Watched phrase '${event.watchPhrase}' is not found on the webpage anymore`,
          Subject: `Webpage ${new URL(event.url).hostname} changed`,
          MessageAttributes: {
            email: {
              DataType: "String",
              StringValue: event.email,
            },
          },
        })
        .promise();
      console.log("published to sns");
    }

    return {
      body: "success",
      statusCode: 200,
    };
  } catch (error) {
    console.log(error);
    return {
      body: "error",
      statusCode: 500,
    };
  }
};
