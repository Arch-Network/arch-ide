variable "region" {
  type    = string
  default = "us-east-1"
}

variable "domain_name" {
  type        = string
  description = "ide.arch.network"
}

variable "zone_name" {
  type        = string
  description = "arch.network."
}

variable "acm_certificate_arn" {
  type        = string
  description = "ACM cert ARN in us-east-1 for the CloudFront alias"
}

variable "api_origin_domain_name" {
  type        = string
  description = "ALB domain for API origin (e.g., arch-ide-alb-xxxx.us-east-1.elb.amazonaws.com)"
  default     = ""
}
