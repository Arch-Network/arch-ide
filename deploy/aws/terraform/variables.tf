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
  description = "Git URL recorded on the task. The image build prefetches this repo; the running server does not clone it."
  type        = string
  default     = "https://github.com/Arch-Network/arch-network"
}

variable "arch_network_rev" {
  description = "Commit SHA baked into the image via ARCH_NETWORK_REV. Must match the image build or the server logs a mismatch and still uses the baked checkout."
  type        = string
  default     = "854713edfae969a86f217c1c1cdc673628faf54d"
}

variable "arch_network_branch" {
  description = "Optional branch pin for arch-network (used only if arch_network_rev is empty)"
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
