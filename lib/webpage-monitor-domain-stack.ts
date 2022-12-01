import * as acm from "@aws-cdk/aws-certificatemanager";
import * as route53 from "@aws-cdk/aws-route53";
import * as cdk from "@aws-cdk/core";

export class WebpageMonitorDomainStack extends cdk.Stack {
  public readonly frontendCertificate: acm.Certificate;
  public readonly frontendDomainName: string;
  public readonly frontendRecordName: string;
  public readonly backendCertificate: acm.Certificate;
  public readonly backendDomainName: string;
  public readonly zone: route53.HostedZone;

  constructor(scope: cdk.Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);
    this.frontendRecordName = "www";
    const backendRecordName = "api";
    const domainName = "typescriptteatime.com";

    this.zone = new route53.PublicHostedZone(this, "HostedZone", {
      zoneName: domainName,
      comment: "created with CDK",
    });
    this.frontendDomainName = `${this.frontendRecordName}.${this.zone.zoneName}`;
    this.frontendCertificate = new acm.Certificate(
      this,
      "FrontendCertificate",
      {
        domainName: this.frontendDomainName,
        validation: acm.CertificateValidation.fromDns(this.zone),
      }
    );

    this.backendDomainName = `${backendRecordName}.${this.zone.zoneName}`;
    this.backendCertificate = new acm.Certificate(this, "BackendCertificate", {
      domainName: this.backendDomainName,
      validation: acm.CertificateValidation.fromDns(this.zone),
    });
  }
}
