provider "aws" { region = var.region }

resource "random_id" "suffix" { byte_length = 4 }

resource "aws_s3_bucket" "frontend" {
  bucket = "arch-ide-frontend-${random_id.suffix.hex}"
}

resource "aws_s3_bucket_ownership_controls" "frontend" {
  bucket = aws_s3_bucket.frontend.id
  rule { object_ownership = "BucketOwnerPreferred" }
}

resource "aws_s3_bucket_public_access_block" "frontend" {
  bucket                  = aws_s3_bucket.frontend.id
  block_public_acls       = true
  block_public_policy     = true
  restrict_public_buckets = true
  ignore_public_acls      = true
}

resource "aws_cloudfront_origin_access_control" "oac" {
  name                              = "arch-ide-frontend-oac"
  description                       = "OAC for S3 frontend"
  origin_access_control_origin_type = "s3"
  signing_behavior                  = "always"
  signing_protocol                  = "sigv4"
}

resource "aws_cloudfront_distribution" "cdn" {
  enabled             = true
  default_root_object = "index.html"

  origin {
    domain_name              = aws_s3_bucket.frontend.bucket_regional_domain_name
    origin_id                = aws_s3_bucket.frontend.id
    origin_access_control_id = aws_cloudfront_origin_access_control.oac.id
  }

  dynamic "origin" {
    for_each = var.api_origin_domain_name != "" ? [1] : []
    content {
      domain_name = var.api_origin_domain_name
      origin_id   = "api-origin"
      custom_origin_config {
        http_port                = 80
        https_port               = 443
        origin_protocol_policy   = "http-only"
        origin_ssl_protocols     = ["TLSv1.2"]
        origin_read_timeout      = 60    # Maximum CloudFront allows
        origin_keepalive_timeout = 60
      }
    }
  }

  default_cache_behavior {
    target_origin_id       = aws_s3_bucket.frontend.id
    viewer_protocol_policy = "redirect-to-https"
    allowed_methods        = ["GET", "HEAD", "OPTIONS"]
    cached_methods         = ["GET", "HEAD"]
    compress               = true
    forwarded_values {
      query_string = false
      cookies { forward = "none" }
    }
  }

  dynamic "ordered_cache_behavior" {
    for_each = var.api_origin_domain_name != "" ? [1] : []
    content {
      path_pattern           = "/build"
      target_origin_id       = "api-origin"
      viewer_protocol_policy = "https-only"
      allowed_methods        = ["GET", "HEAD", "OPTIONS", "PUT", "POST", "PATCH", "DELETE"]
      cached_methods         = ["GET", "HEAD", "OPTIONS"]
      forwarded_values {
        query_string = true
        headers      = ["Accept", "Content-Type", "Origin", "Authorization"]
        cookies { forward = "none" }
      }
      min_ttl     = 0
      default_ttl = 0
      max_ttl     = 0
    }
  }

  dynamic "ordered_cache_behavior" {
    for_each = var.api_origin_domain_name != "" ? [1] : []
    content {
      path_pattern           = "/build/status/*"
      target_origin_id       = "api-origin"
      viewer_protocol_policy = "https-only"
      allowed_methods        = ["GET", "HEAD", "OPTIONS"]
      cached_methods         = ["GET", "HEAD", "OPTIONS"]
      forwarded_values {
        query_string = true
        headers      = ["Accept", "Content-Type", "Origin", "Authorization"]
        cookies { forward = "none" }
      }
      min_ttl     = 0
      default_ttl = 0
      max_ttl     = 0
    }
  }

  dynamic "ordered_cache_behavior" {
    for_each = var.api_origin_domain_name != "" ? [1] : []
    content {
      path_pattern           = "/deploy/*"
      target_origin_id       = "api-origin"
      viewer_protocol_policy = "https-only"
      allowed_methods        = ["GET", "HEAD", "OPTIONS"]
      cached_methods         = ["GET", "HEAD", "OPTIONS"]
      forwarded_values {
        query_string = true
        headers      = ["Accept", "Content-Type", "Origin", "Authorization"]
        cookies { forward = "none" }
      }
      min_ttl     = 0
      default_ttl = 0
      max_ttl     = 0
    }
  }

  dynamic "ordered_cache_behavior" {
    for_each = var.api_origin_domain_name != "" ? [1] : []
    content {
      path_pattern           = "/explorer/*"
      target_origin_id       = "api-origin"
      viewer_protocol_policy = "https-only"
      allowed_methods        = ["GET", "HEAD", "OPTIONS"]
      cached_methods         = ["GET", "HEAD", "OPTIONS"]
      forwarded_values {
        query_string = true
        headers      = ["Accept", "Content-Type", "Origin", "Authorization"]
        cookies { forward = "none" }
      }
      min_ttl     = 0
      default_ttl = 0
      max_ttl     = 0
    }
  }

  restrictions {
    geo_restriction { restriction_type = "none" }
  }

  aliases = [var.domain_name]

  viewer_certificate {
    acm_certificate_arn            = var.acm_certificate_arn
    ssl_support_method             = "sni-only"
    minimum_protocol_version       = "TLSv1.2_2021"
  }
}

data "aws_caller_identity" "current" {}

resource "aws_s3_bucket_policy" "frontend" {
  bucket = aws_s3_bucket.frontend.id
  policy = jsonencode({
    Version = "2012-10-17",
    Statement = [{
      Sid       = "AllowCloudFrontOACRead",
      Effect    = "Allow",
      Principal = { Service = "cloudfront.amazonaws.com" },
      Action    = ["s3:GetObject"],
      Resource  = "${aws_s3_bucket.frontend.arn}/*",
      Condition = {
        StringEquals = {
          "AWS:SourceArn" = "arn:aws:cloudfront::${data.aws_caller_identity.current.account_id}:distribution/${aws_cloudfront_distribution.cdn.id}"
        }
      }
    }]
  })
}

output "bucket_name" { value = aws_s3_bucket.frontend.bucket }
output "distribution_domain" { value = aws_cloudfront_distribution.cdn.domain_name }
output "distribution_id" { value = aws_cloudfront_distribution.cdn.id }
