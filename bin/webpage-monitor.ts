#!/usr/bin/env node
import * as cdk from "@aws-cdk/core";
import "source-map-support/register";
import { WebpageMonitorDomainStack } from "../lib/webpage-monitor-domain-stack";
import { WebpageMonitorStack } from "../lib/webpage-monitor-stack";
import { WebpageMonitorWebStack } from "../lib/webpage-monitor-web-stack";

const app = new cdk.App();
const env = {
  account: process.env.CDK_DEFAULT_ACCOUNT,
  region: process.env.CDK_DEFAULT_REGION,
};

const domain = new WebpageMonitorDomainStack(app, "WebpageMonitorDomainStack", {
  env,
});

new WebpageMonitorStack(app, "WebpageMonitorStack", {
  certificate: domain.backendCertificate,
  domainName: domain.backendDomainName,
  env,
});

new WebpageMonitorWebStack(app, "WebpageMonitorWebStack", {
  certificate: domain.frontendCertificate,
  domainName: domain.frontendDomainName,
  recordName: domain.frontendRecordName,
  zone: domain.zone,
  env,
});
