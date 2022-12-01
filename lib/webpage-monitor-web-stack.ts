import * as acm from "@aws-cdk/aws-certificatemanager";
import * as cloudfront from "@aws-cdk/aws-cloudfront";
import * as origins from "@aws-cdk/aws-cloudfront-origins";
import * as route53 from "@aws-cdk/aws-route53";
import * as s3 from "@aws-cdk/aws-s3";
import * as s3deploy from "@aws-cdk/aws-s3-deployment";
import * as cdk from "@aws-cdk/core";
import { CfnOutput, Duration, RemovalPolicy } from "@aws-cdk/core";

export class WebpageMonitorWebStack extends cdk.Stack {
  constructor(
    scope: cdk.Construct,
    id: string,
    props: cdk.StackProps & {
      certificate: acm.Certificate;
      domainName: string;
      recordName: string;
      zone: route53.IHostedZone;
    }
  ) {
    super(scope, id, props);

    const websiteBucket = new s3.Bucket(this, "WebsiteBucket", {
      websiteIndexDocument: "index.html",
      publicReadAccess: true,
      autoDeleteObjects: true,
      removalPolicy: RemovalPolicy.DESTROY,
    });

    const distribution = new cloudfront.Distribution(this, "Distribution", {
      defaultBehavior: {
        origin: new origins.S3Origin(websiteBucket),
      },
      domainNames: [props.domainName],
      certificate: props.certificate,
    });
    new route53.CnameRecord(this, "wwwCName", {
      domainName: distribution.distributionDomainName,
      zone: props.zone,
      ttl: Duration.minutes(1),
      recordName: props.recordName,
    });

    new s3deploy.BucketDeployment(this, "DeployWebsite", {
      sources: [s3deploy.Source.asset("./web")],
      destinationBucket: websiteBucket,
      distribution,
    });

    new CfnOutput(this, "WebsiteUrlOutput", {
      value: `https://${distribution.distributionDomainName}/index.html`,
      description: "Website URL",
    });
  }
}
