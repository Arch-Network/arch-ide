variable "region" {
  description = "AWS region"
  type        = string
  default     = "us-east-1"
}

variable "service_name" {
  description = "ECS service/basename for arch-ide"
  type        = string
  default     = "arch-ide"
}

variable "rust_server_image" {
  description = "ECR image for arch-ide rust-server"
  type        = string
}

variable "arch_network_git" {
  description = "Git URL for arch-network (used by the compilation server to fetch SDK crates)"
  type        = string
  default     = "https://github.com/Arch-Network/arch-network"
}

variable "arch_network_rev" {
  description = "Immutable commit SHA for arch-network (preferred for stable compilation)"
  type        = string
  default     = "7675ee9b7d264fcc6c41c98909e4c47893147509"
}

variable "arch_network_branch" {
  description = "Optional branch pin for arch-network (used only if arch_network_rev is empty)"
  type        = string
  default     = ""
}

variable "github_token_secret_arn" {
  description = "Optional Secrets Manager ARN for a GitHub token (used to fetch private git dependencies)"
  type        = string
  default     = ""
}

variable "https_certificate_arn" {
  description = "ACM cert ARN for HTTPS (optional)"
  type        = string
  default     = ""
}

variable "desired_count" {
  description = "Desired count for rust-server service"
  type        = number
  default     = 1
}

variable "port" {
  description = "Container port for rust-server"
  type        = number
  default     = 8080
}
